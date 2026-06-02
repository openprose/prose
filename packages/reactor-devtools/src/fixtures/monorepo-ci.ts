// The Monorepo CI fixture GENERATOR — produces a deterministic, replayable
// `<state-dir>` that drives the "incremental CI" demo. It is a sibling of
// `agent-observatory.ts` and reuses ONLY the public, exported SDK primitives;
// no SDK change is required.
//
// THE STORY (what the recording must land):
//   Your CI re-ran 200 checks. Reactor re-ran 3 — the ones your 4-line diff
//   actually touched.
//
//   A monorepo workspace gateway watches the repo and exposes ONE FACET PER
//   PACKAGE (pkg-core, pkg-ui, pkg-api, pkg-utils, pkg-auth, pkg-billing). Per
//   package there is a build node (subscribes to its own package facet), a test
//   node (subscribes to its build), and a lint node (subscribes to its package
//   facet). A typecheck node and a review node fan in from ALL builds; a
//   merge-gate fans in from all tests + all lints + review + typecheck.
//
//   A REAL dependency edge makes pkg-core a HUB: pkg-ui / pkg-api / pkg-auth
//   builds also subscribe to `build.pkg-core`'s compiled-output facet. So:
//     - a single-package LEAF diff (pkg-ui, 4 lines) moves ONLY the `pkg-ui`
//       gateway facet ⇒ ONLY build.pkg-ui → test.pkg-ui → review/typecheck →
//       merge-gate wake. The other 5 packages' build + test + lint nodes stay
//       SKIPPED (the dark lanes).
//     - a HUB diff (pkg-core) moves the `pkg-core` facet ⇒ build.pkg-core wakes,
//       its compiled-output facet moves, and that FANS OUT to rebuild ui / api /
//       auth (+ their tests) — a visibly WIDER lane, same graph, bigger blast
//       radius, still far short of "rebuild everything" (utils + billing stay
//       dark).
//
// THE MECHANICAL FIX vs masked-relay (the observatory's load-bearing lesson):
//   the gateway canonicalizer emits INDEPENDENT per-package facet tokens. A
//   pkg-ui change perturbs the `pkg-ui` token and NOTHING else; the five sibling
//   tokens are byte-identical, so their build/test/lint lanes never wake. The
//   siblings MUST NOT move together — that is what makes the dark lane REAL.
//
// It persists the SAME full state-dir shape agent-observatory does:
//   <state-dir>/receipts.json              (durable append-only ledger trail)
//   <state-dir>/world-models/<node>/…      (per-node published truth + history)
//   <state-dir>/compile/topology.json      (the flat TopologyWorldModel the SPA draws)
//   <state-dir>/compile/labels.json        (nodeId → friendly label for the SPA)
//   <state-dir>/beats.json                 (the recorder's beat map; see below)
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much actually moved.
// Same generator ⇒ byte-identical state-dir ⇒ the devtools replays the same
// animation every time.

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
  externalWake,
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
  type ReconcilerTopology, asFacet, asFingerprint, asNodeId} from "@openprose/reactor/internals";

import { materialFingerprint, readJson } from "./_fixture-shared";

// ---------------------------------------------------------------------------
// Node identities (relatable names — the labels the SPA shows come from the
// labels map below; the ids stay namespaced for the topology).
// ---------------------------------------------------------------------------

const SOURCE = "ingress.repo"; // the phantom edge: the monorepo working tree
const GATEWAY = "gateway.workspace"; // entry point; ONE facet per package

// The six packages — the rows of build/test/lint that are mostly DARK in the
// leaf hero beat.
const PACKAGES = ["pkg-core", "pkg-ui", "pkg-api", "pkg-utils", "pkg-auth", "pkg-billing"] as const;
type Pkg = (typeof PACKAGES)[number];

// pkg-core is the HUB. ui / api / auth depend on it (their builds also consume
// the compiled core output). utils + billing are independent leaves.
const HUB: Pkg = "pkg-core";
const DEPENDENTS: readonly Pkg[] = ["pkg-ui", "pkg-api", "pkg-auth"];
function dependsOnHub(pkg: Pkg): boolean {
  return DEPENDENTS.includes(pkg);
}

