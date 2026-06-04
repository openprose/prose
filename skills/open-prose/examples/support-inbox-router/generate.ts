// The Support Inbox Router example GENERATOR — produces a deterministic,
// replayable `replay/` state-dir by driving the REAL `@openprose/reactor`
// reconciler with deterministic fake renders (NO model key). It mirrors the
// inbox-triage generator's shape (LOSSLESS regeneration: it SELF-WRITES
// `beats.json`) and adapts the node graph to THIS example's architecture —
// a cheap spam gate + a faceted router whose facets are channels.
//
// THE STORY (the architecture this example stakes out — a cheap spam gate +
// a faceted channel router):
//
//   A `Support Inbox` gateway watches the inbound support address
//   (support@agents.openprose.ai, a primitive.dev inbound inbox) and exposes
//   ONE FACET PER INBOUND EMAIL (`email:<id>`). A `Triage` responsibility per
//   email subscribes to ONLY its own email facet — a CHEAP filter/tagger
//   (the cheap classifier role; ### Runtime model anthropic/claude-haiku-4-5)
//   that decides spam | ham, and for ham assigns a CHANNEL in
//   {bug, feature, docs, billing} and carries the canonical {subject, body}
//   through VERBATIM. Each triage exposes a `#### routed` facet that is the
//   fingerprint of {channel, canonical content} when ham — and NULL when spam.
//
//   THE SPAM TENET: a spam email leaves its `#### routed` facet UNMOVED (null)
//   ⇒ it wakes NOTHING downstream. The cheap filter is the only spend; the
//   whole graph goes dark on junk.
//
//   The `Router` fans in every triage's `routed` facet and CATALOGUES into a
//   faceted world-model with ONE FACET PER CHANNEL: `#### bug-reports`,
//   `#### feature-requests`, `#### docs-questions`, `#### billing`. Each
//   channel facet is the fingerprint of ONLY that channel's catalogued set —
//   so a message routed to `docs` moves ONLY `#### docs-questions`. A cheap
//   `#### rollup` facet carries the per-channel tally.
//
//   THE CHANNEL TENET: downstream channel listeners each subscribe to EXACTLY
//   ONE router facet — a docs question never wakes the bug board.
//     * `docs-gap-tracker`  <- docs-questions   (self-driven valid_until +1 bday)
//     * `bug-board`         <- bug-reports
//     * `roadmap-signals`   <- feature-requests
//   `#### billing` has NO downstream listener ON PURPOSE — a facet is a
//   subscription SYMBOL and may have zero consumers (it just stays dark).
//
// It persists the full devtools state-dir shape:
//
//   replay/receipts.json              (flat root append-only ledger trail)
//   replay/world-models/<hexNode>/…   (per-node published truth + history)
//   replay/compile/topology.json      (the flat TopologyWorldModel)
//   replay/compile/labels.json        (nodeId → friendly label)
//   replay/beats.json                 (the scripted beat timeline — SELF-WRITTEN)
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much actually moved;
// `surprise_cause` is read OFF the wake, NEVER hardcoded. Same generator ⇒
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

import type { ReconcilerTopology } from "@openprose/reactor/internals";
import type { RenderContext, RenderProduct } from "@openprose/reactor";

// ---------------------------------------------------------------------------
// Node identities.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.support-feed"; // the phantom edge: the inbound support feed
const GATEWAY = "gateway.support-inbox"; // entry point; ONE facet per inbound email

// The fixed inbound set. Channels: bug | feature | docs | billing | spam.
const EMAIL_IDS = [
  "b1", // bug (cold boot)
  "f1", // feature (cold boot)
  "d1", // docs (cold boot)
  "sp1", // spam (beat 3 — the hero of the dark graph)
  "d2", // docs (beat 4 — docs-only selective wake)
  "b2", // bug (beat 5 — bug-only selective wake)
] as const;
type EmailId = (typeof EMAIL_IDS)[number];

