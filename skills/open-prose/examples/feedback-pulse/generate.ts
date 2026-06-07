// The Feedback Pulse example GENERATOR — produces a deterministic, replayable
// `replay/` state-dir by driving the REAL `@openprose/reactor` reconciler with
// deterministic fake renders (NO model key). It mirrors the inbox-triage
// generator's shape (a SELF-WRITTEN `beats.json` so a regen reproduces the
// committed `replay/` byte-for-byte) but stakes out a DIFFERENT architecture:
// rollup aggregation with SELF-DRIVEN weekly freshness.
//
// THE STORY (the architecture this example stakes out — faceted rollup
// aggregation + a self-driven `valid_until` weekly cadence):
//   A weekly "voice of customer" pulse stays current. Inbound product feedback
//   (feedback@agents.openprose.ai, a primitive.dev inbound inbox) is themed by a
//   cheap model into one of {pricing, performance, onboarding, integrations} with
//   a coarse sentiment, aggregated into a FACETED world-model (one facet per
//   theme), and a weekly pulse brief refreshes on a SELF-DRIVEN cadence even when
//   the inbox is quiet.
//
//   A `Feedback Inbox` gateway watches the inbound feed and exposes ONE FACET PER
//   INCOMING MESSAGE (`feedback:<id>`) plus a standing `week` clock. A
//   `Theme Tagger` per message subscribes to ONLY its own message facet ⇒ a new
//   message lights ONLY that tagger lane; the siblings stay DARK (the facet "dark
//   lane"). The taggers fan into a `Voice of Customer` aggregator that exposes ONE
//   FACET PER THEME (`pricing`/`performance`/`onboarding`/`integrations`) plus a
//   cheap `rollup` — so a new `pricing` complaint moves ONLY the `pricing` facet
//   and never wakes a consumer subscribed to a different theme. A terminal
//   `Weekly Pulse` requires the `rollup` facet AND the gateway's `week` clock.
//
//   THE TENET (the headline this example teaches): SELF-DRIVEN `valid_until`
//   freshness. The Weekly Pulse carries a `valid_until` that lapses on a weekly
//   cadence. When the `week` clock advances past `valid_until`, the pulse
//   refreshes and re-stamps `valid_until` — even when NO feedback arrived all
//   week — and because the brief's MATERIAL did not move (only the freshness
//   clock advanced), that continuity refresh costs ZERO fresh tokens. A
//   self-sourced `dag.tick` whose inputs have NOT moved and whose `valid_until`
//   has NOT lapsed memo-SKIPS at zero (the audit floor).
//
// It persists the full devtools state-dir shape so reactor-devtools can replay
// this example unchanged:
//
//   replay/receipts.json              (flat root append-only ledger trail)
//   replay/world-models/<hexNode>/…   (per-node published truth + history)
//   replay/compile/topology.json      (the flat TopologyWorldModel)
//   replay/compile/labels.json        (nodeId → friendly label)
//   replay/beats.json                 (the scripted beat timeline — SELF-WRITTEN)
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much MATERIAL actually
// moved. `surprise_cause` MUST equal the wake source. Same generator ⇒
// byte-identical state-dir.

import { createHash } from "node:crypto";
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
} from "@openprose/reactor/internals";

import type {
  ReconcilerTopology,
} from "@openprose/reactor/internals";
import type {
  RenderContext,
  RenderProduct,
} from "@openprose/reactor";

// ---------------------------------------------------------------------------
// Node identities.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.feedback-feed"; // the phantom edge: the raw inbound feed
const GATEWAY = "gateway.feedback-inbox"; // entry point; ONE facet per message + a `week` clock

const FEEDBACK_IDS = ["f1", "f2", "f3", "f4"] as const;
type FeedbackId = (typeof FEEDBACK_IDS)[number];

