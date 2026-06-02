// The research-tree example GENERATOR — produces a deterministic, replayable
// `replay/` state-dir that BOTH the deterministic gate (research-tree.test.ts)
// and reactor-devtools can replay unchanged.
//
// This is the SESSION-as-compiler frozen into an artifact: there is no parser /
// interpreter here. The intelligent compile (choosing the tree shape, the per-
// leaf facet tokens, the contract fingerprints) is baked into the declarations
// below; the DUMB reconciler (`mountDag` -> `dag.ingest`) replays them and the
// memo key decides, per node, whether it renders.
//
// THE TENET THIS TEACHES — propagation UP a recursive tree with per-branch
// memoization. Raw sources sit at the bottom. A "Sources" gateway watches the
// corpus and exposes ONE FACET PER LEAF FINDING. Each finding leaf subscribes to
// ONLY its own leaf facet. The leaves fan UP into a sub-synthesis per sub-
// question (A, B, C); the three sub-syntheses fan UP into a single root
// synthesis. Edges point leaf -> sub-synthesis -> root: PROPAGATION FLOWS UP.
//
//   THE AHA — partial propagation UP a deep tree. Revise ONE leaf finding three
//   levels down (B2, under sub-question B) and ONLY its ancestor path wakes:
//   Finding B2 -> Synthesis B -> Root Synthesis. Sub-questions A and C and ALL of
//   their findings stay DARK. The ancestor chain is bounded by tree DEPTH, never
//   tree SIZE.
//
// State-dir shape (matches every devtools fixture so devtools replays it unchanged):
//   replay/receipts.json              (flat ROOT append-only ledger trail)
//   replay/world-models/<hexNodeId>/… (per-node published truth + history)
//   replay/compile/topology.json      (the flat TopologyWorldModel)
//   replay/compile/labels.json        (nodeId -> friendly label)
//   replay/beats.json                 (scripted beat timeline; SELF-WRITTEN here so
//                                       a regen is LOSSLESS — see plan §6 caveat)
//
// Everything below uses ONLY the public @openprose/reactor + /sdk exports.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  createFileSystemStorageAdapter,
  type Cost,
  type WakeSource,
  type Wake,
} from "@openprose/reactor";
import {
  FileSystemWorldModelStore,
  fingerprintArtifact,
  type WorldModelFiles,
} from "@openprose/reactor/adapters";
import type {
  Fingerprint,
  Facet,
  TopologyWorldModel,
  TopologyNode,
  TopologyEdge,
} from "@openprose/reactor/internals";

import {
  mountDag,
  files,
  jsonFile,
  ATOMIC_FACET,
  type RenderContext,
  type RenderProduct,
} from "@openprose/reactor";
import {
  FileSystemReceiptLedger,
  readTextFile,
  type WorldModelStore,
} from "@openprose/reactor/adapters";
import {
  zeroCost,
  createNullSignature,
  EMPTY_SEMANTIC_DIFF,
  type ReconcilerTopology,
} from "@openprose/reactor/internals";

// ---------------------------------------------------------------------------
// The tree shape. Three sub-questions; A and B have three finding leaves each,
// C has two — eight leaves total.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.corpus"; // the phantom edge: the raw sources corpus
const GATEWAY = "gateway.sources"; // entry point; ONE facet per leaf finding

type SubId = "A" | "B" | "C";
const SUBS: readonly SubId[] = ["A", "B", "C"] as const;

const LEAVES_BY_SUB: Record<SubId, readonly string[]> = {
  A: ["A1", "A2", "A3"],
  B: ["B1", "B2", "B3"],
  C: ["C1", "C2"],
};
const LEAVES: readonly string[] = SUBS.flatMap((s) => LEAVES_BY_SUB[s]);
const SUB_OF_LEAF: Record<string, SubId> = Object.fromEntries(
  SUBS.flatMap((s) => LEAVES_BY_SUB[s].map((leaf) => [leaf, s] as const)),
);

