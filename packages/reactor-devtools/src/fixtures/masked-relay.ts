// The Masked Relay fixture GENERATOR — produces a deterministic, replayable
// `<state-dir>` that drives both the launch demo and the devtools test corpus.
//
// WHY THIS FILE EXISTS (and why it is NOT the SDK's `scenario/masked-relay`):
// the SDK ships a masked-relay scenario under `packages/reactor/src/scenario/`,
// but it (a) is NOT exported through the package's `exports` map (so it is not
// importable from here), (b) is hardwired to the in-memory store + ledger, so it
// never persists a replayable `<state-dir>`, and (c) every fake render uses
// `zeroCost` — which would leave the devtools' fresh-vs-reused token meter flat
// at zero, defeating the S2 "cost scales with surprise" hero shot.
//
// So this is a STANDALONE generator that reuses ONLY the public, exported SDK
// primitives (`mountDag`, the FileSystem store/ledger/storage adapters, the
// world-model file helpers) to build the SAME shape the SDK scenario documents —
// a masked-relay graph with FACETS (the viewport masker's per-consumer view
// lanes) and a DIAMOND (scouts converge into the masker; expanders converge into
// the critics into the synthesizer) — and drives it through the REAL reconciler
// with deterministic fake renders (NO model key). It persists a full state-dir:
//
//   <state-dir>/receipts.json              (the durable append-only ledger trail,
//                                            via the storage-fs adapter — the
//                                            data layer opens it with
//                                            createFileSystemStorageAdapter)
//   <state-dir>/world-models/<node>/…      (per-node published truth + version
//                                            history, via FileSystemWorldModelStore)
//   <state-dir>/compile/topology.json      (the flat TopologyWorldModel the SPA
//                                            draws — MANDATORY for replay, plan R2)
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); the mask is a stable hash mod; the cost is a pure
// function of how much actually moved. Same generator ⇒ byte-identical state-dir
// ⇒ the devtools replays the same animation every time.

import { createHash } from "node:crypto";
import { asFacet, asFingerprint, asNodeId } from "@openprose/reactor/internals";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  mountDag,
  fileSystemSubstrate,
  files,
  jsonFile,
  ATOMIC_FACET,
  type Cost,
  type WakeSource,
  type Wake,
  // The render-context type lives on the render-atom surface (front door).
  type RenderContext,
  type RenderProduct,
} from "@openprose/reactor";

import {
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
  // The reconciler topology shape (the nested `{ topology, contract_fingerprints }`
  // mountDag wants) is re-exported as ReconcilerTopology.
  type ReconcilerTopology,
} from "@openprose/reactor/internals";

import { materialFingerprint, readJson } from "./_fixture-shared";

// ---------------------------------------------------------------------------
// Node identities + facets (mirrors scenario/masked-relay.ts so the demo graph
// reads identically to the SDK's documented fixture)
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

const LEDGER_FACET = asFacet("ledger");
const INBOX_FACET = asFacet("inbox");
const VIEW_E1 = asFacet("view_e1");
const VIEW_E2 = asFacet("view_e2");

const MASK_SEED = 1729;

// ---------------------------------------------------------------------------
// The cost model — what makes the token meter SING (the S2 hero shot)
// ---------------------------------------------------------------------------
//
// A real render pays FRESH tokens (it actually ran an LLM session); the bigger
// the surprise (the more material it had to digest / produce), the more fresh it
// burns. The parts it could reuse (its prior frame, the upstream it re-read but
// that did not move) count as REUSED. The reconciler stamps `skipped` receipts
// with zeroCost automatically, so a memo-skip is fresh:0 / reused:0 — a flat line.
//
// Crucially: cost is a PURE function of the render's own materials, so replay is
// byte-identical. `surprise_cause` MUST equal the wake source (receipt validation
// enforces it), so we read it off the render context.

const FRESH_PER_UNIT = 180; // fresh tokens per unit of new material digested
const REUSED_FLOOR = 240; // reused tokens always carried (the prior frame + contract)

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
    // MUST equal ctx.wake.source (cross-field invariant in receipt validation).
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// External signal payload + the deterministic mask
// ---------------------------------------------------------------------------

interface Signal {
  readonly id: string;
  readonly source: "customer_call" | "support_ticket" | "lost_deal" | "competitor";
  readonly text: string;
}

function isVisible(seed: number, consumer: string, claimId: string): boolean {
  const h = createHash("sha256").update(`${seed} ${consumer} ${claimId}`).digest();
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
      hidden_hashes.push(createHash("sha256").update(id).digest("hex").slice(0, 12));
    }
  }
  return {
    consumer,
    seed,
    visible: visible.sort(),
    hidden_hashes: hidden_hashes.sort(),
  };
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

