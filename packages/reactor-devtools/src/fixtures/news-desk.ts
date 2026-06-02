// The News Desk fixture GENERATOR — produces a deterministic, replayable
// `<state-dir>` whose flagship lesson is COST SCALES WITH SURPRISE. It is a
// sibling of `agent-observatory.ts` / `masked-relay.ts` and reuses ONLY the
// public, exported SDK primitives; no SDK change is required.
//
// THE STORY (what the recording must land):
//   12 wires, ~1,000 updates an hour. A "Wire Feeds" gateway watches a
//   normalized feed inbox and exposes ONE FACET PER SOURCE (reuters, ap,
//   bloomberg, …). Per source a Normalizer subscribes to ONLY its own feed
//   facet. All normalizers fan into a Dedup Cluster that keys stories by content
//   id and exposes a `story:<id>` facet per DISTINCT story (a DIAMOND: the SAME
//   story arriving on two wires collapses to ONE cluster render). A Topic Index
//   rolls the clusters up and exposes a `brief-gate` facet that moves ONLY when
//   the DISTINCT STORY SET changes — that gates the expensive Briefing summary.
//   A terminal Headline renders the lede.
//
//   The flagship beat arc:
//     cold-boot → LONG quiet (byte-identical feed re-ticks ⇒ the WHOLE graph
//     memo-SKIPS, the fresh meter flat near zero) → HERO: ONE feed carries a
//     real breaking story ⇒ one lit lane (source→cluster→briefing→headline),
//     the cost meter ticks ONCE off the flat line → DEDUP: the SAME story
//     arrives on a SECOND wire ⇒ the cluster dedupes it (the briefing does NOT
//     re-render) → quiet bookend.
//
// THE MECHANICAL FIX (the dark-lane is REAL): the gateway canonicalizer emits
// INDEPENDENT per-feed facet tokens. A reuters-only tick perturbs ONLY the
// `reuters` token; the eleven sibling tokens are byte-identical, so their
// normalizer lanes never wake. And the dedup cluster keys by CONTENT id, so a
// duplicate story (same id, different wire) re-renders the cluster to a
// BYTE-IDENTICAL truth ⇒ its `story:<id>` facet does not move ⇒ the briefing
// memo-skips. That dedup-no-op is the second half of "cost scales with surprise".
//
// It persists the SAME full state-dir shape agent-observatory does:
//
//   <state-dir>/receipts.json              (durable append-only ledger trail)
//   <state-dir>/world-models/<node>/…      (per-node published truth + history)
//   <state-dir>/compile/topology.json      (the flat TopologyWorldModel the SPA draws)
//   <state-dir>/compile/labels.json        (nodeId → friendly label for the SPA)
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much actually moved.
// Same generator ⇒ byte-identical state-dir ⇒ the devtools replays the same
// animation every time.

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  mountDag,
  createFileSystemStorageAdapter,
  files,
  jsonFile,
  ATOMIC_FACET,
  type Cost,
  type WakeSource,
  type Wake,
  type RenderContext,
  type RenderProduct,
} from "@openprose/reactor";

import {
  FileSystemWorldModelStore,
  FileSystemReceiptLedger,
  readTextFile,
  fingerprintArtifact,
  type WorldModelStore,
  type WorldModelFiles,
} from "@openprose/reactor/adapters";

import {
  zeroCost,
  createNullSignature,
  EMPTY_SEMANTIC_DIFF,
  type Fingerprint,
  type Facet,
  type TopologyWorldModel,
  type TopologyNode,
  type TopologyEdge,
  type ReconcilerTopology, asFacet, asFingerprint, asNodeId} from "@openprose/reactor/internals";

import { materialFingerprint, readJson } from "./_fixture-shared";

// ---------------------------------------------------------------------------
// Node identities (the labels the SPA shows come from the labels map below; the
// ids stay namespaced for the topology).
// ---------------------------------------------------------------------------

const SOURCE = "ingress.wire-feeds"; // the phantom edge: the normalized feed inbox
const GATEWAY = "gateway.wire-feeds"; // entry point; ONE facet per source

// The wires — the row of feeds that is mostly DARK in the hero beat. 12 sources,
// to land the "12 feeds" hook.
const FEEDS = [
  "reuters",
  "ap",
  "bloomberg",
  "afp",
  "dpa",
  "kyodo",
  "pti",
  "tass",
  "efe",
  "ansa",
  "yonhap",
  "xinhua",
] as const;
type Feed = (typeof FEEDS)[number];

