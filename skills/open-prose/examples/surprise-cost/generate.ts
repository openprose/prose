// The surprise-cost GENERATOR — produces a deterministic, replayable
// `replay/` state-dir whose single lesson is the marquee one: COST SCALES WITH
// SURPRISE. It is the worked, executable form of `packages/reactor/EVALS.md`
// and a sibling of the devtools `news-desk` fixture, reduced to the MINIMAL
// LINEAR shape: a `signals` gateway → a `digest` responsibility, two nodes, one
// atomic edge, over ONE shared ledger.
//
// THE STORY (the three epochs the beats.json scripts):
//   epoch1  COLD     — the world wakes up. The gateway renders, the moved truth
//                      wakes the digest, the digest renders. Two fresh renders.
//   epoch2  QUIET    — an IDENTICAL re-wake. Nothing moved, so the memo key is
//                      a HIT: the gateway memo-SKIPS, and a skip propagates
//                      nothing, so the digest is never even woken. The marquee
//                      frame: skipped, moved[—], fresh 0. The cost meter is flat.
//   epoch3  SURPRISE — the contract genuinely moves. We re-mount the SAME ledger
//                      with a BUMPED per-epoch contract_fingerprint on the
//                      gateway. The memo key MISSES, the gateway renders, its
//                      moved truth wakes the digest, the digest renders. Fresh
//                      moves; the surprise propagates one hop down the chain.
//
// THE TENET: a node renders IFF its memo key (contract_fingerprint,
// input_fingerprints) actually MOVED. You cannot drive a surprise by re-waking
// an external entry node whose contract is fixed — it renders once and skips
// forever. To drive surprise you MOVE the memo key (epoch3 bumps it). That is
// the exact lesson three independent eval authors rediscovered.
//
// `cost.surprise_cause` is ALWAYS read off `ctx.wake.source` (the reconciler
// verifies this invariant on commit) — never hardcoded.
//
// It persists the SAME full state-dir shape the devtools fixtures do, so
// reactor-devtools can replay it unchanged:
//
//   replay/receipts.json              (durable append-only ledger trail, FLAT root)
//   replay/registry.json              (the runtime-registry snapshot the storage
//                                       adapter initializes; `{}` here — no live
//                                       runtime is mounted, only the replay trail.
//                                       Written by createFileSystemStorageAdapter,
//                                       so a regen reproduces it byte-for-byte.)
//   replay/world-models/<hexNodeId>/… (per-node published truth + version history)
//   replay/compile/topology.json      (the flat TopologyWorldModel the SPA draws)
//   replay/compile/labels.json        (nodeId → friendly label for the SPA)
//   replay/beats.json                 (the scripted cold→quiet→surprise beat map,
//                                       self-written so a regen is LOSSLESS)
//
// Determinism: every render is a PURE function of upstream truth read by
// reference; cost is a pure function of how much actually moved. Same generator
// ⇒ byte-identical state-dir ⇒ the same replay every time.

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  mountDag,
  FileSystemWorldModelStore,
  FileSystemReceiptLedger,
  createFileSystemStorageAdapter,
  files,
  jsonFile,
  readTextFile,
  fingerprintArtifact,
  ATOMIC_FACET,
  type WorldModelStore,
  type WorldModelFiles,
  type Cost,
  type Fingerprint,
  type Facet,
  type WakeSource,
  type TopologyWorldModel,
  type TopologyNode,
  type TopologyEdge,
} from "@openprose/reactor";

import type {
  ReconcilerTopology,
  RenderContext,
  RenderProduct,
} from "@openprose/reactor/sdk";

// ---------------------------------------------------------------------------
// Node identities. The phantom ingress source is NOT a topology node — it is the
// edge of the world the gateway watches (mirrors the devtools fixtures).
// ---------------------------------------------------------------------------

const GATEWAY = "gateway.signals"; // entry point; external-driven
const DIGEST = "responsibility.digest"; // the headline standing responsibility

const LABELS: Record<string, string> = {
  [GATEWAY]: "Signals",
  [DIGEST]: "Digest",
};

// ---------------------------------------------------------------------------
// The cost model. Fresh tokens scale with how much NEW material a render had to
// digest; reused tokens are the prior frame + contract it carried for free. The
// reconciler stamps skipped/failed receipts with zero fresh automatically, so a
// quiet epoch is a flat line and a surprise is a single spike off it.
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 200;
const REUSED_FLOOR = 120;