const TAGGER: Record<FeedbackId, string> = Object.fromEntries(
  FEEDBACK_IDS.map((id) => [id, `responsibility.theme-tagger-${id}`]),
) as Record<FeedbackId, string>;

const VOICE = "responsibility.voice-of-customer";
const PULSE = "responsibility.weekly-pulse";

const THEMES = ["pricing", "performance", "onboarding", "integrations"] as const;
type Theme = (typeof THEMES)[number];

// --- Facet tokens -----------------------------------------------------------

// One facet per incoming message on the gateway — the dark-lane boundary.
const FEEDBACK_FACET: Record<FeedbackId, Facet> = Object.fromEntries(
  FEEDBACK_IDS.map((id) => [id, `feedback:${id}`]),
) as Record<FeedbackId, Facet>;

// The standing weekly clock the pulse's freshness rides.
const WEEK_FACET: Facet = "week";

// One facet per THEME on the aggregator — the selective-wake boundary.
const THEME_FACET: Record<Theme, Facet> = {
  pricing: "pricing",
  performance: "performance",
  onboarding: "onboarding",
  integrations: "integrations",
};

// The cheap rollup facet the Weekly Pulse reads.
const ROLLUP_FACET: Facet = "rollup";

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label).
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [SOURCE]: "Feedback Feed",
  [GATEWAY]: "Feedback Inbox",
  [TAGGER.f1]: "Theme Tagger [f1]",
  [TAGGER.f2]: "Theme Tagger [f2]",
  [TAGGER.f3]: "Theme Tagger [f3]",
  [TAGGER.f4]: "Theme Tagger [f4]",
  [VOICE]: "Voice of Customer",
  [PULSE]: "Weekly Pulse",
};

// ---------------------------------------------------------------------------
// The scripted beat timeline — SELF-WRITTEN so regeneration is lossless.
// ---------------------------------------------------------------------------