const NORMALIZE: Record<Feed, string> = Object.fromEntries(
  FEEDS.map((f) => [f, `responsibility.normalize-${f}`]),
) as Record<Feed, string>;

const DEDUP_CLUSTER = "responsibility.dedup-cluster";
const TOPIC_INDEX = "responsibility.topic-index";
const BRIEFING = "responsibility.briefing";
const HEADLINE = "responsibility.headline";

// --- Facet tokens -----------------------------------------------------------

// One facet per feed on the gateway — the dark-lane boundary.
const FEED_FACET: Record<Feed, Facet> = Object.fromEntries(
  FEEDS.map((f) => [f, f]),
) as Record<Feed, Facet>;

// The distinct stories the cluster can surface. The cluster exposes one
// `story:<id>` facet per distinct story; a duplicate arrival keeps that facet
// BYTE-IDENTICAL (the dedup no-op).
const STORY_IDS = ["quake", "merger", "election", "launch"] as const;
type StoryId = (typeof STORY_IDS)[number];

const STORY_FACET: Record<StoryId, Facet> = Object.fromEntries(
  STORY_IDS.map((s) => [s, `story:${s}`]),
) as Record<StoryId, Facet>;

// The gating facet the Topic Index exposes to the expensive Briefing: it moves
// ONLY when the DISTINCT STORY SET changes (a real new event), not on every
// feed tick. That is why the Briefing stays dark on noise and only spikes once.
const BRIEF_GATE_FACET = asFacet("brief-gate");
// The cheap incremental facet the Headline reads — moves on every rollup.
const ROLLUP_FACET = asFacet("rollup");

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label).
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [SOURCE]: "Feed Inbox",
  [GATEWAY]: "Wire Feeds",
  ...Object.fromEntries(
    FEEDS.map((f) => [
      NORMALIZE[f],
      `Normalize [${f[0]!.toUpperCase()}${f.slice(1)}]`,
    ]),
  ),
  [DEDUP_CLUSTER]: "Dedup Cluster",
  [TOPIC_INDEX]: "Topic Index",
  [BRIEFING]: asFingerprint("Briefing"),
  [HEADLINE]: asFingerprint("Headline"),
};

// ---------------------------------------------------------------------------
// The cost model — what makes the token meter SING (the cost-meter hero shot)
// ---------------------------------------------------------------------------
//
// Fresh tokens scale with how much NEW material a render had to digest/produce;
// the parts it could reuse count as REUSED. The reconciler stamps `skipped`
// receipts with zeroCost automatically (fresh:0 — a flat line). The Briefing's
// fresh is deliberately heavy so the hero beat is a single tall spike off a flat
// line.
//
// `surprise_cause` MUST equal the wake source (receipt validation enforces it).

const FRESH_PER_UNIT = 180; // fresh tokens per unit of new material digested
const REUSED_FLOOR = 240; // reused tokens always carried (prior frame + contract)
const BRIEFING_FRESH_MULTIPLIER = 9; // the expensive node burns ~9× per unit