function renderCost(ctx: RenderContext, freshUnits: number, reusedUnits = 0): Cost {
  return {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: {
      fresh: Math.max(1, Math.round(freshUnits * FRESH_PER_UNIT)),
      reused: REUSED_FLOOR + reusedUnits * 40,
    },
    // THE INVARIANT: the cause of the spend IS the wake that drove it. Read it
    // off the context — never hardcode it.
    surprise_cause: ctx.wake.source,
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

function commit(world: unknown, cost: Cost): RenderProduct {
  return {
    world_model: files({ "truth.json": jsonFile(world) }),
    cost,
  };
}

// A facet-less producer exposes its whole truth as the atomic facet — the
// canonicalizer maps the artifact's fingerprint onto ATOMIC_FACET (never "*").
const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved).
// ---------------------------------------------------------------------------

type Render = (ctx: RenderContext) => RenderProduct;

interface Deps {
  readonly store: WorldModelStore;
  /** The per-epoch external signal payload the gateway projects. */
  readonly signal: () => { headline: string; epoch: number };
}

// The gateway: normalize the external signal into the truth the digest reads.
function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const s = deps.signal();
    return commit({ headline: s.headline, epoch: s.epoch }, renderCost(ctx, 1, 1));
  };
}

// The digest: read the gateway's headline by reference and produce the brief.
function digestRender(deps: Deps): Render {
  return (ctx) => {
    const gw = readJson<{ headline: string; epoch: number }>(deps.store, GATEWAY);
    const headline = gw?.headline ?? "(none)";
    return commit(
      { brief: `digest: ${headline}`, source_epoch: gw?.epoch ?? 0 },
      renderCost(ctx, 1, 1),
    );
  };
}

// ---------------------------------------------------------------------------
// Topology assembly. The per-epoch contract_fingerprint of the GATEWAY is what
// we bump to drive the surprise (epoch3). Everything else is held fixed so the
// ONLY thing that can move the memo key is the deliberate contract edit.
// ---------------------------------------------------------------------------

interface NodeDecl {
  readonly id: string;
  readonly kind: "gateway" | "responsibility";
  readonly requires: readonly { producer: string; facet?: Facet }[];
  readonly render: Render;
  readonly canonicalizer: (fm: WorldModelFiles) => Record<string, Fingerprint>;
  /** The frozen contract fingerprint for this node THIS epoch. */
  readonly contractFingerprint: Fingerprint;
}