const BEATS = {
  scenario: "feedback-pulse",
  title:
    "A weekly voice-of-customer pulse stays current — themed feedback aggregates into per-theme facets, and the brief refreshes on a self-driven weekly cadence even when the inbox is quiet.",
  beats: [
    {
      name: "cold-boot",
      park: 19,
      from: 0,
      to: 19,
      holdMs: 2800,
      caption:
        "the pulse graph lights up once · inbox → theme taggers → voice-of-customer → weekly pulse",
    },
    {
      name: "quiet",
      park: 31,
      from: 20,
      to: 31,
      holdMs: 2400,
      caption: "re-deliver the same feedback · every re-tick memo-skips · cost flat near zero",
    },
    {
      name: "self-skip",
      park: 33,
      from: 32,
      to: 33,
      holdMs: 2600,
      caption:
        "self-tick audit floor · the pulse re-checks itself · valid_until not yet lapsed · no edges, no cost",
    },
    {
      name: "pricing-spike",
      park: 39,
      from: 34,
      to: 39,
      holdMs: 3400,
      caption:
        "HERO: a fresh pricing complaint lands · ONLY the pricing theme facet moves · performance / onboarding / integrations stay dark",
    },
    {
      name: "weekly-refresh",
      park: 43,
      from: 40,
      to: 43,
      holdMs: 3600,
      caption:
        "the weekly clock advances past valid_until · the pulse refreshes on cadence · zero tokens (no new material moved)",
    },
    {
      name: "dedup-skip",
      park: 47,
      from: 44,
      to: 47,
      holdMs: 2800,
      caption:
        "a duplicate feedback (byte-identical) re-delivers · its tagger dedup-skips · nothing downstream wakes",
    },
    {
      name: "final-quiet",
      park: 63,
      from: 48,
      to: 63,
      holdMs: 2600,
      caption: "it goes quiet again · the pulse shipped · cost back to flat",
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// Deterministic fingerprint of a structured sub-value (own facet tokens).
// ---------------------------------------------------------------------------

function materialFingerprint(value: unknown): Fingerprint {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify(
          (value as Record<string, unknown>)[k],
        )}`,
    );
  return `{${entries.join(",")}}`;
}

// ---------------------------------------------------------------------------
// The cost model. `surprise_cause` MUST equal the wake source. A render whose
// MATERIAL did not move (e.g. a pure freshness re-stamp on a clock advance)
// burns ZERO fresh — the headline of this example. So unlike inbox-triage's
// `Math.max(1, …)`, `freshUnits === 0` is honored as a true zero-token refresh.
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 190;
const REUSED_FLOOR = 250;

function renderCost(ctx: RenderContext, freshUnits: number, reusedUnits = 0): Cost {
  return {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: {
      // freshUnits === 0 ⇒ a true zero-token refresh (the freshness cadence).
      fresh: freshUnits <= 0 ? 0 : Math.max(1, Math.round(freshUnits * FRESH_PER_UNIT)),
      reused: REUSED_FLOOR + reusedUnits * 40,
    },
    // The load-bearing invariant — read off the wake, NEVER hardcoded.
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// The feedback payload.
// ---------------------------------------------------------------------------

interface Feedback {
  readonly id: FeedbackId;
  readonly theme: Theme;
  readonly sentiment: "positive" | "neutral" | "negative";
  readonly quote: string;
  readonly rev: number;
}

interface Feed {
  readonly messages: Record<string, Feedback>;
  readonly week: number;
}

function seedFeed(): Feed {
  return {
    week: 1,
    messages: {
      f1: {
        id: "f1",
        theme: "onboarding",
        sentiment: "negative",
        quote: "The setup wizard lost my API key halfway through.",
        rev: 1,
      },
      f2: {
        id: "f2",
        theme: "performance",
        sentiment: "negative",
        quote: "Dashboards take eight seconds to load on a big workspace.",
        rev: 1,
      },
      f3: {
        id: "f3",
        theme: "integrations",
        sentiment: "positive",
        quote: "The new Slack integration is exactly what we needed.",
        rev: 1,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Reading upstream truth by reference (what a fake render does).
// ---------------------------------------------------------------------------

function readJson<T = Record<string, unknown>>(
  store: WorldModelStore,
  node: string,
  path = "truth.json",
): T | null {
  const read = store.read(node, "published");
  if (read.ref.version === null) return null;
  const bytes = read.files[path];
  if (bytes === undefined) return null;
  return JSON.parse(readTextFile(bytes)) as T;
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
// Canonicalizers (which facets a node's truth exposes).
// ---------------------------------------------------------------------------

const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["feed.json"];
  const feed: Feed =
    bytes === undefined
      ? { messages: {}, week: 0 }
      : (JSON.parse(readTextFile(bytes)) as Feed);
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [WEEK_FACET]: materialFingerprint(feed.week ?? null),
  };
  for (const id of FEEDBACK_IDS) {
    out[FEEDBACK_FACET[id]!] = materialFingerprint(feed.messages?.[id] ?? null);
  }
  return out;
};

// THE dark-lane boundary — independent per-message facet tokens + the `week`
// clock. An absent message fingerprints `null` (a fixed token) and stays dark.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const messages = (t["messages"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [WEEK_FACET]: materialFingerprint(t["week"] ?? null),
  };
  for (const id of FEEDBACK_IDS) {
    out[FEEDBACK_FACET[id]!] = materialFingerprint(messages[id] ?? null);
  }
  return out;
};

// THE selective-wake boundary — one facet per THEME, fingerprinting ONLY that
// theme's tally + top quotes. A new pricing complaint moves ONLY `pricing`; the
// other three theme facets stay byte-identical (dark). `?? null` keeps an empty
// theme dark.
const voiceCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const themes = (t["themes"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [ROLLUP_FACET]: materialFingerprint(t["rollup"] ?? null),
  };
  for (const theme of THEMES) {
    out[THEME_FACET[theme]!] = materialFingerprint(themes[theme] ?? null);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved).
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}

type Render = (ctx: RenderContext) => RenderProduct;

function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const feed = readJson<Feed>(deps.store, SOURCE, "feed.json") ?? {
      messages: {},
      week: 0,
    };
    const messages: Record<string, unknown> = {};
    let moved = 0;
    for (const id of FEEDBACK_IDS) {
      const m = feed.messages?.[id];
      if (m === undefined) continue;
      messages[id] = {
        id: m.id,
        theme: m.theme,
        sentiment: m.sentiment,
        quote: m.quote,
        rev: m.rev,
      };
      moved += 1;
    }
    return commit(
      { messages, week: feed.week, received: Object.keys(messages).length },
      renderCost(ctx, Math.max(1, moved), 1),
    );
  };
}

// A per-message theme tagger. Reads ITS OWN message slice off the gateway, tags
// it with a theme + sentiment, and carries the canonical quote through verbatim.
function taggerRender(deps: Deps, id: FeedbackId): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const messages = (gw?.["messages"] ?? {}) as Record<string, Feedback>;
    const me = messages[id] ?? null;
    if (me === null) {
      return commit({ feedback: id, tagged: false }, renderCost(ctx, 1, 1));
    }
    return commit(
      {
        feedback: id,
        tagged: true,
        theme: me.theme,
        sentiment: me.sentiment,
        quote: me.quote,
        rev: me.rev,
      },
      renderCost(ctx, 1, 1),
    );
  };
}

// The Voice of Customer aggregator: fans in every tagger, tallies by theme, and
// exposes one facet per theme + a cheap rollup.
function voiceRender(deps: Deps): Render {
  return (ctx) => {
    const byTheme: Record<
      string,
      { positive: number; neutral: number; negative: number; quotes: string[] }
    > = {};
    let total = 0;
    let movedThemes = 0;
    for (const id of FEEDBACK_IDS) {
      const tg = readJson(deps.store, TAGGER[id]!);
      if (tg === null || tg["tagged"] !== true) continue;
      const theme = tg["theme"] as Theme;
      const sentiment = tg["sentiment"] as "positive" | "neutral" | "negative";
      const quote = tg["quote"] as string;
      const slot = (byTheme[theme] ??= {
        positive: 0,
        neutral: 0,
        negative: 0,
        quotes: [],
      });
      slot[sentiment] += 1;
      slot.quotes.push(quote);
      total += 1;
    }
    const themes: Record<string, unknown> = {};
    const rollup: Record<string, number> = {};
    for (const theme of [...Object.keys(byTheme)].sort()) {
      const slot = byTheme[theme]!;
      slot.quotes.sort();
      themes[theme] = {
        counts: {
          positive: slot.positive,
          neutral: slot.neutral,
          negative: slot.negative,
        },
        total: slot.positive + slot.neutral + slot.negative,
        top_quotes: slot.quotes.slice(0, 2),
      };
      rollup[theme] = slot.positive + slot.neutral + slot.negative;
      movedThemes += 1;
    }
    return commit(
      { themes, rollup: { total, per_theme: rollup }, theme_count: movedThemes },
      // Fresh scales with the number of DISTINCT themes that carry feedback.
      renderCost(ctx, Math.max(1, movedThemes), 2),
    );
  };
}

// The terminal Weekly Pulse. Reads the cheap `rollup` facet of the aggregator and
// the gateway's `week` clock. It re-stamps `valid_until = week + 1` on every
// wake. When ONLY the week clock advanced (the rollup material is unchanged from
// its prior brief), the refresh moves NO new material ⇒ ZERO fresh tokens (the
// self-driven freshness cadence). When the rollup actually moved, it re-judges
// the brief and burns fresh.
function pulseRender(deps: Deps): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const week = (gw?.["week"] ?? 0) as number;

    const voice = readJson(deps.store, VOICE);
    const rollup = (voice?.["rollup"] ?? { total: 0, per_theme: {} }) as {
      total: number;
      per_theme: Record<string, number>;
    };

    // The brief CONTENT is a pure function of the rollup material only — NOT the
    // week clock. So a pure clock advance leaves the content stable.
    const ordered = Object.keys(rollup.per_theme)
      .sort((a, b) => rollup.per_theme[b]! - rollup.per_theme[a]! || a.localeCompare(b));
    const content = {
      headline: `weekly voice-of-customer pulse: ${rollup.total} signals across ${ordered.length} themes`,
      order: ordered,
      per_theme: rollup.per_theme,
      total: rollup.total,
    };

    // Did the brief CONTENT actually move vs the prior published brief? (A clock
    // advance with an unchanged rollup leaves content stable ⇒ a zero-token
    // freshness re-stamp.)
    const prior = readJson(deps.store, PULSE);
    const priorContent = (prior?.["pulse"] ?? null) as unknown;
    const contentMoved =
      priorContent === null ||
      stableStringify(priorContent) !== stableStringify(content);

    const freshUnits = contentMoved ? Math.max(1, ordered.length) : 0;

    return commit(
      {
        pulse: content,
        // Freshness: each brief carries the week it was last reviewed and a
        // valid_until that lapses one week later (the self-driven cadence).
        last_reviewed: week,
        valid_until: week + 1,
      },
      renderCost(ctx, freshUnits, 2),
    );
  };
}

// ---------------------------------------------------------------------------
// Topology assembly.
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
    requires: decl.requires
      .map((r) => `${r.producer}:${r.facet ?? ATOMIC_FACET}`)
      .sort(),
  });
}

function buildReconcilerTopology(decls: readonly NodeDecl[]): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const d of decls) contract_fingerprints[d.id] = contractFingerprint(d);

  const nodes: TopologyNode[] = decls.map((d) => ({
    node: d.id,
    contract_fingerprint: contract_fingerprints[d.id]!,
    wake_source: (d.kind === "gateway" ? "external" : "input") as WakeSource,
  }));
  const edges: TopologyEdge[] = decls.flatMap((d) =>
    d.requires.map((r) => ({
      subscriber: d.id,
      producer: r.producer,
      facet: r.facet ?? ATOMIC_FACET,
    })),
  );
  const entry_points = decls.filter((d) => d.kind === "gateway").map((d) => d.id);
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
    (adj.get(e.producer) ?? adj.set(e.producer, []).get(e.producer)!).push(
      e.subscriber,
    );
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
// The generator.
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Absolute path of the replay state-dir to (re)create. */
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
 * Build the deterministic Feedback Pulse `replay/` state-dir at `opts.stateDir`.
 * Drives the scripted beat timeline through the REAL reconciler over the
 * FileSystem store + ledger, then writes `compile/topology.json`,
 * `compile/labels.json`, and (LOSSLESSLY) `beats.json`. Re-running with the same
 * path reproduces the bytes.
 */
export function generateFeedbackPulseExample(opts: GenerateOptions): GenerateResult {
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
      requires: [{ producer: SOURCE, facet: ATOMIC_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    ...FEEDBACK_IDS.map<NodeDecl>((id) => ({
      id: TAGGER[id]!,
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: FEEDBACK_FACET[id]! }],
      render: taggerRender(deps, id),
      canonicalizer: atomicTruth,
    })),
    {
      id: VOICE,
      kind: "responsibility",
      requires: FEEDBACK_IDS.map((id) => ({ producer: TAGGER[id]! })),
      render: voiceRender(deps),
      canonicalizer: voiceCanon,
    },
    {
      id: PULSE,
      kind: "responsibility",
      requires: [
        { producer: VOICE, facet: ROLLUP_FACET },
        { producer: GATEWAY, facet: WEEK_FACET },
      ],
      render: pulseRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<
    string,
    { render: Render; canonicalizer: NodeDecl["canonicalizer"] }
  > = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  let feed: Feed = seedFeed();

  const publishAndWake = (): void => {
    const fm = files({ "feed.json": jsonFile(feed) });
    const commitRes = store.commitPublished(SOURCE, fm, ingressCanon);
    const prev = ledger.lastReceipt(SOURCE);
    const prevRef = prev !== null ? ledger.addressOf(prev) : null;
    const wake: Wake = { source: "external", refs: [] };
    ledger.append({
      node: SOURCE,
      contract_fingerprint: `contract:${SOURCE}@ingress`,
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

  const deliver = (m: Feedback): void => {
    feed = {
      ...feed,
      messages: { ...feed.messages, [m.id]: m },
    };
    publishAndWake();
  };

  // Advance the standing weekly clock — the self-driven `valid_until` cadence.
  // ONLY the `week` facet moves, so the gateway lights ONLY the weekly-pulse
  // lane (the freshness refresh), never a tagger.
  const advanceWeek = (): void => {
    feed = { ...feed, week: feed.week + 1 };
    publishAndWake();
  };

  // ======================================================================
  // The scripted beat timeline (mirrors BEATS above).
  // ======================================================================

  // --- Beat 1: COLD BOOT (seed feedback across 3 themes).
  publishAndWake();

  // --- Beat 2: QUIET STRETCH (byte-identical re-scans → whole graph SKIPS).
  publishAndWake();
  publishAndWake();

  // --- Beat 3: SELF-TICK FLOOR (self-sourced wake on the pulse; valid_until not
  // yet lapsed + rollup unmoved → a `self` skipped receipt at zero, the floor).
  dag.tick(PULSE);
  dag.tick(PULSE);

  // --- Beat 4: THE HERO (a fresh PRICING complaint → ONLY the pricing theme
  // facet moves; performance / onboarding / integrations stay dark).
  deliver({
    id: "f4",
    theme: "pricing",
    sentiment: "negative",
    quote: "The new per-seat pricing tripled our bill overnight.",
    rev: 1,
  });

  // --- Beat 5: WEEKLY REFRESH (the clock advances past valid_until → the pulse
  // refreshes on cadence; the rollup just moved in beat 4 so this advance carries
  // no NEW material into the brief content ⇒ a ZERO-token freshness re-stamp).
  advanceWeek();

  // --- Beat 6: DEDUP-SKIP (a byte-identical re-delivery of f4 → its tagger
  // dedup-skips, nothing downstream wakes).
  deliver({
    id: "f4",
    theme: "pricing",
    sentiment: "negative",
    quote: "The new per-seat pricing tripled our bill overnight.",
    rev: 1,
  });

  // A second self-tick floor after the refresh: valid_until is freshly stamped
  // and the rollup is unmoved → another `self` skip at zero.
  dag.tick(PULSE);

  // --- Beat 7: FINAL QUIET (byte-identical re-scans → back to flat).
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Persist the compile snapshot + the SELF-WRITTEN beats (lossless regen).
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
  writeFileSync(
    join(stateDir, "beats.json"),
    `${JSON.stringify(BEATS, null, 2)}\n`,
    "utf8",
  );

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [
      ...FEEDBACK_IDS.map((id) => FEEDBACK_FACET[id]!),
      WEEK_FACET,
      ...THEMES.map((t) => THEME_FACET[t]!),
      ROLLUP_FACET,
    ],
  };
}

// Allow `tsx generate.ts` / `node` invocation to (re)write the committed replay/.
if (require.main === module) {
  const here = join(__dirname, "replay");
  const result = generateFeedbackPulseExample({ stateDir: here });
  // eslint-disable-next-line no-console
  console.log(
    `feedback-pulse: wrote ${result.receiptsCount} receipts, ${result.nodeCount} nodes, ${result.edgeCount} edges → ${result.stateDir}`,
  );
}
