// The Research Tree fixture GENERATOR — produces a deterministic, replayable
// `<state-dir>` that drives the devtools demo (and doubles as the test corpus).
// It is a sibling of `agent-observatory.ts` and `masked-relay.ts` and reuses
// ONLY the public, exported SDK primitives; no SDK change is required.
//
// THE STORY (what the recording must land):
//   A research agent built its answer BOTTOM-UP as a tree. Raw sources sit at the
//   bottom. A "Sources" gateway watches the corpus and exposes ONE FACET PER LEAF
//   FINDING. Each finding leaf subscribes to ONLY its own leaf facet. The leaves
//   fan UP into a sub-synthesis per sub-question (A, B, C); the three
//   sub-syntheses fan UP into a single root synthesis. Edges point
//   leaf → sub-synthesis → root-synthesis: PROPAGATION FLOWS UP THE TREE.
//
//   THE AHA — partial propagation UP a deep tree. Revise ONE leaf finding three
//   levels down (a finding under sub-question B) and ONLY its ancestor path wakes:
//   that finding → Sub-Synthesis B → Root Synthesis. Sub-questions A and C and
//   ALL of their findings stay DARK. Then revise a sibling leaf under sub-question
//   A: a DIFFERENT path lights up to the SAME root. The root re-synthesizes each
//   time, but only the touched branch below it moves. This is "recursion is the
//   DAG" made visible: the ancestor chain is bounded by tree depth, never the
//   whole tree.
//
// THE MECHANICAL FIX (the load-bearing lesson cloned from agent-observatory): the
// gateway canonicalizer emits INDEPENDENT per-leaf facet tokens. Revising leaf
// `B2` perturbs the `leaf:B2` token and NOTHING else; every sibling leaf token is
// byte-identical, so their finding lanes never wake. Sub-syntheses fan in only
// from their OWN sub-question's findings (atomic), so a B-branch move never wakes
// Sub-Synthesis A or C. The siblings must NOT move together — that independence
// is what makes the dark mass REAL.
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
// The tree shape. Three sub-questions; A and B have three finding leaves each,
// C has two — eight leaves total. The friendly labels the SPA shows come from
// the labels map below; ids stay namespaced for the topology.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.corpus"; // the phantom edge: the raw sources corpus
const GATEWAY = "gateway.sources"; // entry point; ONE facet per leaf finding

type SubId = "A" | "B" | "C";
const SUBS: readonly SubId[] = ["A", "B", "C"] as const;

// Each leaf id is `<sub><n>`. A,B have three leaves; C has two — 8 leaves.
const LEAVES_BY_SUB: Record<SubId, readonly string[]> = {
  A: ["A1", "A2", "A3"],
  B: ["B1", "B2", "B3"],
  C: ["C1", "C2"],
};
const LEAVES: readonly string[] = SUBS.flatMap((s) => LEAVES_BY_SUB[s]);
const SUB_OF_LEAF: Record<string, SubId> = Object.fromEntries(
  SUBS.flatMap((s) => LEAVES_BY_SUB[s].map((leaf) => [leaf, s] as const)),
);

// Node ids -------------------------------------------------------------------

const FINDING = (leaf: string): string => `finding.${leaf}`;
const SUBSYNTH = (sub: SubId): string => `synthesis.sub-${sub}`;
const ROOT = "synthesis.root";

// One facet per leaf finding on the gateway — the dark-lane boundary. Revising
// leaf B2 moves ONLY `leaf:B2`; every sibling leaf token is byte-identical.
const LEAF_FACET = (leaf: string): Facet => asFacet(`leaf:${leaf}`);

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label). Load-bearing for the
// read: boxes say "Finding B2", not `finding.B2`.
// ---------------------------------------------------------------------------

const SUB_TITLE: Record<SubId, string> = {
  A: "Sub-Question A",
  B: "Sub-Question B",
  C: "Sub-Question C",
};

const LABELS: Record<string, string> = {
  [SOURCE]: "Sources Corpus",
  [GATEWAY]: "Sources Gateway",
  [ROOT]: "Root Synthesis",
};
for (const sub of SUBS) LABELS[SUBSYNTH(sub)] = `Synthesis: ${SUB_TITLE[sub]}`;
for (const leaf of LEAVES) LABELS[FINDING(leaf)] = `Finding ${leaf}`;