const TRIAGE: Record<EmailId, string> = Object.fromEntries(
  EMAIL_IDS.map((id) => [id, `responsibility.triage-${id}`]),
) as Record<EmailId, string>;

const ROUTER = "responsibility.router";

// The channels — the router's facets and the subscription symbols downstream
// listeners select on.
const CHANNELS = ["bug", "feature", "docs", "billing"] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_FACET: Record<Channel, Facet> = {
  bug: "bug-reports",
  feature: "feature-requests",
  docs: "docs-questions",
  billing: "billing",
};

const ROLLUP_FACET: Facet = "rollup";

// Downstream channel listeners. `billing` has NO listener on purpose.
const DOCS_GAP_TRACKER = "responsibility.docs-gap-tracker"; // <- docs-questions
const BUG_BOARD = "responsibility.bug-board"; // <- bug-reports
const ROADMAP_SIGNALS = "responsibility.roadmap-signals"; // <- feature-requests

// One facet per inbound email on the gateway — the dark-lane boundary.
const EMAIL_FACET: Record<EmailId, Facet> = Object.fromEntries(
  EMAIL_IDS.map((id) => [id, `email:${id}`]),
) as Record<EmailId, Facet>;

// The triage's single material facet: the routed slice ({channel, content}),
// NULL when spam.
const ROUTED_FACET: Facet = "routed";

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label).
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [SOURCE]: "Support Feed",
  [GATEWAY]: "Support Inbox",
  [TRIAGE.b1]: "Triage [bug]",
  [TRIAGE.f1]: "Triage [feature]",
  [TRIAGE.d1]: "Triage [docs]",
  [TRIAGE.sp1]: "Triage [spam]",
  [TRIAGE.d2]: "Triage [docs #2]",
  [TRIAGE.b2]: "Triage [bug #2]",
  [ROUTER]: "Channel Router",
  [DOCS_GAP_TRACKER]: "Docs Gap Tracker",
  [BUG_BOARD]: "Bug Board",
  [ROADMAP_SIGNALS]: "Roadmap Signals",
};

// ---------------------------------------------------------------------------
// The scripted beat timeline — SELF-WRITTEN so regeneration is lossless.
// ---------------------------------------------------------------------------