const BUILD: Record<Pkg, string> = {
  "pkg-core": "build.pkg-core",
  "pkg-ui": "build.pkg-ui",
  "pkg-api": "build.pkg-api",
  "pkg-utils": "build.pkg-utils",
  "pkg-auth": "build.pkg-auth",
  "pkg-billing": "build.pkg-billing",
};
const TEST: Record<Pkg, string> = {
  "pkg-core": "test.pkg-core",
  "pkg-ui": "test.pkg-ui",
  "pkg-api": "test.pkg-api",
  "pkg-utils": "test.pkg-utils",
  "pkg-auth": "test.pkg-auth",
  "pkg-billing": "test.pkg-billing",
};
const LINT: Record<Pkg, string> = {
  "pkg-core": "lint.pkg-core",
  "pkg-ui": "lint.pkg-ui",
  "pkg-api": "lint.pkg-api",
  "pkg-utils": "lint.pkg-utils",
  "pkg-auth": "lint.pkg-auth",
  "pkg-billing": "lint.pkg-billing",
};

const TYPECHECK = "check.typecheck";
const REVIEW = "check.review";
const MERGE_GATE = "gate.merge";

// --- Facet tokens -----------------------------------------------------------

// One facet per package on the gateway — the dark-lane boundary.
const PKG_FACET: Record<Pkg, Facet> = {
  "pkg-core": asFacet("pkg-core"),
  "pkg-ui": asFacet("pkg-ui"),
  "pkg-api": asFacet("pkg-api"),
  "pkg-utils": asFacet("pkg-utils"),
  "pkg-auth": asFacet("pkg-auth"),
  "pkg-billing": asFacet("pkg-billing"),
};

// The compiled-output facet that build.pkg-core exposes to its dependents'
// builds. It moves ONLY when the core build's compiled artifact changes — so a
// pkg-core source change fans out, but a pkg-ui change (which doesn't touch
// core) leaves it byte-identical and the fan-out stays asleep.
const CORE_OUT_FACET = asFacet("core-dist");

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label). Load-bearing for the
// read: boxes say "build pkg-ui", not `build.pkg-ui`.
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [SOURCE]: "Working Tree",
  [GATEWAY]: asFingerprint("Workspace"),
  [BUILD["pkg-core"]]: "build · pkg-core",
  [BUILD["pkg-ui"]]: "build · pkg-ui",
  [BUILD["pkg-api"]]: "build · pkg-api",
  [BUILD["pkg-utils"]]: "build · pkg-utils",
  [BUILD["pkg-auth"]]: "build · pkg-auth",
  [BUILD["pkg-billing"]]: "build · pkg-billing",
  [TEST["pkg-core"]]: "test · pkg-core",
  [TEST["pkg-ui"]]: "test · pkg-ui",
  [TEST["pkg-api"]]: "test · pkg-api",
  [TEST["pkg-utils"]]: "test · pkg-utils",
  [TEST["pkg-auth"]]: "test · pkg-auth",
  [TEST["pkg-billing"]]: "test · pkg-billing",
  [LINT["pkg-core"]]: "lint · pkg-core",
  [LINT["pkg-ui"]]: "lint · pkg-ui",
  [LINT["pkg-api"]]: "lint · pkg-api",
  [LINT["pkg-utils"]]: "lint · pkg-utils",
  [LINT["pkg-auth"]]: "lint · pkg-auth",
  [LINT["pkg-billing"]]: "lint · pkg-billing",
  [TYPECHECK]: "Typecheck (all builds)",
  [REVIEW]: "Review (all builds)",
  [MERGE_GATE]: "Merge Gate",
};

// ---------------------------------------------------------------------------
// The cost model — what makes the token meter SING (the cost-meter hero shot)
// ---------------------------------------------------------------------------
//
// Fresh tokens scale with how much NEW material a render had to compile / run.
// The reconciler stamps `skipped` receipts with zeroCost automatically
// (fresh:0 — a flat line). A build's fresh scales with the lines of source it
// recompiled; a test's fresh with the cases it re-ran. The hub-rebuild beat is
// visibly heavier than the leaf beat (more nodes wake) without any single tall
// spike — the Aha here is BREADTH (how many lanes), not a lone expensive node.
//
// `surprise_cause` MUST equal the wake source (receipt validation enforces it).