const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [LEDGER_FACET]: asFingerprint(materialFingerprint(t["items"] ?? [])),
  };
};

const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["inbox.json"];
  const inbox = bytes === undefined ? [] : JSON.parse(readTextFile(bytes));
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [INBOX_FACET]: asFingerprint(materialFingerprint(inbox)),
  };
};

// The masker exposes ONE facet per consumer slot — the facet token moves iff that
// consumer's visible subset moves. This is the selector boundary the devtools'
// per-facet edge lights prove (a move in view_e1 lights only Expander 1's lane).
const maskerCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const views = (t["views"] ?? {}) as Record<string, MaskedView>;
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [VIEW_E1]: asFingerprint(materialFingerprint(views[EXPANDER_1]?.visible ?? [])),
    [VIEW_E2]: asFingerprint(materialFingerprint(views[EXPANDER_2]?.visible ?? [])),
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
    const inbox = (readJson<Signal[]>(deps.store, SOURCE, "inbox.json") ?? []) as Signal[];
    const items = dedupById(inbox);
    // Fresh scales with the number of distinct signals it had to fold in.
    return commit({ items, count: items.length }, renderCost(ctx, items.length, 1));
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
      { items: ledger, stable_fingerprint: asFingerprint(materialFingerprint(ledger)) },
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
      for (const id of (s?.["claim_ids"] ?? []) as string[]) allClaimIds.push(id);
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
        policy_reason: "deterministic 2/3 keep, 1/3 hide per (seed, consumer, claim)",
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
        convergence_score: ((memo?.["evidence_refs"] ?? []) as unknown[]).length,
        coverage_matrix: cov,
        mask_rate_recommendation: "hold",
        show_all_baseline_recommendation: "no",
      },
      renderCost(ctx, 1, 2),
    );
  };
}

// ---------------------------------------------------------------------------
// Topology assembly (the small bit scenario/fixture.ts does, inlined so we own
// both the store AND the ledger the DAG mounts over)
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
 * Build the deterministic masked-relay state-dir at `opts.stateDir`. Drives a
 * scripted episode through the REAL reconciler over the FileSystem store +
 * ledger, then writes `compile/topology.json`. Re-running with the same path +
 * `clean:true` reproduces the same bytes.
 *
 * The episode is scripted to show the full devtools vocabulary:
 *   1. cold boot (every node renders once — a flash cascade)
 *   2. a NEW signal arrives (a surprise: the relay re-renders down a path)
 *   3. a NO-CHANGE re-wake (the whole relay MEMO-SKIPS — a field of dim pulses,
 *      a flat fresh-line) — the "cost scales with surprise" contrast
 *   4. a second distinct signal (another surprise spike)
 */
export function generateMaskedRelayFixture(opts: GenerateOptions): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  // The one Substrate primitive: storage at `<stateDir>/receipts.json`, the
  // world-model store under `<stateDir>/world-models`, and the durable ledger
  // re-derived from that storage — one blessed factory for the split this
  // fixture wired by hand before.
  const { worldModel: store, ledger } = fileSystemSubstrate({
    directory: stateDir,
  });

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
      requires: [...SCOUTS, ...EXPANDERS, ...CRITICS].map((p) => ({ producer: p })),
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
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> =
    {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

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

  // --- The scripted, deterministic episode -------------------------------
  // 1) cold boot: seed every source; cold nodes render once (flash cascade).
  //    The gateway is the only source (ingress is phantom); boot it via deliver
  //    of the FIRST signal so the whole relay renders cold.
  deliver({ id: "S1", source: "customer_call", text: "pricing felt opaque at renewal" });
  // 2) a NEW distinct signal — a real surprise; the relay re-renders down its path.
  deliver({ id: "S2", source: "lost_deal", text: "switched to a cheaper competitor" });
  // 3) a NO-CHANGE re-wake — byte-identical inbox; the WHOLE relay memo-SKIPS.
  //    (dim-pulse field + flat fresh-line — the quiet-world half of the hero shot)
  deliver(null);
  // 4) a third distinct signal — another surprise spike.
  deliver({ id: "S3", source: "support_ticket", text: "exports keep timing out" });

  // --- Persist the topology snapshot (MANDATORY for replay; plan R2) -------
  // The data layer reads the FLAT TopologyWorldModel from compile/topology.json,
  // NOT the nested ReconcilerTopology — so write the inner topology.
  const compileDir = join(stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "topology.json"),
    `${JSON.stringify(reconcilerTopology.topology, null, 2)}\n`,
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