function renderCost(
  ctx: RenderContext,
  freshUnits: number,
  reusedUnits = 0,
  freshPerUnit = FRESH_PER_UNIT,
): Cost {
  return {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: {
      fresh: Math.max(1, Math.round(freshUnits * freshPerUnit)),
      reused: REUSED_FLOOR + reusedUnits * 40,
    },
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// The feed payload: a flat map of per-feed wire state. A "tick" re-publishes the
// inbox; a real story mutates exactly one feed's slice (so one feed facet moves).
// ---------------------------------------------------------------------------

interface WireItem {
  /** The content id — the dedup key. Two wires carrying the SAME story share it. */
  readonly story: StoryId;
  /** The wire's own dispatch sequence (NOT part of the canonical story). */
  readonly seq: number;
  /** The lede text the normalizer canonicalizes into the story payload. */
  readonly lede: string;
  /** When true, the wire payload is malformed — the normalizer throws on parse. */
  readonly corrupt?: boolean;
}

// The mutable feed inbox the generator drives. Keyed by feed → its latest item
// (null when the wire has carried nothing real yet — only the "heartbeat").
type FeedInbox = Record<Feed, WireItem | null>;

function seedInbox(): FeedInbox {
  // Cold boot: every wire is quiet (no real story yet). The normalizers render
  // once over an empty wire; the cluster has ZERO distinct stories; the briefing
  // renders a cold empty brief. That keeps the cold-boot briefing render SMALL,
  // so the cold-boot cascade does NOT plant a tall fresh spike that rivals the
  // hero beat — the hero's first real story is then the single tall spike off an
  // otherwise-flat line.
  return Object.fromEntries(FEEDS.map((f) => [f, null])) as FeedInbox;
}

// The canonical story payload a normalizer emits for a wire item. It is a PURE
// function of the STORY content (id + lede) — deliberately INDEPENDENT of which
// wire carried it and of the wire's own `seq`. That is the dedup mechanism: the
// SAME story on a second wire normalizes to a BYTE-IDENTICAL payload.
function canonicalStory(item: WireItem): { story: StoryId; lede: string } {
  return { story: item.story, lede: item.lede };
}

function readTruth(fm: WorldModelFiles): Record<string, unknown> {
  const bytes = fm["truth.json"];
  return bytes === undefined
    ? {}
    : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
}

function commit(world: unknown, cost: Cost): RenderProduct {
  return {
    world_model: files({ "truth.json": jsonFile(world) }),
    cost,
  };
}

// ---------------------------------------------------------------------------
// Canonicalizers (which facets a node's truth exposes)
// ---------------------------------------------------------------------------

const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
});

// The ingress source exposes one facet per feed — the fingerprint of ONLY that
// feed's slice. This is the root of the dark lane: mutate reuters' slice and
// only the `reuters` ingress facet moves.
const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["feed-inbox.json"];
  const inbox: Partial<FeedInbox> =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as FeedInbox);
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const f of FEEDS) {
    out[FEED_FACET[f]] = materialFingerprint(inbox[f] ?? null);
  }
  return out;
};

// THE dark-lane boundary. The gateway re-projects each feed slice into an
// INDEPENDENT facet token. A reuters-only tick moves ONLY `reuters`; the eleven
// sibling tokens are byte-identical to the prior frame, so the eleven sibling
// normalizer lanes stay dark.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const feeds = (t["feeds"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const f of FEEDS) {
    out[FEED_FACET[f]] = materialFingerprint(feeds[f] ?? null);
  }
  return out;
};

// The dedup cluster exposes one facet per DISTINCT story, plus a cheap rollup.
// A story appears iff ≥1 wire carries it; its facet token is the fingerprint of
// the CANONICAL story payload only — so a duplicate arrival (same id, different
// wire) leaves the `story:<id>` token byte-identical (the dedup no-op). This is
// what makes the Briefing memo-skip on the duplicate.
const clusterCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const stories = (t["stories"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const sid of STORY_IDS) {
    out[STORY_FACET[sid]] = materialFingerprint(stories[sid] ?? null);
  }
  return out;
};

// The Topic Index exposes TWO facets:
//   - `rollup`: the cheap incremental rollup the Headline reads (moves on every
//     topic-index render).
//   - `brief-gate`: the GATING facet the expensive Briefing reads. It is the
//     fingerprint of ONLY the DISTINCT STORY SET + each story's canonical lede —
//     so it moves iff a brand new story appears (a real event), NOT on a feed
//     heartbeat and NOT on a dedup no-op. That is why the Briefing stays dark on
//     noise.
const topicIndexCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [ROLLUP_FACET]: asFingerprint(materialFingerprint(t["rollup"] ?? null)),
    [BRIEF_GATE_FACET]: asFingerprint(materialFingerprint(t["story_digest"] ?? [])),
  };
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved)
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}

type Render = (ctx: RenderContext) => RenderProduct;

// The gateway: read the raw feed inbox, normalize into a per-feed view. The
// per-feed structure is what the canonicalizer projects into independent facet
// tokens.
function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const inbox =
      (readJson<Partial<FeedInbox>>(deps.store, SOURCE, "feed-inbox.json") ??
        {}) as Partial<FeedInbox>;
    const feeds: Record<string, unknown> = {};
    let moved = 0;
    for (const f of FEEDS) {
      const item = inbox[f] ?? null;
      feeds[f] = item
        ? { story: item.story, seq: item.seq, lede: item.lede, corrupt: item.corrupt ?? false }
        : null;
      if (item) moved += 1;
    }
    return commit({ feeds, watched: FEEDS.length }, renderCost(ctx, Math.max(1, moved), 1));
  };
}