const FRESH_PER_UNIT = 140; // fresh tokens per unit of new material compiled/run
const REUSED_FLOOR = 220; // reused tokens always carried (prior artifact + contract)

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
      reused: REUSED_FLOOR + reusedUnits * 30,
    },
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// The repo payload: a flat map of per-package source state. A "diff" mutates
// exactly one package's slice (so exactly one package facet moves).
// ---------------------------------------------------------------------------

interface PkgState {
  readonly name: Pkg;
  /** Monotonic source revision — bumping it is a diff that touched this pkg. */
  readonly rev: number;
  /** Lines-of-source changed by the most recent diff (drives build fresh). */
  readonly diffLines: number;
  /** The head commit subject for this package. */
  readonly head: string;
  /** When true, this package's test render THROWS (a RED failed receipt). */
  readonly testBroken?: boolean;
}

// The mutable repo the generator drives. Keyed by package name.
type Repo = Record<Pkg, PkgState>;

function seedRepo(): Repo {
  // Cold boot: every package at rev 1. The whole CI runs once (full cascade).
  return {
    "pkg-core": { name: "pkg-core", rev: 1, diffLines: 30, head: "initial core types" },
    "pkg-ui": { name: "pkg-ui", rev: 1, diffLines: 24, head: "initial ui components" },
    "pkg-api": { name: "pkg-api", rev: 1, diffLines: 22, head: "initial api routes" },
    "pkg-utils": { name: "pkg-utils", rev: 1, diffLines: 12, head: "initial utils" },
    "pkg-auth": { name: "pkg-auth", rev: 1, diffLines: 18, head: "initial auth" },
    "pkg-billing": { name: "pkg-billing", rev: 1, diffLines: 16, head: "initial billing" },
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

// The ingress source exposes one facet per package — the fingerprint of ONLY
// that package's slice. This is the root of the dark lane: mutate pkg-ui's
// slice and only the `pkg-ui` ingress facet moves.
const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["repo.json"];
  const repo: Partial<Repo> =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as Repo);
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const pkg of PACKAGES) {
    out[PKG_FACET[pkg]] = materialFingerprint(repo[pkg] ?? null);
  }
  return out;
};

// THE dark-lane boundary. The gateway re-projects each package slice into an
// INDEPENDENT facet token. A pkg-ui-only change moves ONLY `pkg-ui`; the five
// sibling tokens are byte-identical to the prior frame, so the five sibling
// build/test/lint lanes stay dark.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const packages = (t["packages"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const pkg of PACKAGES) {
    out[PKG_FACET[pkg]] = materialFingerprint(packages[pkg] ?? null);
  }
  return out;
};

// build.pkg-core exposes its compiled-output as the `core-dist` facet so its
// dependents (ui / api / auth builds) wake on a core rebuild but stay dark
// otherwise. The fingerprint is of ONLY the compiled artifact summary, so a
// no-op core re-render (memo skip) never wakes the fan-out either.
const coreBuildCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [CORE_OUT_FACET]: asFingerprint(materialFingerprint(t["dist"] ?? null)),
  };
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved)
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}

type Render = (ctx: RenderContext) => RenderProduct;

// The gateway: read the raw repo, normalize into a per-package view. The
// per-package structure is what the canonicalizer projects into independent
// facet tokens.
function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const repo = (readJson<Partial<Repo>>(deps.store, SOURCE, "repo.json") ?? {}) as Partial<Repo>;
    const packages: Record<string, unknown> = {};
    for (const pkg of PACKAGES) {
      const p = repo[pkg];
      packages[pkg] = p
        ? { name: p.name, rev: p.rev, diffLines: p.diffLines, head: p.head, testBroken: p.testBroken ?? false }
        : null;
    }
    return commit({ packages, workspace: PACKAGES.length }, renderCost(ctx, 1, 1));
  };
}

