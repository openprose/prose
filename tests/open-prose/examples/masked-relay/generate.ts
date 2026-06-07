// The Masked Relay LEARNING-EXAMPLE generator — produces a deterministic,
// replayable `replay/` state-dir that the offline gate asserts against and that
// reactor-devtools can replay UNCHANGED (it emits the exact devtools fixture
// state-dir shape: receipts.json flat at the root, world-models/<HEX>/…, and
// compile/{topology,labels}.json + beats.json).
//
// This is the AUTHORING phase frozen into artifacts: the SKILL-loaded session is
// the compiler (it produced the `src/*.prose.md` contract and the topology), and
// this generator drives the REAL @openprose/reactor reconciler with deterministic
// fake renders (NO model key) to freeze the run. The dumb reconciler replays it.
//
// It is lifted from packages/reactor-devtools/src/fixtures/masked-relay.ts (the
// only tarball-shipped fixture) with two normalizations the example library
// requires:
//   1. it SELF-WRITES `compile/labels.json` (the devtools fixture lacked one), and
//   2. it SELF-WRITES `beats.json` (a scripted cold -> quiet-skip -> surprise
//      timeline) so a regen is LOSSLESS (never clobbers an adjacent beats file).
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); the mask is a stable hash mod; the cost is a pure
// function of how much actually moved. Same generator => byte-identical state-dir.

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
// Node identities + facets (mirror the .prose.md contract under src/)
// ---------------------------------------------------------------------------

const SOURCE = "ingress.signal-inbox"; // the system's edge (phantom producer)
const GATEWAY = "gateway.signal-inbox";
const SIGNAL_LEDGER = "responsibility.signal-ledger";

const SCOUT_PRICE = "responsibility.scout-price";
const SCOUT_FRICTION = "responsibility.scout-friction";
const SCOUT_DESIRE = "responsibility.scout-desire";
const SCOUTS = [SCOUT_PRICE, SCOUT_FRICTION, SCOUT_DESIRE] as const;

const VIEWPORT_MASKER = "responsibility.viewport-masker";

const EXPANDER_1 = "responsibility.expander-1";
const EXPANDER_2 = "responsibility.expander-2";
const EXPANDERS = [EXPANDER_1, EXPANDER_2] as const;

const CRITIC_STRONG = "responsibility.critic-strong";
const CRITIC_WEAK = "responsibility.critic-weak";
const CRITICS = [CRITIC_STRONG, CRITIC_WEAK] as const;

const SYNTHESIZER = "responsibility.insight-synthesizer";
const AUDITOR = "responsibility.diversity-auditor";

const LEDGER_FACET: Facet = "ledger";
const INBOX_FACET: Facet = "inbox";
const VIEW_E1: Facet = "view_e1";
const VIEW_E2: Facet = "view_e2";

const MASK_SEED = 1729;

// Friendly labels for the devtools SPA (nodeId -> human label). Load-bearing
// normalization: the devtools masked-relay fixture shipped WITHOUT one; the
// example library requires labels.json for every example.
const LABELS: Record<string, string> = {
  [SOURCE]: "Signal Inbox (edge)",
  [GATEWAY]: "Signal Inbox",
  [SIGNAL_LEDGER]: "Signal Ledger",
  [SCOUT_PRICE]: "Scout · Price",
  [SCOUT_FRICTION]: "Scout · Friction",
  [SCOUT_DESIRE]: "Scout · Desire",
  [VIEWPORT_MASKER]: "Viewport Masker",
  [EXPANDER_1]: "Expander 1",
  [EXPANDER_2]: "Expander 2",
  [CRITIC_STRONG]: "Critic · Strong",
  [CRITIC_WEAK]: "Critic · Weak",
  [SYNTHESIZER]: "Insight Synthesizer",
  [AUDITOR]: "Diversity Auditor",
};