const BEATS = {
  scenario: "support-inbox-router",
  title:
    "A cheap spam gate makes the graph dark on junk; a faceted router turns one inbox into selective channels.",
  beats: [
    {
      name: "cold-boot",
      park: 12,
      from: 0,
      to: 12,
      holdMs: 2800,
      caption:
        "the support inbox lights once · gateway → triage → router → channel listeners",
    },
    {
      name: "quiet",
      park: 24,
      from: 13,
      to: 24,
      holdMs: 2400,
      caption: "byte-identical re-scan · the whole graph SKIPS · cost flat near zero",
    },
    {
      name: "spam-dark",
      park: 28,
      from: 25,
      to: 28,
      holdMs: 3800,
      caption:
        "HERO: a spam email · the cheap filter renders · its `routed` facet stays NULL · the router and every channel listener stay DARK",
    },
    {
      name: "docs-only",
      park: 34,
      from: 29,
      to: 34,
      holdMs: 3400,
      caption:
        "a docs question · the router moves ONLY docs-questions · ONLY the docs gap tracker wakes · the bug board and roadmap stay dark",
    },
    {
      name: "bug-only",
      park: 40,
      from: 35,
      to: 40,
      holdMs: 3400,
      caption:
        "a bug report · the router moves ONLY bug-reports · ONLY the bug board wakes",
    },
    {
      name: "self-tick",
      park: 42,
      from: 41,
      to: 42,
      holdMs: 2600,
      caption:
        "self-tick audit floor · the docs gap tracker re-checks its valid_until · inputs unmoved · no edges, no cost",
    },
    {
      name: "docs-dedup",
      park: 46,
      from: 43,
      to: 46,
      holdMs: 3200,
      caption:
        "a duplicate docs question · same canonical content · docs-questions does NOT move · the docs gap tracker dedup-skips",
    },
    {
      name: "final-quiet",
      park: 58,
      from: 47,
      to: 58,
      holdMs: 2600,
      caption: "it goes quiet again · billing never had a consumer · cost back to flat",
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
// The cost model. `surprise_cause` MUST equal the wake source.
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 160;
const REUSED_FLOOR = 220;

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
    // The load-bearing invariant — read off the wake, NEVER hardcoded.
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// The support-feed payload.
// ---------------------------------------------------------------------------

interface Email {
  readonly id: EmailId;
  readonly from: string;
  readonly subject: string;
  readonly body: string;
  /** Ground truth used by the deterministic fake filter (the model infers it live). */
  readonly kind: Channel | "spam";
  readonly rev: number;
}

type Feed = Record<string, Email>;

function seedFeed(): Feed {
  return {
    b1: {
      id: "b1",
      from: "dev@acme.test",
      subject: "Crash on export to CSV",
      body: "Clicking Export throws a 500 every time on accounts with > 10k rows.",
      kind: "bug",
      rev: 1,
    },
    f1: {
      id: "f1",
      from: "pm@acme.test",
      subject: "Please add a dark mode",
      body: "Our team works late; a dark theme would cut eye strain a lot.",
      kind: "feature",
      rev: 1,
    },
    d1: {
      id: "d1",
      from: "newuser@acme.test",
      subject: "How do I rotate an API key?",
      body: "I can't find where to rotate keys in the docs. What's the endpoint?",
      kind: "docs",
      rev: 1,
    },
  };
}

// The duplicate docs question (beat 7) — DIFFERENT id + from, SAME canonical
// subject + body as d2, so the docs channel does NOT move.
const DOCS2_SUBJECT = "Where is the rate-limit documented?";
const DOCS2_BODY =
  "Talk to us couldn't answer my rate-limit question — which page covers limits?";

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
  const bytes = fm["support-feed.json"];
  const feed: Feed =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as Feed);
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
  };
  for (const id of EMAIL_IDS) {
    out[EMAIL_FACET[id]!] = materialFingerprint(feed[id] ?? null);
  }
  return out;
};

// THE dark-lane boundary — independent per-email facet tokens on the gateway.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const emails = (t["emails"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
  };
  for (const id of EMAIL_IDS) {
    out[EMAIL_FACET[id]!] = materialFingerprint(emails[id] ?? null);
  }
  return out;
};

// THE spam boundary — the triage exposes ONE `routed` facet that fingerprints
// ONLY the routed slice ({channel, canonical content}) when ham, and NULL when
// spam. A spam email's `routed` facet is the fixed `materialFingerprint(null)`
// token, so it never moves and wakes nothing downstream.
const triageCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const routed = t["routed"] ?? null; // null when spam (or no email)
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [ROUTED_FACET]: materialFingerprint(routed),
  };
};

// THE channel boundary — one facet per channel, each the fingerprint of ONLY
// that channel's catalogued set. A message routed to `docs` moves ONLY
// `docs-questions`. A channel with no current members fingerprints `null` and
// stays dark (e.g. `billing`, which never receives a message AND has no
// downstream consumer).
const routerCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const channels = (t["channels"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [ROLLUP_FACET]: materialFingerprint(t["rollup"] ?? null),
  };
  for (const ch of CHANNELS) {
    out[CHANNEL_FACET[ch]] = materialFingerprint(channels[ch] ?? null);
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
    const feed = (readJson<Feed>(deps.store, SOURCE, "support-feed.json") ??
      {}) as Feed;
    const emails: Record<string, unknown> = {};
    let moved = 0;
    for (const id of EMAIL_IDS) {
      const e = feed[id];
      if (e === undefined) continue;
      emails[id] = {
        id: e.id,
        from: e.from,
        subject: e.subject,
        body: e.body,
        kind: e.kind,
        rev: e.rev,
      };
      moved += 1;
    }
    return commit(
      { emails, received: Object.keys(emails).length },
      renderCost(ctx, Math.max(1, moved), 1),
    );
  };
}