// A package build: read ONLY its own package slice off the gateway (and, for a
// hub-dependent, the compiled core output) and "compile" it. Fresh scales with
// the diffed lines. The hub build exposes a `dist` summary that its dependents
// consume.
function buildRender(deps: Deps, pkg: Pkg): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const packages = (gw?.["packages"] ?? {}) as Record<string, PkgState | null>;
    const mine = packages[pkg];
    if (mine === null || mine === undefined) {
      return commit({ pkg, built: false, rev: 0 }, renderCost(ctx, 1, 1));
    }
    // Dependents read the hub's compiled output (proving the real dep edge).
    let coreRev = 0;
    if (dependsOnHub(pkg)) {
      const core = readJson(deps.store, BUILD[HUB]);
      coreRev = (core?.["rev"] as number) ?? 0;
    }
    const world: Record<string, unknown> = {
      pkg,
      built: true,
      rev: mine.rev,
      head: mine.head,
      compiledLines: mine.diffLines,
      coreRev,
      // The build records the EXPECTED test status for this package's CI job.
      // The merge-gate reads this (not the test's stale published truth) so a
      // tick whose test render THROWS is recorded as a non-passing job and the
      // gate goes BLOCKED — even though the failed test never published truth.
      testStatus: mine.testBroken ? "RED" : "GREEN",
    };
    if (pkg === HUB) {
      // The hub build exposes a `dist` summary; only THIS moves the core-dist
      // facet that the dependents subscribe to.
      world["dist"] = { rev: mine.rev, hash: `core@${mine.rev}` };
    }
    // Fresh scales with the lines this build had to recompile.
    return commit(world, renderCost(ctx, Math.max(1, mine.diffLines), 1));
  };
}

// A package test: read its build off the store, "run the suite". If the
// package is flagged testBroken, the render THROWS (a render that fails → a
// `failed` receipt, no downstream merge-gate pass, prior truth stands). This is
// the failing pkg-api render-throw beat.
function testRender(deps: Deps, pkg: Pkg): Render {
  return (ctx) => {
    const build = readJson(deps.store, BUILD[pkg]);
    const rev = (build?.["rev"] as number) ?? 0;
    const compiledLines = (build?.["compiledLines"] as number) ?? 0;
    // We have to look at the gateway to know whether the suite is broken — the
    // build doesn't carry the flag (a build can succeed while a test fails).
    const gw = readJson(deps.store, GATEWAY);
    const packages = (gw?.["packages"] ?? {}) as Record<string, PkgState | null>;
    const mine = packages[pkg];
    if (mine?.testBroken) {
      // A render exception: e.g. a component throws during a render test.
      throw new Error(`${pkg} test: render threw — <Component/> crashed at rev ${rev}`);
    }
    // Fresh scales with the cases re-run (proportional to changed lines).
    const cases = Math.max(1, Math.round(compiledLines / 2));
    return commit({ pkg, rev, cases, passed: true }, renderCost(ctx, cases, 1));
  };
}

// A package lint: read ONLY its own package facet off the gateway and "lint".
// A leaf change lights only its own lint; siblings stay dark. Lint is cheap.
function lintRender(deps: Deps, pkg: Pkg): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const packages = (gw?.["packages"] ?? {}) as Record<string, PkgState | null>;
    const mine = packages[pkg];
    const rev = mine?.rev ?? 0;
    return commit({ pkg, rev, lintClean: true }, renderCost(ctx, 1, 1));
  };
}

// Typecheck: fans in from ALL builds (atomic). It re-checks the whole project's
// types, so a build moving wakes it. Fresh scales with how many builds moved is
// approximated by the number of packages built (here it always reads all).
function typecheckRender(deps: Deps): Render {
  return (ctx) => {
    let total = 0;
    const revs: Record<string, number> = {};
    for (const pkg of PACKAGES) {
      const b = readJson(deps.store, BUILD[pkg]);
      const rev = (b?.["rev"] as number) ?? 0;
      revs[pkg] = rev;
      total += rev;
    }
    return commit({ revs, total }, renderCost(ctx, 4, 2));
  };
}