// The recorder beat map — the cold -> quiet-skip -> surprise story arc the SPA
// scrubs. Kept beside the generator and SELF-WRITTEN so a regen is lossless.
const BEATS = {
  scenario: "masked-relay",
  title:
    "A 12-node peer-blind relay. A new signal arrives and one path re-renders; a no-change re-wake memo-skips the whole relay; cost scales with surprise, never the clock.",
  beats: [
    {
      name: "cold-boot",
      from: 0,
      to: 11,
      holdMs: 2600,
      caption:
        "cold start · all 12 nodes render once · scouts fan out peer-blind · masker projects per-consumer view facets · synthesizer commits over the full trail",
    },
    {
      name: "surprise-s2",
      from: 12,
      to: 23,
      holdMs: 3200,
      caption:
        "a NEW signal (S2) arrives · the gateway memo-misses · the relay re-renders down its path · fresh tokens spike with the surprise",
    },
    {
      name: "quiet-skip",
      from: 24,
      to: 35,
      holdMs: 2400,
      caption:
        "a byte-identical re-wake · the GATEWAY memo-SKIPS and nothing downstream wakes · no facet moves · no lane lights · fresh 0 — the flat-line",
    },
    {
      name: "surprise-s3",
      from: 36,
      to: 47,
      holdMs: 3200,
      caption:
        "a third distinct signal (S3) · another surprise spike · the masked projections re-derive deterministically",
    },
  ],
};

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
// The cost model — fresh scales with surprise; a skip is fresh:0 (the flat line).
// surprise_cause MUST equal the wake source (receipt validation enforces it), so
// it is read off the render context — never hardcoded.
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 180;
const REUSED_FLOOR = 240;

function renderCost(
  ctx: RenderContext,
  freshUnits: number,
  reusedUnits = 0,
): Cost {
  return {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: {
      fresh: Math.max(1, Math.round(freshUnits * FRESH_PER_UNIT)),
      reused: REUSED_FLOOR + reusedUnits * 40,
    },
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// External signal payload + the deterministic mask
// ---------------------------------------------------------------------------

interface Signal {
  readonly id: string;
  readonly source:
    | "customer_call"
    | "support_ticket"
    | "lost_deal"
    | "competitor";
  readonly text: string;
}

function isVisible(seed: number, consumer: string, claimId: string): boolean {
  const h = createHash("sha256")
    .update(`${seed} ${consumer} ${claimId}`)
    .digest();
  return h[0]! % 3 !== 0; // keep 2/3, hide 1/3 — deterministic, replay-stable
}

interface MaskedView {
  readonly consumer: string;
  readonly seed: number;
  readonly visible: readonly string[];
  readonly hidden_hashes: readonly string[];
}

function maskFor(
  seed: number,
  consumer: string,
  claimIds: readonly string[],
): MaskedView {
  const visible: string[] = [];
  const hidden_hashes: string[] = [];
  for (const id of claimIds) {
    if (isVisible(seed, consumer, id)) {
      visible.push(id);
    } else {
      hidden_hashes.push(
        createHash("sha256").update(id).digest("hex").slice(0, 12),
      );
    }
  }
  return {
    consumer,
    seed,
    visible: visible.sort(),
    hidden_hashes: hidden_hashes.sort(),
  };
}

// ---------------------------------------------------------------------------
// Reading upstream truth by reference (what a fake render does)
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
// Canonicalizers (which facets a node's truth exposes)
// ---------------------------------------------------------------------------

const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [LEDGER_FACET]: materialFingerprint(t["items"] ?? []),
  };
};

const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["inbox.json"];
  const inbox = bytes === undefined ? [] : JSON.parse(readTextFile(bytes));
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [INBOX_FACET]: materialFingerprint(inbox),
  };
};