// THE CHEAP SPAM/CONTENT FILTER + ROUTER TAG. Subscribes to its own email facet
// ONLY. Decides spam | ham; for ham assigns the channel and carries the
// canonical {subject, body} through VERBATIM. The `routed` facet is NULL when
// spam — so spam wakes nothing.
function triageRender(deps: Deps, id: EmailId): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const emails = (gw?.["emails"] ?? {}) as Record<string, Email>;
    const me = emails[id] ?? null;
    if (me === null) {
      return commit({ email: id, seen: false, routed: null }, renderCost(ctx, 1, 1));
    }
    // The cheap filter's decision. (The live test drives this with a model; the
    // deterministic fixture reads the ground-truth `kind`.)
    const isSpam = me.kind === "spam";
    if (isSpam) {
      // Spam: render a `spam` verdict, but DO NOT populate `routed` — the
      // `routed` facet stays at the NULL token, so nothing downstream wakes.
      return commit(
        {
          email: id,
          decision: "spam",
          reason: "no actionable support request",
          routed: null,
        },
        renderCost(ctx, 1, 1),
      );
    }
    const channel = me.kind as Channel;
    return commit(
      {
        email: id,
        decision: "ham",
        // The routed slice the router catalogues — channel + canonical content,
        // carried through VERBATIM.
        routed: {
          channel,
          content: { subject: me.subject, body: me.body },
        },
        from: me.from,
        rev: me.rev,
      },
      renderCost(ctx, 1, 1),
    );
  };
}

// THE FACETED ROUTER. Fans in every triage's `routed` slice and catalogues into
// one facet per channel. Each channel facet fingerprints ONLY that channel's
// current set, so a docs message moves ONLY `docs-questions`.
function routerRender(deps: Deps): Render {
  return (ctx) => {
    const channels: Record<string, { subject: string; body: string; from?: string }[]> =
      {};
    for (const id of EMAIL_IDS) {
      const tr = readJson(deps.store, TRIAGE[id]!);
      if (tr === null) continue;
      const routed = (tr["routed"] ?? null) as {
        channel?: Channel;
        content?: { subject?: string; body?: string };
      } | null;
      if (routed === null || routed.channel === undefined) continue; // spam → skipped
      const ch = routed.channel;
      const slot = (channels[ch] ??= []);
      slot.push({
        subject: routed.content?.subject ?? "",
        body: routed.content?.body ?? "",
        from: (tr["from"] as string) ?? undefined,
      });
    }
    // Catalogue: per channel, the DEDUPED-by-canonical-content set, sorted
    // deterministically. The channel facet fingerprints ONLY {subject, body}
    // (NOT `from`), so a duplicate question from a different sender does not move
    // the channel.
    const catalogued: Record<string, unknown> = {};
    const rollup: Record<string, number> = {};
    let movedUnits = 0;
    for (const ch of CHANNELS) {
      const items = channels[ch] ?? [];
      const seen = new Set<string>();
      const canon: { subject: string; body: string }[] = [];
      for (const it of items) {
        const key = `${it.subject} ${it.body}`;
        if (seen.has(key)) continue;
        seen.add(key);
        canon.push({ subject: it.subject, body: it.body });
      }
      canon.sort((a, b) =>
        a.subject === b.subject
          ? a.body.localeCompare(b.body)
          : a.subject.localeCompare(b.subject),
      );
      if (canon.length > 0) {
        catalogued[ch] = canon;
        rollup[ch] = canon.length;
        movedUnits += 1;
      }
    }
    return commit(
      { channels: catalogued, rollup, channel_count: Object.keys(catalogued).length },
      renderCost(ctx, Math.max(1, movedUnits), 2),
    );
  };
}