// Review: fans in from ALL builds (atomic). The automated reviewer reads the
// build summaries and renders a verdict.
function reviewRender(deps: Deps): Render {
  return (ctx) => {
    const heads: Record<string, string> = {};
    for (const pkg of PACKAGES) {
      const b = readJson(deps.store, BUILD[pkg]);
      heads[pkg] = (b?.["head"] as string) ?? "";
    }
    return commit({ heads, verdict: "approved" }, renderCost(ctx, 3, 2));
  };
}

// The merge-gate: fans in from all tests + all lints + review + typecheck. It
// is the terminal node — it only renders (a `pass`) when its inputs all moved
// cleanly. When a test failed upstream, that test produced a `failed` receipt
// and never published new truth, so the merge-gate either does not wake on that
// facet OR sees stale test truth. We model the gate as reading every test's
// `passed` flag and refusing to pass if any is missing/false.
function mergeGateRender(deps: Deps): Render {
  return (ctx) => {
    const tests: Record<string, string> = {};
    let allPass = true;
    for (const pkg of PACKAGES) {
      // Read the CI test status the build recorded for this package's job. A
      // failed test render publishes NO new truth, but the build's recorded
      // status is RED — so the gate sees the regression even though the test
      // node's own truth is stale (the realistic "the test job failed" read).
      const build = readJson(deps.store, BUILD[pkg]);
      const status = (build?.["testStatus"] as string) ?? "GREEN";
      tests[pkg] = status;
      if (status !== "GREEN") allPass = false;
    }
    const review = readJson(deps.store, REVIEW);
    const typecheck = readJson(deps.store, TYPECHECK);
    const verdict = (review?.["verdict"] as string) ?? "pending";
    return commit(
      {
        tests,
        review: verdict,
        typecheck: (typecheck?.["total"] as number) ?? 0,
        merge: allPass && verdict === "approved" ? "GREEN" : "BLOCKED",
      },
      renderCost(ctx, 2, 3),
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
 * Build the deterministic Monorepo CI state-dir at `opts.stateDir`. Drives the
 * scripted beat timeline through the REAL reconciler over the FileSystem store +
 * ledger, then writes `compile/topology.json` + `compile/labels.json` +
 * `beats.json`. Re-running with the same path reproduces the bytes.
 */
export function generateMonorepoCiFixture(opts: GenerateOptions): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  // The one Substrate primitive: storage at `<stateDir>/receipts.json`, the
  // world-model store under `<stateDir>/world-models`, and the durable ledger
  // re-derived from that storage — the exact split this fixture wired by hand
  // before, now one blessed factory.
  const { worldModel: store, ledger } = fileSystemSubstrate({
    directory: stateDir,
  });

  const deps: Deps = { store };

  const decls: NodeDecl[] = [
    {
      id: GATEWAY,
      kind: "gateway",
      // The gateway watches the whole repo (atomic): any package slice moving
      // wakes it; its canonicalizer then splits the change into per-package facets.
      requires: [{ producer: SOURCE, facet: ATOMIC_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    // Six package builds — each subscribes to ONLY its own package facet; the
    // three hub-dependents ALSO subscribe to the core-dist facet (the real dep).
    ...PACKAGES.map<NodeDecl>((pkg) => ({
      id: BUILD[pkg],
      kind: "responsibility",
      requires: dependsOnHub(pkg)
        ? [
            { producer: GATEWAY, facet: PKG_FACET[pkg] },
            { producer: BUILD[HUB], facet: CORE_OUT_FACET },
          ]
        : [{ producer: GATEWAY, facet: PKG_FACET[pkg] }],
      render: buildRender(deps, pkg),
      canonicalizer: pkg === HUB ? coreBuildCanon : atomicTruth,
    })),
    // Six package tests — each subscribes to ONLY its own build.
    ...PACKAGES.map<NodeDecl>((pkg) => ({
      id: TEST[pkg],
      kind: "responsibility",
      requires: [{ producer: BUILD[pkg] }],
      render: testRender(deps, pkg),
      canonicalizer: atomicTruth,
    })),
    // Six package lints — each subscribes to ONLY its own package facet.
    ...PACKAGES.map<NodeDecl>((pkg) => ({
      id: LINT[pkg],
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: PKG_FACET[pkg] }],
      render: lintRender(deps, pkg),
      canonicalizer: atomicTruth,
    })),
    {
      id: TYPECHECK,
      kind: "responsibility",
      // Fans in from ALL builds (atomic).
      requires: PACKAGES.map((pkg) => ({ producer: BUILD[pkg] })),
      render: typecheckRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: REVIEW,
      kind: "responsibility",
      // Fans in from ALL builds (atomic).
      requires: PACKAGES.map((pkg) => ({ producer: BUILD[pkg] })),
      render: reviewRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: MERGE_GATE,
      kind: "responsibility",
      // Fans in from all tests + all lints + review + typecheck.
      requires: [
        ...PACKAGES.map((pkg) => ({ producer: TEST[pkg] })),
        ...PACKAGES.map((pkg) => ({ producer: LINT[pkg] })),
        { producer: REVIEW },
        { producer: TYPECHECK },
      ],
      render: mergeGateRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  // The mutable repo the generator drives.
  const repo: Repo = seedRepo();

  // Re-publish the repo source and wake the gateway. When `repo` is
  // byte-identical to the prior publish, the gateway memo-skips and the whole
  // graph below it memo-skips too (the quiet-world re-wake).
  const publishAndWake = (): void => {
    const fm = files({ "repo.json": jsonFile(repo) });
    const commitRes = store.commitPublished(SOURCE, fm, ingressCanon);
    const prev = ledger.lastReceipt(SOURCE);
    const prevRef = prev !== null ? ledger.addressOf(prev) : null;
    const wake = externalWake();
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

  // Mutate exactly one package's slice (so exactly one package facet moves).
  const editPkg = (
    pkg: Pkg,
    patch: Partial<Pick<PkgState, "head" | "diffLines" | "testBroken">>,
  ): void => {
    const prev = repo[pkg];
    repo[pkg] = {
      ...prev,
      rev: prev.rev + 1,
      head: patch.head ?? prev.head,
      diffLines: patch.diffLines ?? prev.diffLines,
      testBroken: patch.testBroken ?? false,
    };
    publishAndWake();
  };

  // ======================================================================
  // The scripted beat timeline.
  // ======================================================================

  // --- Beat 1: COLD BOOT. Seed the repo; every node renders once — the full CI
  // runs: all 6 builds, 6 tests, 6 lints, typecheck, review, merge-gate (GREEN).
  // The whole graph lights up once (the establishing "200 checks ran" shot).
  publishAndWake();

  // --- Beat 2: QUIET STRETCH. Byte-identical re-scans: the WHOLE graph
  // memo-SKIPS — a long field of dim skip pulses, the fresh-line flat near zero.
  // (Long on purpose: the "CI re-runs nothing when nothing changed" half.)
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Beat 3: SELF-TICK FLOOR. A lone self-sourced wake on the merge-gate in
  // the quiet world. Its inputs have not moved ⇒ a `self` skipped receipt that
  // lights no edges and costs ~nothing (the audit floor).
  dag.tick(MERGE_GATE);
  dag.tick(MERGE_GATE);

  // a little more quiet so the floor reads as flat before the surprise.
  publishAndWake();

  // --- Beat 4: THE HERO — a 4-line pkg-ui diff. ONLY the `pkg-ui` package facet
  // moves ⇒ ONLY build.pkg-ui → test.pkg-ui wake (plus lint.pkg-ui, typecheck,
  // review, merge-gate fan-in). The OTHER FIVE packages' build/test/lint lanes
  // stay SKIPPED — the dark lanes. pkg-core did NOT move, so its dist facet is
  // byte-identical and the api/auth builds stay asleep. The cost meter ticks
  // ONCE off the flat line.
  editPkg("pkg-ui", { head: "fix(ui): 4-line button padding tweak", diffLines: 4 });

  // --- Beat 5: HUB FAN-OUT — a pkg-core diff. The `pkg-core` facet moves ⇒
  // build.pkg-core wakes, its `core-dist` facet moves, and that fans out to
  // REBUILD ui / api / auth (+ their tests). A visibly WIDER lane than the leaf
  // beat — same graph, bigger blast radius — yet utils + billing build/test
  // stay DARK (they don't depend on core). Far short of "rebuild everything".
  editPkg("pkg-core", { head: "refactor(core): change shared type signature", diffLines: 30 });

  // --- Beat 6: RED — a failing pkg-api test. A pkg-api diff lands whose render
  // test THROWS (a component crashes during a render test). build.pkg-api
  // rebuilds fine (GREEN) but test.pkg-api produces a `failed` receipt (RED) —
  // no new test truth, the merge-gate sees a non-passing pkg-api test and goes
  // BLOCKED on this tick. No downstream merge pass.
  editPkg("pkg-api", { head: "feat(api): new render path (regresses a test)", diffLines: 10, testBroken: true });

  // --- Beat 7: GREEN RECOVER. The fix lands: the next pkg-api diff parses and
  // its test passes ⇒ test.pkg-api flashes GREEN, its lane lights, and the
  // merge-gate fans in to a GREEN merge again.
  editPkg("pkg-api", { head: "fix(api): guard the render path — test green", diffLines: 6 });

  // --- Beat 8: FINAL QUIET. Byte-identical re-scans — back to dim pulses, flat
  // line (the bookend: CI goes quiet again, nothing to re-run). LONG enough that
  // the hub-rebuild and recover spend scroll fully out of the sparkline window.
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
  // The friendly labels map for the SPA (nodeId → human label).
  writeFileSync(
    join(compileDir, "labels.json"),
    `${JSON.stringify(LABELS, null, 2)}\n`,
    "utf8",
  );
  // The recorder's beat map. Frame indices are tuned against `--describe`.
  writeFileSync(join(stateDir, "beats.json"), `${JSON.stringify(BEATS, null, 2)}\n`, "utf8");

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [...PACKAGES.map((pkg) => PKG_FACET[pkg]), CORE_OUT_FACET],
  };
}

// ---------------------------------------------------------------------------
// The recorder's beat map (frame indices tuned against `--describe`; see the
// committed beats.json in fixtures/monorepo-ci/). Exported so the test and the
// recorder share one source of truth.
// ---------------------------------------------------------------------------

export const BEATS = {
  scenario: "monorepo-ci",
  title: "Your CI re-ran 200 checks. Reactor re-ran 3 — the ones your 4-line diff actually touched.",
  beats: [
    {
      name: "cold-boot",
      park: 35,
      from: 0,
      to: 35,
      holdMs: 2600,
      caption: "cold boot · the whole CI runs once (every build, test, lint) · merge GREEN",
    },
    {
      name: "quiet",
      park: 48,
      from: 36,
      to: 48,
      holdMs: 2400,
      caption: "nothing changed · every check memo-skips · cost flat near zero",
    },
    {
      name: "self-tick",
      park: 56,
      from: 55,
      to: 56,
      holdMs: 2400,
      caption: "self-tick audit floor · merge-gate re-checks itself · no work, no cost",
    },
    {
      name: "hero-leaf",
      park: 66,
      from: 59,
      to: 66,
      holdMs: 3800,
      caption: "HERO: a 4-line pkg-ui diff wakes only the ui lane · 5 packages stay dark",
    },
    {
      name: "hub-fanout",
      park: 80,
      from: 70,
      to: 80,
      holdMs: 3600,
      caption: "a pkg-core diff fans out · ui/api/auth rebuild · utils+billing stay dark",
    },
    {
      name: "red-fail",
      park: 100,
      from: 93,
      to: 100,
      holdMs: 3000,
      caption: "a pkg-api test throws RED · merge-gate BLOCKED · no merge this tick",
    },
    {
      name: "green-recover",
      park: 110,
      from: 103,
      to: 110,
      holdMs: 2800,
      caption: "the fix lands · pkg-api test GREEN · merge-gate fans in to GREEN",
    },
    {
      name: "final-quiet",
      park: 129,
      from: 111,
      to: 129,
      holdMs: 2600,
      caption: "CI goes quiet again · nothing to re-run · cost back to flat",
    },
  ],
} as const;