const FINDING = (leaf: string): string => `finding.${leaf}`;
const SUBSYNTH = (sub: SubId): string => `synthesis.sub-${sub}`;
const ROOT = "synthesis.root";

// One facet per leaf finding on the gateway — the dark-lane boundary. Revising
// leaf B2 moves ONLY `leaf:B2`; every sibling leaf token is byte-identical.
const LEAF_FACET = (leaf: string): Facet => `leaf:${leaf}`;

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId -> human label).
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
// The cost model — fresh tokens scale with how much NEW material a render had to
// digest. `surprise_cause` MUST equal the wake source (receipt validation
// enforces it — read it off ctx.wake.source, never hardcode).
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 180;
const REUSED_FLOOR = 240;
const SUBSYNTH_FRESH_MULTIPLIER = 4;
const ROOT_FRESH_MULTIPLIER = 7;

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
// The corpus payload.
// ---------------------------------------------------------------------------

interface LeafState {
  readonly leaf: string;
  readonly sub: SubId;
  readonly rev: number;
  readonly claim: string;
  readonly corrupt?: boolean;
}

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

// ---------------------------------------------------------------------------
// Reading upstream truth by reference.
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
  const bytes = fm["corpus.json"];
  const corpus: Partial<Corpus> =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as Corpus);
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const leaf of LEAVES) {
    out[LEAF_FACET(leaf)] = materialFingerprint(corpus[leaf] ?? null);
  }
  return out;
};

// THE dark-lane boundary: each leaf slice projects into an INDEPENDENT facet
// token. A single-leaf revision moves ONLY that leaf's token.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const leaves = (t["leaves"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const leaf of LEAVES) {
    out[LEAF_FACET(leaf)] = materialFingerprint(leaves[leaf] ?? null);
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

// A finding leaf: read ONLY its own leaf slice. A corrupt excerpt makes it THROW
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

// A sub-synthesis: fan IN from its OWN sub-question's findings (atomic).
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

// The Root Synthesis: fan IN from all three sub-syntheses (atomic) — the apex.
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
// Topology assembly. The session (not a parser) produces this; the fingerprints
// are part of the frozen compile.
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
// The scripted beat timeline (self-written to beats.json so regen is LOSSLESS).
// ---------------------------------------------------------------------------

const BEATS = {
  scenario: "research-tree",
  title:
    "Revise one finding three levels down. Only its ancestors re-synthesize. The other branches don't move.",
  beats: [
    {
      name: "cold-boot",
      park: 18,
      from: 0,
      to: 20,
      holdMs: 2600,
      caption: "the research tree builds bottom-up · 8 findings → 3 sub-syntheses → root, lit once",
    },
    {
      name: "quiet",
      park: 30,
      from: 21,
      to: 30,
      holdMs: 2400,
      caption: "dim skip pulses · the whole tree memo-skips · cost flat near zero",
    },
    {
      name: "self-tick",
      park: 28,
      from: 27,
      to: 28,
      holdMs: 2600,
      caption: "self-tick audit floor · a lone self-pulse on the root, no edges, no cost",
    },
    {
      name: "hero-ancestor-path",
      park: 35,
      from: 31,
      to: 35,
      holdMs: 3800,
      caption:
        "HERO: revise Finding B2 · only B2 → Synthesis B → Root lights · 7 sibling findings + Synthesis A & C stay DARK",
    },
    {
      name: "different-branch-same-root",
      park: 40,
      from: 36,
      to: 40,
      holdMs: 3600,
      caption: "revise Finding A1 · a DIFFERENT path lights: A1 → Synthesis A → same Root · B & C stay dark",
    },
    {
      name: "red-fail",
      park: 43,
      from: 41,
      to: 43,
      holdMs: 3000,
      caption: "Finding C1 source is unparseable · it fails RED · no ancestor wakes, prior answer stands",
    },
    {
      name: "recover",
      park: 46,
      from: 44,
      to: 48,
      holdMs: 2800,
      caption: "C1 recovers GREEN · its path lights: C1 → Synthesis C → Root",
    },
    {
      name: "converge-two-leaves",
      park: 53,
      from: 49,
      to: 55,
      holdMs: 3200,
      caption:
        "revise B1 AND B3 in one drain · Synthesis B woken EXACTLY once · root re-synthesizes once · A & C dark",
    },
    {
      name: "final-quiet",
      park: 71,
      from: 56,
      to: 71,
      holdMs: 2600,
      caption: "it goes quiet again · the tree memo-skips · cost back to flat",
    },
  ],
} as const;

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
 * Build the deterministic research-tree state-dir at `opts.stateDir`. Drives the
 * scripted beat timeline through the REAL @openprose/reactor reconciler over the
 * FileSystem store + ledger, then writes compile/topology.json + compile/labels.json
 * + beats.json. Re-running with the same path reproduces the bytes.
 */