// A downstream channel listener over a SINGLE channel facet. The docs-gap-tracker
// maintains a world-model of recurring documentation gaps + suggested FAQ entries
// feeding the agent-native docs surface / llms.txt ("Talk to us") support corpus.
function docsGapTrackerRender(deps: Deps): Render {
  return (ctx) => {
    const router = readJson(deps.store, ROUTER);
    const docs = ((router?.["channels"] ?? {}) as Record<string, unknown>)["docs"] ?? [];
    const items = docs as { subject?: string; body?: string }[];
    const gaps = items
      .map((it) => ({
        question: it.subject ?? "",
        suggested_faq: `FAQ: ${it.subject ?? ""}`,
      }))
      .sort((a, b) => a.question.localeCompare(b.question));
    return commit(
      {
        surface: "llms.txt / Talk to us",
        gap_count: gaps.length,
        gaps,
        // self-driven freshness: re-review the gap list at least once per
        // business day (the `valid_until` lapse).
        valid_until: "+1 business day",
      },
      renderCost(ctx, Math.max(1, gaps.length), 1),
    );
  };
}

function bugBoardRender(deps: Deps): Render {
  return (ctx) => {
    const router = readJson(deps.store, ROUTER);
    const bugs = ((router?.["channels"] ?? {}) as Record<string, unknown>)["bug"] ?? [];
    const items = bugs as { subject?: string; body?: string }[];
    const open = items
      .map((it) => ({ title: it.subject ?? "", status: "open" }))
      .sort((a, b) => a.title.localeCompare(b.title));
    return commit(
      { open_bugs: open, open_count: open.length },
      renderCost(ctx, Math.max(1, open.length), 1),
    );
  };
}