// ---------------------------------------------------------------------------
// The cost model — what makes the token meter SING.
// ---------------------------------------------------------------------------
//
// Fresh tokens scale with how much NEW material a render had to digest/produce;
// the parts it could reuse count as REUSED. The reconciler stamps `skipped`
// receipts with zeroCost automatically (fresh:0 — a flat line). The Root
// Synthesis is deliberately the heaviest node (it re-reads all three sub-
// syntheses and re-weaves the whole answer), so its re-synthesis on a single
// touched branch reads as the dominant fresh tick off an otherwise-quiet field.
//
// `surprise_cause` MUST equal the wake source (receipt validation enforces it).

const FRESH_PER_UNIT = 180; // fresh tokens per unit of new material digested
const REUSED_FLOOR = 240; // reused tokens always carried (prior frame + contract)
const SUBSYNTH_FRESH_MULTIPLIER = 4; // a sub-synthesis re-weaves its findings
const ROOT_FRESH_MULTIPLIER = 7; // the root re-weaves the whole answer

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
// The corpus payload: a flat map of per-leaf finding source material. A "delta"
// mutates exactly one leaf's slice (so exactly one leaf facet moves).
// ---------------------------------------------------------------------------

interface LeafState {
  readonly leaf: string;
  readonly sub: SubId;
  /** Monotonic edit counter — bumping it is a revision of that finding. */
  readonly rev: number;
  /** The claim text of this finding (what the leaf node normalizes). */
  readonly claim: string;
  /** When true, the source excerpt is unparseable — the finding throws. */
  readonly corrupt?: boolean;
}

// The mutable corpus the generator drives. Keyed by leaf id.
type Corpus = Record<string, LeafState>;

function seedCorpus(): Corpus {
  const out: Corpus = {};
  const seedClaim: Record<string, string> = {
    A1: "transformers scale with data and compute",
    A2: "scaling laws are power-law in parameter count",
    A3: "emergent abilities appear past a compute threshold",
    B1: "retrieval grounds generation in fresh sources",
    B2: "chunk size trades recall against precision",
    B3: "rerankers lift top-k relevance materially",
    C1: "evals must isolate one capability at a time",
    C2: "contamination inflates benchmark scores",
  };
  for (const leaf of LEAVES) {
    out[leaf] = { leaf, sub: SUB_OF_LEAF[leaf]!, rev: 1, claim: seedClaim[leaf]! };
  }
  return out;
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

// The ingress source exposes one facet per leaf — the fingerprint of ONLY that
// leaf's slice. This is the root of the dark lane: revise leaf B2's slice and
// only the `leaf:B2` ingress facet moves.
const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["corpus.json"];
  const corpus: Partial<Corpus> =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as Corpus);
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const leaf of LEAVES) {
    out[LEAF_FACET(leaf)] = materialFingerprint(corpus[leaf] ?? null);
  }
  return out;
};

// THE dark-lane boundary. The gateway re-projects each leaf slice into an
// INDEPENDENT facet token. A single-leaf revision moves ONLY that leaf's token;
// every sibling token is byte-identical, so the sibling finding lanes stay dark.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const leaves = (t["leaves"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const leaf of LEAVES) {
    out[LEAF_FACET(leaf)] = materialFingerprint(leaves[leaf] ?? null);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved)
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}

type Render = (ctx: RenderContext) => RenderProduct;

// The gateway: read the raw corpus, normalize into a per-leaf view. The
// per-leaf structure is what the canonicalizer projects into independent facet
// tokens.
function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const corpus = (readJson<Partial<Corpus>>(deps.store, SOURCE, "corpus.json") ?? {}) as Partial<Corpus>;
    const leaves: Record<string, unknown> = {};
    for (const leaf of LEAVES) {
      const s = corpus[leaf];
      leaves[leaf] = s
        ? { leaf: s.leaf, sub: s.sub, rev: s.rev, claim: s.claim, corrupt: s.corrupt ?? false }
        : null;
    }
    return commit({ leaves, leaf_count: LEAVES.length }, renderCost(ctx, LEAVES.length, 1));
  };
}

// A finding leaf: read ONLY its own leaf slice off the gateway and normalize the
// claim into a finding record. Subscribes to exactly one `leaf:<id>` facet, so a
// revision to a sibling leaf leaves it DARK. A corrupt excerpt makes it THROW
// (a `failed` receipt, no downstream propagation, prior truth stands).
function findingRender(deps: Deps, leaf: string): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const leaves = (gw?.["leaves"] ?? {}) as Record<string, LeafState | null>;
    const mine = leaves[leaf] ?? null;
    if (mine?.corrupt) {
      throw new Error(`finding ${leaf}: unparseable source excerpt (rev ${mine.rev})`);
    }
    return commit(
      {
        leaf,
        sub: SUB_OF_LEAF[leaf],
        rev: mine?.rev ?? 0,
        finding: mine ? `finding[${leaf}]: ${mine.claim}` : "(no source)",
      },
      renderCost(ctx, 2, 1),
    );
  };
}