// The masker exposes ONE facet per consumer slot — the facet token moves iff
// that consumer's visible subset moves (the masked-projection selector boundary).
const maskerCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const views = (t["views"] ?? {}) as Record<string, MaskedView>;
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [VIEW_E1]: materialFingerprint(views[EXPANDER_1]?.visible ?? []),
    [VIEW_E2]: materialFingerprint(views[EXPANDER_2]?.visible ?? []),
  };
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved)
// ---------------------------------------------------------------------------

function dedupById(items: readonly Signal[]): Signal[] {
  const seen = new Set<string>();
  const out: Signal[] = [];
  for (const s of items) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

interface Deps {
  readonly store: WorldModelStore;
  readonly inbox: Signal[];
}

type Render = (ctx: RenderContext) => RenderProduct;

function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const inbox = (readJson<Signal[]>(deps.store, SOURCE, "inbox.json") ??
      []) as Signal[];
    const items = dedupById(inbox);
    return commit(
      { items, count: items.length },
      renderCost(ctx, items.length, 1),
    );
  };
}

function signalLedgerRender(deps: Deps): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const items = (gw?.["items"] ?? []) as Signal[];
    const ledger = items.map((s) => ({
      id: s.id,
      source: s.source,
      dedupe_key: `${s.source}:${s.id}`,
      observed_at: s.id,
    }));
    return commit(
      { items: ledger, stable_fingerprint: materialFingerprint(ledger) },
      renderCost(ctx, ledger.length, 1),
    );
  };
}

function scoutRender(deps: Deps, persona: string): Render {
  return (ctx) => {
    const ledger = readJson(deps.store, SIGNAL_LEDGER);
    const items = (ledger?.["items"] ?? []) as { id: string }[];
    const claims = items.map((it) => ({
      claim_id: `${persona}:${it.id}`,
      persona,
      evidence_ref: it.id,
      confidence: 0.5,
    }));
    return commit(
      { persona, claims, claim_ids: claims.map((c) => c.claim_id) },
      renderCost(ctx, claims.length, 1),
    );
  };
}

function maskerRender(deps: Deps): Render {
  return (ctx) => {
    const allClaimIds: string[] = [];
    for (const scout of SCOUTS) {
      const s = readJson(deps.store, scout);
      for (const id of (s?.["claim_ids"] ?? []) as string[])
        allClaimIds.push(id);
    }
    allClaimIds.sort();
    const views: Record<string, MaskedView> = {};
    for (const consumer of EXPANDERS) {
      views[consumer] = maskFor(MASK_SEED, consumer, allClaimIds);
    }
    const coverage_matrix = Object.fromEntries(
      EXPANDERS.map((c) => [c, views[c]!.visible.length]),
    );
    return commit(
      {
        seed: MASK_SEED,
        consumers: [...EXPANDERS],
        views,
        coverage_matrix,
        policy_reason:
          "deterministic 2/3 keep, 1/3 hide per (seed, consumer, claim)",
      },
      renderCost(ctx, allClaimIds.length, 2),
    );
  };
}

function expanderRender(deps: Deps, slot: string): Render {
  return (ctx) => {
    const mask = readJson(deps.store, VIEWPORT_MASKER);
    const views = (mask?.["views"] ?? {}) as Record<string, MaskedView>;
    const myView = views[slot] ?? { visible: [], hidden_hashes: [] };
    const expanded = (myView.visible ?? []).map((id) => ({
      from_claim: id,
      hypothesis: `expanded(${id})`,
    }));
    return commit(
      {
        slot,
        visible_count: (myView.visible ?? []).length,
        hidden_count: (myView.hidden_hashes ?? []).length,
        expanded_claims: expanded,
        preserved_minorities: [],
      },
      renderCost(ctx, expanded.length, 1),
    );
  };
}

function criticRender(deps: Deps, mode: string): Render {
  return (ctx) => {
    let total = 0;
    for (const exp of EXPANDERS) {
      const e = readJson(deps.store, exp);
      total += ((e?.["expanded_claims"] ?? []) as unknown[]).length;
    }
    return commit(
      { mode, claims_reviewed: total, critique: `${mode}:${total}` },
      renderCost(ctx, Math.ceil(total / 2), 2),
    );
  };
}