// A feed normalizer: read ONLY its own feed slice off the gateway and emit the
// CANONICAL story payload (independent of wire identity + seq). A wire flagged
// corrupt makes the normalizer THROW (the fail beat) — a `failed` receipt, no
// downstream propagation, prior truth stands.
function normalizeRender(deps: Deps, feed: Feed): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const feeds = (gw?.["feeds"] ?? {}) as Record<string, WireItem | null>;
    const item = feeds[feed] ?? null;
    if (item && item.corrupt) {
      throw new Error(`${feed} normalizer: malformed wire dispatch for "${item.story}" (seq ${item.seq})`);
    }
    const canonical = item ? canonicalStory(item) : null;
    return commit(
      { feed, carries: canonical, has_story: canonical !== null },
      renderCost(ctx, 1, 1),
    );
  };
}

// The Dedup Cluster: fan in from all 12 normalizers, group the canonical story
// payloads by content id. The SAME story arriving on two wires collapses to ONE
// cluster entry (the diamond). The canonicalizer then exposes one `story:<id>`
// facet per distinct story — byte-identical across a duplicate arrival.
function clusterRender(deps: Deps): Render {
  return (ctx) => {
    const byStory = new Map<StoryId, { story: StoryId; lede: string; wires: string[] }>();
    let contributing = 0;
    for (const f of FEEDS) {
      const n = readJson(deps.store, NORMALIZE[f]);
      const canonical = (n?.["carries"] ?? null) as { story: StoryId; lede: string } | null;
      if (canonical === null) continue;
      contributing += 1;
      const existing = byStory.get(canonical.story);
      if (existing) {
        // Dedup: the wire is recorded for provenance but does NOT alter the
        // canonical (story, lede), so the `story:<id>` facet stays put.
        existing.wires.push(f);
      } else {
        byStory.set(canonical.story, { story: canonical.story, lede: canonical.lede, wires: [f] });
      }
    }
    // Emit a STABLE, wire-independent per-story payload (sorted wires only for
    // provenance; the canonicalizer keys on (story, lede), so provenance changes
    // do not move the facet token). Keyed by story id for the canonicalizer.
    const stories: Record<string, { story: StoryId; lede: string }> = {};
    for (const sid of STORY_IDS) {
      const c = byStory.get(sid);
      if (c) stories[sid] = { story: c.story, lede: c.lede };
    }
    const distinct = [...byStory.keys()].sort();
    return commit(
      {
        stories,
        distinct_stories: distinct,
        distinct_count: distinct.length,
        wire_count: contributing,
      },
      renderCost(ctx, Math.max(1, distinct.length), 2),
    );
  };
}

// The Topic Index: a cheap incremental rollup over the cluster. Two facets:
// `rollup` (moves every render) and `brief-gate` (moves ONLY when the distinct
// story set + its canonical ledes change — a real event).
function topicIndexRender(deps: Deps): Render {
  return (ctx) => {
    const cl = readJson(deps.store, DEDUP_CLUSTER);
    const stories = (cl?.["stories"] ?? {}) as Record<string, { story: string; lede: string }>;
    const distinct = (cl?.["distinct_stories"] ?? []) as string[];
    // The brief-gate digest: ONLY (id, lede) per distinct story, sorted — wire
    // counts / provenance deliberately excluded so heartbeats + dedups don't move it.
    const storyDigest = distinct
      .map((sid) => ({ story: sid, lede: stories[sid]?.lede ?? "" }))
      .sort((a, b) => (a.story < b.story ? -1 : 1));
    return commit(
      {
        rollup: { topics: distinct, topic_count: distinct.length },
        story_digest: storyDigest,
        topic_count: distinct.length,
      },
      renderCost(ctx, Math.max(1, distinct.length), 2),
    );
  };
}