// A sub-synthesis: fan IN from its OWN sub-question's findings (atomic). It
// re-weaves those findings into a sub-answer. Because it subscribes only to its
// own findings, a revision under a sibling sub-question never wakes it.
function subSynthRender(deps: Deps, sub: SubId): Render {
  return (ctx) => {
    const findings: Record<string, unknown> = {};
    let moved = 0;
    let maxRev = 0;
    for (const leaf of LEAVES_BY_SUB[sub]) {
      const f = readJson(deps.store, FINDING(leaf));
      if (f === null) continue;
      findings[leaf] = { rev: f["rev"], finding: f["finding"] };
      maxRev = Math.max(maxRev, (f["rev"] as number) ?? 0);
      moved += 1;
    }
    // A sub-synthesis re-weaves every finding under it — heavier than a leaf.
    return commit(
      {
        sub,
        title: SUB_TITLE[sub],
        findings,
        finding_count: moved,
        version: maxRev,
        answer: `sub-answer[${sub}]: ${moved} findings woven (v${maxRev})`,
      },
      renderCost(ctx, Math.max(1, moved), 2, FRESH_PER_UNIT * SUBSYNTH_FRESH_MULTIPLIER),
    );
  };
}

// The Root Synthesis: fan IN from all three sub-syntheses (atomic). It re-reads
// every sub-answer and re-weaves the whole answer — the heaviest node. It wakes
// whenever ANY one sub-synthesis moves, but the sub-syntheses below it stay dark
// except for the single touched branch (the bounded ancestor path).
function rootRender(deps: Deps): Render {
  return (ctx) => {
    const subs: Record<string, unknown> = {};
    let total = 0;
    for (const sub of SUBS) {
      const s = readJson(deps.store, SUBSYNTH(sub));
      if (s === null) continue;
      subs[sub] = { version: s["version"], answer: s["answer"] };
      total += (s["finding_count"] as number) ?? 0;
    }
    // The root re-weaves all three sub-answers — the dominant fresh tick.
    return commit(
      {
        sub_answers: subs,
        total_findings: total,
        headline: `research answer: ${SUBS.length} sub-questions, ${total} findings synthesized`,
      },
      renderCost(ctx, SUBS.length, 3, FRESH_PER_UNIT * ROOT_FRESH_MULTIPLIER),
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
 * Build the deterministic Research Tree state-dir at `opts.stateDir`. Drives the
 * scripted beat timeline through the REAL reconciler over the FileSystem store +
 * ledger, then writes `compile/topology.json` + `compile/labels.json`.
 * Re-running with the same path reproduces the bytes.
 */
export function generateResearchTreeFixture(opts: GenerateOptions): GenerateResult {
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
      // The gateway watches the whole corpus (atomic): any leaf slice moving wakes
      // it; its canonicalizer then splits the change into per-leaf facets.
      requires: [{ producer: SOURCE, facet: ATOMIC_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    // Eight finding leaves — each subscribes to ONLY its own leaf facet.
    ...LEAVES.map<NodeDecl>((leaf) => ({
      id: FINDING(leaf),
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: LEAF_FACET(leaf) }],
      render: findingRender(deps, leaf),
      canonicalizer: atomicTruth,
    })),
    // Three sub-syntheses — each fans IN from ONLY its own sub-question's findings.
    ...SUBS.map<NodeDecl>((sub) => ({
      id: SUBSYNTH(sub),
      kind: "responsibility",
      requires: LEAVES_BY_SUB[sub].map((leaf) => ({ producer: FINDING(leaf) })),
      render: subSynthRender(deps, sub),
      canonicalizer: atomicTruth,
    })),
    {
      id: ROOT,
      kind: "responsibility",
      // Fans IN from all three sub-syntheses (atomic) — the apex of the tree.
      requires: SUBS.map((sub) => ({ producer: SUBSYNTH(sub) })),
      render: rootRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  // The mutable corpus the generator drives.
  const corpus: Corpus = seedCorpus();

  // Re-publish the corpus source and wake the gateway. When `corpus` is
  // byte-identical to the prior publish, the gateway memo-skips and the whole
  // tree above it memo-skips too (the quiet-world re-wake).
  const publishAndWake = (): void => {
    const fm = files({ "corpus.json": jsonFile(corpus) });
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

  // Revise exactly one leaf finding (so exactly one leaf facet moves). This is
  // the hero gesture: a single edit three levels down the tree.
  const reviseLeaf = (
    leaf: string,
    patch: Partial<Pick<LeafState, "claim" | "corrupt">>,
  ): void => {
    const prev = corpus[leaf]!;
    corpus[leaf] = {
      ...prev,
      rev: prev.rev + 1,
      claim: patch.claim ?? prev.claim,
      corrupt: patch.corrupt ?? false,
    };
    publishAndWake();
  };

  // ======================================================================
  // The scripted beat timeline.
  // ======================================================================

  // --- Beat 1: COLD BOOT. Seed the corpus; every node renders once — the whole
  // tree lights up bottom-up in one cascade: gateway → 8 findings → 3 sub-
  // syntheses → root.
  publishAndWake();

  // --- Beat 2: QUIET STRETCH. Byte-identical re-scans: the WHOLE tree
  // memo-SKIPS — a long field of dim skip pulses, the fresh line flat near zero.
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Beat 3: SELF-TICK FLOOR. A lone self-sourced wake on the Root Synthesis
  // in the quiet world. Its inputs have not moved ⇒ a `self` skipped receipt
  // that lights no edges and costs ~nothing (the audit floor).
  dag.tick(ROOT);
  dag.tick(ROOT);

  // a little more quiet so the floor reads flat before the surprise.
  publishAndWake();

  // --- Beat 4: THE HERO. Revise ONE leaf finding three levels down — B2, under
  // Sub-Question B. ONLY the `leaf:B2` facet moves ⇒ ONLY Finding B2 wakes; the
  // other seven findings stay DARK. Finding B2 wakes Sub-Synthesis B (and ONLY
  // B); Sub-Synthesis B wakes the Root. Sub-Syntheses A and C never move. The
  // lit path is exactly: Finding B2 → Synthesis B → Root Synthesis — tree depth,
  // not tree size.
  reviseLeaf("B2", { claim: "chunk size of ~512 tokens balances recall and precision" });

  // --- Beat 5: A DIFFERENT BRANCH, SAME ROOT. Revise a sibling leaf under a
  // DIFFERENT sub-question — A1, under Sub-Question A. Now a DIFFERENT path
  // lights: Finding A1 → Synthesis A → Root Synthesis. Sub-Synthesis B and C and
  // all their findings stay DARK. The root re-synthesizes again, but the branch
  // that moved below it is the A branch this time — two different sub-synthesis
  // nodes lit across the two beats, the SAME root.
  reviseLeaf("A1", { claim: "transformers scale predictably with data, compute, and params" });

  // --- Beat 6: FAIL. A leaf's source excerpt is unparseable — Finding C1 THROWS
  // ⇒ a `failed` receipt (red node), no downstream lights, prior truth stands.
  // Sub-Synthesis C and the Root never wake from a failed finding.
  reviseLeaf("C1", { corrupt: true });

  // --- Beat 7: RECOVER. The next C1 revision parses cleanly ⇒ Finding C1 flashes
  // green; its path lights: Finding C1 → Synthesis C → Root Synthesis.
  reviseLeaf("C1", { claim: "evals must isolate exactly one capability per probe" });

  // --- Beat 8: DEEP TWO-LEAF CONVERGENCE. Revise TWO sibling leaves under the
  // SAME sub-question (B1 and B3, both under Sub-Question B) in one drain. Both
  // findings wake; Sub-Synthesis B is woken EXACTLY ONCE (convergent fan-in),
  // not twice; the root re-synthesizes once. Sub-Questions A and C stay dark.
  {
    const b1 = corpus["B1"]!;
    corpus["B1"] = { ...b1, rev: b1.rev + 1, claim: "retrieval grounds generation in the freshest sources" };
    const b3 = corpus["B3"]!;
    corpus["B3"] = { ...b3, rev: b3.rev + 1, claim: "cross-encoder rerankers lift top-k relevance sharply" };
    publishAndWake(); // single drain — both B leaves light, Synthesis B woken once
  }

  // --- Beat 9: FINAL QUIET. Byte-identical re-scans — back to dim pulses, flat
  // line (the bookend: it goes quiet again). LONG enough that the prior fresh
  // ticks scroll fully out of the sparkline window, so the bookend reads
  // genuinely flat near zero.
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();

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
    facets: LEAVES.map((leaf) => LEAF_FACET(leaf)),
  };
}