function roadmapSignalsRender(deps: Deps): Render {
  return (ctx) => {
    const router = readJson(deps.store, ROUTER);
    const feats =
      ((router?.["channels"] ?? {}) as Record<string, unknown>)["feature"] ?? [];
    const items = feats as { subject?: string; body?: string }[];
    const demand = items
      .map((it) => ({ request: it.subject ?? "", votes: 1 }))
      .sort((a, b) => a.request.localeCompare(b.request));
    return commit(
      { demand, request_count: demand.length },
      renderCost(ctx, Math.max(1, demand.length), 1),
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
 * Build the deterministic Support Inbox Router `replay/` state-dir. Drives the
 * scripted beat timeline through the REAL reconciler over the FileSystem store +
 * ledger, then writes `compile/topology.json`, `compile/labels.json`, and
 * (LOSSLESSLY) `beats.json`. Re-running with the same path reproduces the bytes.
 */
export function generateSupportInboxRouterExample(
  opts: GenerateOptions,
): GenerateResult {
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
    ...EMAIL_IDS.map<NodeDecl>((id) => ({
      id: TRIAGE[id]!,
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: EMAIL_FACET[id]! }],
      render: triageRender(deps, id),
      canonicalizer: triageCanon,
    })),
    {
      id: ROUTER,
      kind: "responsibility",
      // Fans in every triage's `routed` facet (the spam boundary — a spam
      // triage's `routed` facet is the fixed NULL token, so it never wakes us).
      requires: EMAIL_IDS.map((id) => ({
        producer: TRIAGE[id]!,
        facet: ROUTED_FACET,
      })),
      render: routerRender(deps),
      canonicalizer: routerCanon,
    },
    {
      id: DOCS_GAP_TRACKER,
      kind: "responsibility",
      requires: [{ producer: ROUTER, facet: CHANNEL_FACET.docs }],
      render: docsGapTrackerRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: BUG_BOARD,
      kind: "responsibility",
      requires: [{ producer: ROUTER, facet: CHANNEL_FACET.bug }],
      render: bugBoardRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: ROADMAP_SIGNALS,
      kind: "responsibility",
      requires: [{ producer: ROUTER, facet: CHANNEL_FACET.feature }],
      render: roadmapSignalsRender(deps),
      canonicalizer: atomicTruth,
    },
    // NOTE: `#### billing` (CHANNEL_FACET.billing) has NO downstream listener
    // on purpose — a facet is a subscription SYMBOL and may have zero consumers.
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<
    string,
    { render: Render; canonicalizer: NodeDecl["canonicalizer"] }
  > = {};
  for (const d of decls)
    mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  const feed: Feed = seedFeed();

  const publishAndWake = (): void => {
    const fm = files({ "support-feed.json": jsonFile(feed) });
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

  const deliver = (email: Email): void => {
    feed[email.id] = email;
    publishAndWake();
  };

  // ======================================================================
  // The scripted beat timeline (mirrors BEATS above).
  // ======================================================================

  // --- Beat 1: COLD BOOT (seed ham across channels: one bug, one feature, one
  // docs → the graph lights once).
  publishAndWake();

  // --- Beat 2: QUIET STRETCH (byte-identical re-scans → whole graph SKIPS).
  publishAndWake();
  publishAndWake();

  // --- Beat 3: SPAM (the hero of the dark graph). A spam email arrives: its
  // triage renders (the cheap filter), but its `routed` facet stays NULL → the
  // router is NOT woken and NO channel listener wakes.
  deliver({
    id: "sp1",
    from: "promo@spammy.test",
    subject: "🔥 Crypto doubling — act NOW",
    body: "Send 0.1 BTC and receive 0.2 BTC back, guaranteed, limited time!!!",
    kind: "spam",
    rev: 1,
  });

  // --- Beat 4: DOCS-ONLY SELECTIVE WAKE. A docs question arrives → the router
  // moves ONLY `docs-questions` → ONLY the docs-gap-tracker wakes (the bug board
  // + roadmap-signals stay DARK).
  deliver({
    id: "d2",
    from: "ops@acme.test",
    subject: DOCS2_SUBJECT,
    body: DOCS2_BODY,
    kind: "docs",
    rev: 1,
  });

  // --- Beat 5: BUG-ONLY SELECTIVE WAKE. A bug arrives → ONLY the bug board wakes.
  deliver({
    id: "b2",
    from: "qa@acme.test",
    subject: "Webhook retries fire twice on 503",
    body: "On a 503 the delivery is retried but the first attempt also lands — duplicates.",
    kind: "bug",
    rev: 1,
  });

  // --- Beat 6: SELF-TICK FLOOR. The docs-gap-tracker self-tick (the valid_until
  // lapse): inputs unmoved → a `self` skip at zero cost (the audit floor).
  dag.tick(DOCS_GAP_TRACKER);
  dag.tick(DOCS_GAP_TRACKER);

  // --- Beat 7: DOCS DEDUP. A duplicate docs question whose canonical content is
  // unchanged (different id + sender, SAME subject + body) → `docs-questions`
  // does NOT move → the docs-gap-tracker dedup-skips.
  deliver({
    id: "d2",
    from: "newteam@acme.test", // different sender; canonical content unchanged
    subject: DOCS2_SUBJECT,
    body: DOCS2_BODY,
    kind: "docs",
    rev: 2,
  });

  // --- Beat 8: FINAL QUIET (byte-identical re-scans → back to flat).
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
      ...EMAIL_IDS.map((id) => EMAIL_FACET[id]!),
      ROUTED_FACET,
      ...CHANNELS.map((ch) => CHANNEL_FACET[ch]),
      ROLLUP_FACET,
    ],
  };
}

// Allow `tsx generate.ts` / `node` invocation to (re)write the committed replay/.
if (require.main === module) {
  const here = join(__dirname, "replay");
  const result = generateSupportInboxRouterExample({ stateDir: here });
  // eslint-disable-next-line no-console
  console.log(
    `support-inbox-router: wrote ${result.receiptsCount} receipts, ${result.nodeCount} nodes, ${result.edgeCount} edges → ${result.stateDir}`,
  );
}