// The Briefing: the EXPENSIVE node. It subscribes to ONLY the `brief-gate`
// facet, so it stays DARK on feed heartbeats AND on dedup no-ops, and wakes only
// when a real new story lands — then it burns the single tall fresh spike,
// re-writing the morning brief over the full story set.
function briefingRender(deps: Deps): Render {
  return (ctx) => {
    const ti = readJson(deps.store, TOPIC_INDEX);
    const digest = (ti?.["story_digest"] ?? []) as { story: string; lede: string }[];
    const sections = digest.map((d, i) => ({
      rank: i + 1,
      story: d.story,
      paragraph: `${d.lede} — full briefing for ${d.story}.`,
    }));
    // The heavy fresh: it re-writes EVERY section of the brief from scratch.
    const freshUnits = Math.max(1, sections.length) * 3;
    return commit(
      { sections, section_count: sections.length },
      renderCost(ctx, freshUnits, 3, FRESH_PER_UNIT * BRIEFING_FRESH_MULTIPLIER),
    );
  };
}

// The terminal Headline: renders the lede off the cheap rollup facet of the
// index + the briefing's atomic truth.
function headlineRender(deps: Deps): Render {
  return (ctx) => {
    const ti = readJson(deps.store, TOPIC_INDEX);
    const br = readJson(deps.store, BRIEFING);
    const rollup = (ti?.["rollup"] ?? {}) as Record<string, unknown>;
    const sections = (br?.["sections"] ?? []) as { story: string }[];
    return commit(
      {
        headline: `morning brief: ${(rollup["topic_count"] as number) ?? 0} stories`,
        lead_story: sections[0]?.story ?? "(none)",
        topics: rollup["topics"] ?? [],
      },
      renderCost(ctx, 1, 2),
    );
  };
}

// ---------------------------------------------------------------------------
// Topology assembly
// ---------------------------------------------------------------------------

interface NodeDecl {
  readonly id: string;
  readonly kind: "gateway" | "responsibility";
  readonly requires: readonly { producer: string; facet?: Facet }[];
  readonly render: Render;
  readonly canonicalizer: (fm: WorldModelFiles) => Record<string, Fingerprint>;
}

function contractFingerprint(decl: NodeDecl): Fingerprint {
  return materialFingerprint({
    kind: decl.kind,
    id: decl.id,
    requires: decl.requires.map((r) => `${r.producer}:${r.facet ?? ATOMIC_FACET}`).sort(),
  });
}

function buildReconcilerTopology(decls: readonly NodeDecl[]): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const d of decls) contract_fingerprints[d.id] = contractFingerprint(d);

  const nodes: TopologyNode[] = decls.map((d) => ({
    node: asNodeId(d.id),
    contract_fingerprint: contract_fingerprints[d.id]!,
    wake_source: (d.kind === "gateway" ? "external" : "input") as WakeSource,
  }));
  const edges: TopologyEdge[] = decls.flatMap((d) =>
    d.requires.map((r) => ({
      subscriber: asNodeId(d.id),
      producer: asNodeId(r.producer),
      facet: r.facet ?? ATOMIC_FACET,
    })),
  );
  const entry_points = decls.filter((d) => d.kind === "gateway").map((d) => asNodeId(d.id));
  const declared = new Set(decls.map((d) => d.id));
  const topology: TopologyWorldModel = {
    nodes,
    edges,
    entry_points,
    acyclic: isAcyclic(declared, edges),
  };
  return { topology, contract_fingerprints };
}

function isAcyclic(
  declared: ReadonlySet<string>,
  edges: readonly { subscriber: string; producer: string }[],
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!declared.has(e.producer) || !declared.has(e.subscriber)) continue;
    (adj.get(e.producer) ?? adj.set(e.producer, []).get(e.producer)!).push(e.subscriber);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return false;
    if (state.get(n) === 2) return true;
    state.set(n, 1);
    for (const next of adj.get(n) ?? []) if (!visit(next)) return false;
    state.set(n, 2);
    return true;
  };
  for (const n of declared) if (!visit(n)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Absolute path of the state-dir to (re)create. */
  readonly stateDir: string;
  /** Wipe an existing dir first (default true) for a clean, deterministic build. */
  readonly clean?: boolean;
}

export interface GenerateResult {
  readonly stateDir: string;
  readonly receiptsCount: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly facets: readonly Facet[];
}

/**
 * Build the deterministic News Desk state-dir at `opts.stateDir`. Drives the
 * scripted beat timeline through the REAL reconciler over the FileSystem store +
 * ledger, then writes `compile/topology.json` + `compile/labels.json`.
 * Re-running with the same path reproduces the bytes.
 */