function synthesizerRender(deps: Deps): Render {
  return (ctx) => {
    const cited: string[] = [];
    let evidence = 0;
    for (const up of [...SCOUTS, ...EXPANDERS, ...CRITICS]) {
      const u = readJson(deps.store, up);
      if (u !== null) {
        cited.push(up);
        evidence += 1;
      }
    }
    return commit(
      {
        headline: `insight over ${evidence} upstream ledgers`,
        evidence_refs: cited,
        changed_since_last: ctx.input_fingerprints.slice(),
        minority_threads: [],
        best_objection: "consensus may be premature",
        recommended_probe: "interview a hidden-claim source",
      },
      renderCost(ctx, evidence, 3),
    );
  };
}

function auditorRender(deps: Deps): Render {
  return (ctx) => {
    const memo = readJson(deps.store, SYNTHESIZER);
    const mask = readJson(deps.store, VIEWPORT_MASKER);
    const cov = (mask?.["coverage_matrix"] ?? {}) as Record<string, number>;
    return commit(
      {
        convergence_score: ((memo?.["evidence_refs"] ?? []) as unknown[])
          .length,
        coverage_matrix: cov,
        mask_rate_recommendation: "hold",
        show_all_baseline_recommendation: "no",
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
    requires: decl.requires
      .map((r) => `${r.producer}:${r.facet ?? ATOMIC_FACET}`)
      .sort(),
  });
}

function buildReconcilerTopology(
  decls: readonly NodeDecl[],
): ReconcilerTopology {
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
  const entry_points = decls
    .filter((d) => d.kind === "gateway")
    .map((d) => d.id);
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
// The generator
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Absolute path of the state-dir to (re)create (the example's `replay/`). */
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
 * Build the deterministic masked-relay state-dir at `opts.stateDir`. Drives a
 * scripted episode through the REAL reconciler over the FileSystem store +
 * ledger, then writes compile/topology.json + compile/labels.json + beats.json.
 * Re-running with the same path reproduces the same bytes (lossless regen).
 *
 * The episode is the cold -> surprise -> quiet-skip -> surprise arc:
 *   1. cold boot (every node renders once)
 *   2. a NEW signal arrives (a surprise: the relay re-renders down its path)
 *   3. a NO-CHANGE re-wake (the WHOLE relay MEMO-SKIPS — fresh:0 flat-line)
 *   4. a second distinct signal (another surprise spike)
 */
export function generateMaskedRelayExample(
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

  const deps: Deps = { store, inbox: [] };

  const decls: NodeDecl[] = [
    {
      id: GATEWAY,
      kind: "gateway",
      requires: [{ producer: SOURCE, facet: INBOX_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    {
      id: SIGNAL_LEDGER,
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: LEDGER_FACET }],
      render: signalLedgerRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: SCOUT_PRICE,
      kind: "responsibility",
      requires: [{ producer: SIGNAL_LEDGER }],
      render: scoutRender(deps, "price"),
      canonicalizer: atomicTruth,
    },
    {
      id: SCOUT_FRICTION,
      kind: "responsibility",
      requires: [{ producer: SIGNAL_LEDGER }],
      render: scoutRender(deps, "friction"),
      canonicalizer: atomicTruth,
    },
    {
      id: SCOUT_DESIRE,
      kind: "responsibility",
      requires: [{ producer: SIGNAL_LEDGER }],
      render: scoutRender(deps, "desire"),
      canonicalizer: atomicTruth,
    },
    {
      id: VIEWPORT_MASKER,
      kind: "responsibility",
      requires: SCOUTS.map((s) => ({ producer: s })),
      render: maskerRender(deps),
      canonicalizer: maskerCanon,
    },
    {
      id: EXPANDER_1,
      kind: "responsibility",
      // Selective subscription: ONLY this consumer's masked-view facet.
      requires: [{ producer: VIEWPORT_MASKER, facet: VIEW_E1 }],
      render: expanderRender(deps, EXPANDER_1),
      canonicalizer: atomicTruth,
    },
    {
      id: EXPANDER_2,
      kind: "responsibility",
      requires: [{ producer: VIEWPORT_MASKER, facet: VIEW_E2 }],
      render: expanderRender(deps, EXPANDER_2),
      canonicalizer: atomicTruth,
    },
    {
      id: CRITIC_STRONG,
      kind: "responsibility",
      requires: EXPANDERS.map((e) => ({ producer: e })),
      render: criticRender(deps, "strong"),
      canonicalizer: atomicTruth,
    },
    {
      id: CRITIC_WEAK,
      kind: "responsibility",
      requires: EXPANDERS.map((e) => ({ producer: e })),
      render: criticRender(deps, "weak"),
      canonicalizer: atomicTruth,
    },
    {
      id: SYNTHESIZER,
      kind: "responsibility",
      requires: [...SCOUTS, ...EXPANDERS, ...CRITICS].map((p) => ({
        producer: p,
      })),
      render: synthesizerRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: AUDITOR,
      kind: "responsibility",
      requires: [{ producer: SYNTHESIZER }, { producer: VIEWPORT_MASKER }],
      render: auditorRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<
    string,
    { render: Render; canonicalizer: NodeDecl["canonicalizer"] }
  > = {};
  for (const d of decls)
    mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  // Injects an external evidence receipt for the phantom ingress producer, moving
  // the gateway's `inbox` facet so the gateway's memo key misses (or, on a
  // byte-identical re-inject, stays put so the whole relay memo-skips).
  const deliver = (signal: Signal | null): void => {
    if (signal) deps.inbox.push(signal);
    const fm = files({ "inbox.json": jsonFile(deps.inbox) });
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

  // --- The scripted, deterministic episode -------------------------------
  // 1) cold boot: the first signal boots the whole relay (every node renders).
  deliver({
    id: "S1",
    source: "customer_call",
    text: "pricing felt opaque at renewal",
  });
  // 2) a NEW distinct signal — a real surprise; the relay re-renders down its path.
  deliver({
    id: "S2",
    source: "lost_deal",
    text: "switched to a cheaper competitor",
  });
  // 3) a NO-CHANGE re-wake — byte-identical inbox; the WHOLE relay memo-SKIPS.
  deliver(null);
  // 4) a third distinct signal — another surprise spike.
  deliver({
    id: "S3",
    source: "support_ticket",
    text: "exports keep timing out",
  });

  // --- Persist the topology snapshot (MANDATORY for replay) ---------------
  // The data layer reads the FLAT TopologyWorldModel from compile/topology.json,
  // NOT the nested ReconcilerTopology — so write the inner topology.
  const compileDir = join(stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "topology.json"),
    `${JSON.stringify(reconcilerTopology.topology, null, 2)}\n`,
    "utf8",
  );
  // --- Normalize: labels.json present for every example -------------------
  writeFileSync(
    join(compileDir, "labels.json"),
    `${JSON.stringify(LABELS, null, 2)}\n`,
    "utf8",
  );
  // --- Self-write beats.json so a regen is LOSSLESS -----------------------
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
    facets: [LEDGER_FACET, INBOX_FACET, VIEW_E1, VIEW_E2],
  };
}

// Allow `tsx generate.ts` / `node generate.js` to (re)freeze the committed
// `replay/` state-dir in place.
if (require.main === module) {
  const out = join(__dirname, "replay");
  const res = generateMaskedRelayExample({ stateDir: out });
  // eslint-disable-next-line no-console
  console.log(
    `masked-relay: ${res.receiptsCount} receipts · ${res.nodeCount} nodes · ${res.edgeCount} edges -> ${out}`,
  );
}