function buildReconcilerTopology(decls: readonly NodeDecl[]): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const d of decls) contract_fingerprints[d.id] = d.contractFingerprint;

  const nodes: TopologyNode[] = decls.map((d) => ({
    node: d.id,
    contract_fingerprint: d.contractFingerprint,
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
// The beat map. Committed beside the state-dir, self-written by THIS generator
// so a regeneration is lossless (no separate hand-authored beats.json to clobber
// — the known news-desk/inbox-triage/research-tree regression the plan calls
// out). Frame indices are tuned against the receipt trail this generator emits.
// ---------------------------------------------------------------------------

const BEATS = {
  scenario: "surprise-cost",
  title:
    "A cron-replacement digest. It only re-writes when the contract actually moves — quiet wakes cost nothing.",
  beats: [
    // epoch1 — COLD. The gateway renders, the moved truth wakes the digest, the
    // digest renders. The whole (tiny) graph lights up once.
    {
      name: "cold",
      park: 1,
      from: 0,
      to: 1,
      holdMs: 2600,
      caption: "cold start · the gateway renders, its truth wakes the digest · two fresh renders",
    },
    // epoch2 — QUIET. An identical re-wake. The memo key is a HIT: the gateway
    // memo-SKIPS, fresh 0, and the skip propagates nothing — the digest is never
    // woken. THE MARQUEE FRAME: skipped, moved[—], fresh 0.
    {
      name: "quiet-skip",
      park: 2,
      from: 2,
      to: 2,
      holdMs: 3600,
      caption: "an identical re-wake · the gateway memo-SKIPS · moved[—] · fresh 0 · the digest never wakes",
    },
    // epoch3 — SURPRISE. The contract_fingerprint moves (a real edit). The memo
    // key MISSES, the gateway renders, the moved truth wakes the digest, the
    // digest renders. The single spike off the flat line; the surprise propagates.
    {
      name: "surprise-render",
      park: 4,
      from: 3,
      to: 4,
      holdMs: 4000,
      caption: "the contract moves · the memo key MISSES · the gateway renders · the surprise propagates to the digest",
    },
  ],
};

// ---------------------------------------------------------------------------
// The generator.
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

// The frozen per-epoch contract fingerprints. The gateway's bumps in epoch3
// (that is the memo-key MOVE that drives the surprise); the digest's is held.
const GATEWAY_FP_V1: Fingerprint = "contract:gateway.signals@v1";
const GATEWAY_FP_V2: Fingerprint = "contract:gateway.signals@v2";
const DIGEST_FP: Fingerprint = "contract:responsibility.digest@v1";

/**
 * Build the deterministic surprise-cost state-dir at `opts.stateDir`. Drives the
 * cold → quiet → surprise beat timeline through the REAL `@openprose/reactor`
 * reconciler over the FileSystem store + ledger (NO model key), then writes
 * `compile/topology.json` + `compile/labels.json` + `beats.json`. Re-running with
 * the same path reproduces the bytes.
 */
export function generateSurpriseCostFixture(opts: GenerateOptions): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  const worldModelDir = join(stateDir, "world-models");
  const store = new FileSystemWorldModelStore({ directory: worldModelDir });
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });

  // The mutable external signal the gateway projects. In the quiet epoch the
  // signal is byte-identical to the cold one; the surprise epoch carries a
  // genuinely new headline (but the surprise is DRIVEN by the contract bump, not
  // the payload — the payload simply makes the rendered truth move too).
  let signal = { headline: "all systems nominal", epoch: 1 };
  const deps: Deps = { store, signal: () => signal };

  // ---- Build the mount declarations for an epoch's contract fingerprints. ----
  const decls = (gatewayFp: Fingerprint): NodeDecl[] => [
    {
      id: GATEWAY,
      kind: "gateway",
      // The gateway watches the external signal (atomic). It is the entry point.
      requires: [],
      render: gatewayRender(deps),
      canonicalizer: atomicTruth,
      contractFingerprint: gatewayFp,
    },
    {
      id: DIGEST,
      kind: "responsibility",
      // The digest subscribes to the gateway's whole truth (the atomic facet).
      requires: [{ producer: GATEWAY, facet: ATOMIC_FACET }],
      render: digestRender(deps),
      canonicalizer: atomicTruth,
      contractFingerprint: DIGEST_FP,
    },
  ];

  const mountFor = (gatewayFp: Fingerprint) => {
    const ds = decls(gatewayFp);
    const reconcilerTopology = buildReconcilerTopology(ds);
    const mounts: Record<
      string,
      { render: Render; canonicalizer: NodeDecl["canonicalizer"] }
    > = {};
    for (const d of ds) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };
    const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });
    return { reconcilerTopology, dag };
  };

  // ======================================================================
  // The scripted beat timeline (cold → quiet → surprise) over ONE ledger.
  // ======================================================================

  // --- epoch1: COLD. Mount with the v1 contract and ingest the gateway. The
  // gateway renders cold; its moved truth wakes the digest; the digest renders.
  const e1 = mountFor(GATEWAY_FP_V1);
  e1.dag.ingest(GATEWAY); // -> gateway:rendered, digest:rendered

  // --- epoch2: QUIET. Re-ingest the SAME gateway with the SAME v1 contract and
  // a byte-identical signal. Nothing moved ⇒ the memo key is a HIT ⇒ the gateway
  // memo-SKIPS and a skip propagates nothing ⇒ the digest is never woken.
  e1.dag.ingest(GATEWAY); // -> gateway:skipped

  // --- epoch3: SURPRISE. Move the memo key: re-mount the SAME ledger with a
  // BUMPED gateway contract_fingerprint (a real contract edit) and a moved
  // signal. The memo key MISSES ⇒ the gateway renders ⇒ the moved truth wakes the
  // digest ⇒ the digest renders. The surprise propagates one hop.
  signal = { headline: "p1 incident: checkout latency breach", epoch: 3 };
  const e3 = mountFor(GATEWAY_FP_V2);
  const surprise = e3.dag.ingest(GATEWAY); // -> gateway:rendered, digest:rendered

  // The committed topology snapshot reflects the FINAL (surprise-epoch) contract
  // fingerprints — the shape a `reactor compile` of the current contract emits.
  const finalTopology = e3.reconcilerTopology;
  void surprise;

  // --- Persist the topology snapshot (MANDATORY for replay) ----------------
  const compileDir = join(stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "topology.json"),
    `${JSON.stringify(finalTopology.topology, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(compileDir, "labels.json"),
    `${JSON.stringify(LABELS, null, 2)}\n`,
    "utf8",
  );
  // The recorder beat map — self-written so a regen is lossless.
  writeFileSync(join(stateDir, "beats.json"), `${JSON.stringify(BEATS, null, 2)}\n`, "utf8");

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: finalTopology.topology.nodes.length,
    edgeCount: finalTopology.topology.edges.length,
    facets: [ATOMIC_FACET],
  };
}

// Allow `node generate.js [stateDir]` (and a re-invoke from the package script).
if (require.main === module) {
  const dirArg = process.argv[2];
  const stateDir = dirArg
    ? require("node:path").resolve(dirArg)
    : join(__dirname, "replay");
  const result = generateSurpriseCostFixture({ stateDir });
  process.stdout.write(
    `wrote surprise-cost fixture → ${result.stateDir}\n` +
      `  receipts: ${result.receiptsCount}\n` +
      `  nodes:    ${result.nodeCount}\n` +
      `  edges:    ${result.edgeCount}\n`,
  );
}