export function generateResearchTree(opts: GenerateOptions): GenerateResult {
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
    ...LEAVES.map<NodeDecl>((leaf) => ({
      id: FINDING(leaf),
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: LEAF_FACET(leaf) }],
      render: findingRender(deps, leaf),
      canonicalizer: atomicTruth,
    })),
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
      requires: SUBS.map((sub) => ({ producer: SUBSYNTH(sub) })),
      render: rootRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  const corpus: Corpus = seedCorpus();

  const publishAndWake = (): void => {
    const fm = files({ "corpus.json": jsonFile(corpus) });
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
  // The scripted beat timeline (mirrors BEATS above).
  // ======================================================================

  // --- Beat 1: COLD BOOT. Every node renders once, bottom-up.
  publishAndWake();

  // --- Beat 2: QUIET STRETCH. Byte-identical re-scans: the WHOLE tree memo-SKIPS.
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Beat 3: SELF-TICK FLOOR. A lone self-sourced wake on the Root.
  dag.tick(ROOT);
  dag.tick(ROOT);

  publishAndWake();

  // --- Beat 4: THE HERO. Revise ONE leaf finding three levels down — B2.
  reviseLeaf("B2", { claim: "chunk size of ~512 tokens balances recall and precision" });

  // --- Beat 5: A DIFFERENT BRANCH, SAME ROOT — A1.
  reviseLeaf("A1", { claim: "transformers scale predictably with data, compute, and params" });

  // --- Beat 6: FAIL. A leaf's source excerpt is unparseable — Finding C1 THROWS.
  reviseLeaf("C1", { corrupt: true });

  // --- Beat 7: RECOVER. The next C1 revision parses cleanly.
  reviseLeaf("C1", { claim: "evals must isolate exactly one capability per probe" });

  // --- Beat 8: DEEP TWO-LEAF CONVERGENCE — B1 and B3 in one drain.
  {
    const b1 = corpus["B1"]!;
    corpus["B1"] = { ...b1, rev: b1.rev + 1, claim: "retrieval grounds generation in the freshest sources" };
    const b3 = corpus["B3"]!;
    corpus["B3"] = { ...b3, rev: b3.rev + 1, claim: "cross-encoder rerankers lift top-k relevance sharply" };
    publishAndWake();
  }

  // --- Beat 9: FINAL QUIET. Byte-identical re-scans.
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Persist the compile snapshot + beats (all MANDATORY for replay) ------
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
  // SELF-WRITE beats.json so a regen never clobbers a co-located beat map
  // (plan §6: the news-desk/inbox-triage/research-tree clean:true caveat).
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
    facets: LEAVES.map((leaf) => LEAF_FACET(leaf)),
  };
}

// Allow `tsx generate.ts` / `node generate.js` to regenerate the committed
// replay/ dir in place.
if (require.main === module) {
  const out = generateResearchTree({ stateDir: join(__dirname, "replay") });
  // eslint-disable-next-line no-console
  console.log(
    `research-tree replay/: ${out.receiptsCount} receipts, ${out.nodeCount} nodes, ${out.edgeCount} edges`,
  );
}