export function generateNewsDeskFixture(opts: GenerateOptions): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  const worldModelDir = join(stateDir, "world-models");
  const store = new FileSystemWorldModelStore({ directory: worldModelDir });
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });

  const deps: Deps = { store };

  const decls: NodeDecl[] = [
    {
      id: GATEWAY,
      kind: "gateway",
      // The gateway watches the whole feed inbox (atomic): any feed slice moving
      // wakes it; its canonicalizer then splits the change into per-feed facets.
      requires: [{ producer: SOURCE, facet: ATOMIC_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    // Twelve feed normalizers — each subscribes to ONLY its own feed facet.
    ...FEEDS.map<NodeDecl>((f) => ({
      id: NORMALIZE[f],
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: FEED_FACET[f] }],
      render: normalizeRender(deps, f),
      canonicalizer: atomicTruth,
    })),
    {
      id: DEDUP_CLUSTER,
      kind: "responsibility",
      // DIAMOND fan-in from all twelve normalizers (atomic) — it dedupes by id.
      requires: FEEDS.map((f) => ({ producer: NORMALIZE[f] })),
      render: clusterRender(deps),
      canonicalizer: clusterCanon,
    },
    {
      id: TOPIC_INDEX,
      kind: "responsibility",
      // Fans in from the cluster (atomic) — it rolls up + emits the brief-gate.
      requires: [{ producer: DEDUP_CLUSTER }],
      render: topicIndexRender(deps),
      canonicalizer: topicIndexCanon,
    },
    {
      id: BRIEFING,
      kind: "responsibility",
      // Subscribes to ONLY the gating facet — stays dark unless a new story
      // appears. This is what makes the expensive node batch + dedup-skip.
      requires: [{ producer: TOPIC_INDEX, facet: BRIEF_GATE_FACET }],
      render: briefingRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: HEADLINE,
      kind: "responsibility",
      // Reads the cheap rollup facet of the index + the briefing's atomic truth.
      requires: [
        { producer: TOPIC_INDEX, facet: ROLLUP_FACET },
        { producer: BRIEFING },
      ],
      render: headlineRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  // The mutable feed inbox the generator drives.
  const inbox: FeedInbox = seedInbox();
  // Per-feed heartbeat counter — bumping it re-publishes the inbox WITHOUT
  // changing any canonical story (a noisy no-op tick). Heartbeats live OUTSIDE
  // the inbox payload so they don't perturb a feed facet — they exist only to
  // model "1,000 updates an hour" of churn that all memo-skips.

  // Re-publish the feed inbox and wake the gateway. When `inbox` is
  // byte-identical to the prior publish, the gateway memo-skips and the whole
  // graph below it memo-skips too (the quiet-world re-wake — reWakeUnchanged).
  const publishAndWake = (): void => {
    const fm = files({ "feed-inbox.json": jsonFile(inbox) });
    const commitRes = store.commitPublished(SOURCE, fm, ingressCanon);
    const prev = ledger.lastReceipt(SOURCE);
    const prevRef = prev !== null ? ledger.addressOf(prev) : null;
    const wake: Wake = { source: "external", refs: [] };
    ledger.append({
      node: asNodeId(SOURCE),
      contract_fingerprint: asFingerprint(`contract:${SOURCE}@ingress`),
      wake,
      input_fingerprints: [],
      fingerprints: commitRes.fingerprints,
      semantic_diff: EMPTY_SEMANTIC_DIFF,
      prev: prevRef,
      status: "rendered",
      cost: zeroCost("external"),
      sig: createNullSignature(),
    });
    dag.ingest(GATEWAY);
  };

  // Deliver a real story on a single wire (mutate exactly one feed's slice ⇒
  // exactly one feed facet moves). `seq` is bumped so the wire's raw slice moves
  // (the gateway sees it), but the normalizer's CANONICAL payload depends only on
  // (story, lede) ⇒ a duplicate of the same story on a 2nd wire produces a
  // byte-identical cluster facet (the dedup no-op).
  const deliverStory = (
    feed: Feed,
    story: StoryId,
    lede: string,
    opts2: { corrupt?: boolean } = {},
  ): void => {
    const prev = inbox[feed];
    inbox[feed] = {
      story,
      seq: (prev?.seq ?? 0) + 1,
      lede,
      corrupt: opts2.corrupt ?? false,
    };
    publishAndWake();
  };

  // ======================================================================
  // The scripted beat timeline (COST SCALES WITH SURPRISE).
  // ======================================================================

  // --- Beat 1: COLD BOOT. Seed the empty inbox; every node renders once — a
  // full flash cascade across all 17 nodes (the graph "lighting up" once). The
  // cluster has zero stories; the briefing renders a cold empty brief (cheap).
  publishAndWake();

  // --- Beat 2: LONG QUIET. Byte-identical re-scans: the WHOLE graph memo-SKIPS —
  // a long field of dim skip pulses, the fresh-line flat near zero. This is the
  // "1,000 updates an hour that all change nothing" half of the pitch: every
  // re-tick is byte-identical ⇒ every node memo-skips ⇒ cost stays flat.
  for (let i = 0; i < 8; i++) publishAndWake();

  // --- Beat 3: SELF-TICK FLOOR. A lone self-sourced wake on the Briefing in the
  // quiet world. Its gating input has not moved ⇒ a `self` skipped receipt that
  // lights no edges and costs ~nothing (the audit floor).
  dag.tick(BRIEFING);
  dag.tick(BRIEFING);

  // a little more quiet so the floor reads as flat before the surprise.
  for (let i = 0; i < 3; i++) publishAndWake();

  // --- Beat 4: THE HERO. ONE feed (reuters) carries a real breaking story. ONLY
  // the `reuters` feed facet moves ⇒ ONLY the Reuters Normalizer lane lights; the
  // eleven sibling lanes stay DARK. The cluster gains its FIRST distinct story ⇒
  // the brief-gate moves ⇒ the Briefing fires the single tall fresh spike off the
  // flat line; the Headline updates. (source→cluster→briefing→headline, lit once.)
  deliverStory("reuters", "quake", "7.1 quake strikes off the coast");

  // --- Beat 5: THE DEDUP (DIAMOND). The SAME story ("quake") arrives on a SECOND
  // wire (ap). The `ap` feed facet moves (its raw slice changed) ⇒ the AP
  // Normalizer lane lights and the cluster IS woken — but the normalizer emits the
  // BYTE-IDENTICAL canonical story, so the cluster's `story:quake` facet does NOT
  // move ⇒ the brief-gate does NOT move ⇒ the BRIEFING MEMO-SKIPS. The duplicate
  // costs nothing downstream of the cluster. THIS is the dedup no-op.
  deliverStory("ap", "quake", "7.1 quake strikes off the coast");

  // --- Beat 6: MORE QUIET. Byte-identical re-ticks — back to flat. The dup is
  // behind us; the world is steady at 1 distinct story.
  for (let i = 0; i < 3; i++) publishAndWake();

  // --- Beat 7: SECOND REAL EVENT. A different feed (bloomberg) carries a NEW
  // distinct story ("merger"). brief-gate moves again ⇒ a SECOND briefing spike.
  // (Confirms the meter tracks SURPRISE, not feed volume.)
  deliverStory("bloomberg", "merger", "two carriers announce a merger");

  // --- Beat 8: FAIL. A corrupt wire dispatch on afp — the AFP Normalizer THROWS
  // ⇒ a `failed` receipt (red node), no downstream lights, prior truth stands.
  deliverStory("afp", "election", "results contested in three districts", { corrupt: true });

  // --- Beat 9: RECOVER. The next afp dispatch parses cleanly, carrying the
  // "election" story ⇒ the AFP Normalizer flashes green; a THIRD distinct story
  // lands ⇒ a third briefing spike.
  deliverStory("afp", "election", "results contested in three districts");

  // --- Beat 10: FINAL QUIET. Byte-identical re-scans — back to dim pulses, flat
  // line (the bookend: it goes quiet again). LONG enough that the last briefing
  // spike scrolls fully out of the sparkline window, so the bookend reads
  // genuinely flat near zero — the inverse of the spike.
  for (let i = 0; i < 9; i++) publishAndWake();

  // --- Persist the topology snapshot (MANDATORY for replay) ----------------
  const compileDir = join(stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "topology.json"),
    `${JSON.stringify(reconcilerTopology.topology, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(compileDir, "labels.json"),
    `${JSON.stringify(LABELS, null, 2)}\n`,
    "utf8",
  );

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [
      ...FEEDS.map((f) => FEED_FACET[f]),
      ...STORY_IDS.map((s) => STORY_FACET[s]),
      ROLLUP_FACET,
      BRIEF_GATE_FACET,
    ],
  };
}
