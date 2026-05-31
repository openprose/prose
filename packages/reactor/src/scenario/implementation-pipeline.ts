// The Implementation Pipeline mini-fixture — deterministic node bodies for IT-3
// (tests/implementation-pipeline.md; INTEGRATION-TESTS-PLAN.md §3 IT-3).
//
// This is the heaviest exercise of the real-filesystem + sub-agent affordances,
// scaled to ~10 nodes. Like the Counter / Masked-Relay fixtures, every render body
// is a PURE deterministic function of (upstream truth read BY REFERENCE, own prior)
// — zero model calls — so the OFFLINE suite gates the commit and replay is free. The
// live sibling (`implementation-pipeline.live.test.ts`) swaps these fakes for the
// live `createAgentRender` adapter (real fs_write/shell_exec + Option-B working-dir
// harvest + spawn_subagent); the reconciler cannot tell them apart.
//
//   Planning Docs (gateway) ┐
//   Target Repo  (gateway) ─┴─► Corpus ─► Work Plan (per-lane facets a/b/c)
//                                              │
//                                              ▼
//                                       Foundation Builder
//                          ┌──────────────────┼──────────────────┐
//                          │ (⊂ facet_a +     │ (⊂ facet_b +     │ (⊂ facet_c +
//                          │   foundation)    │   foundation)    │   foundation)
//                          ▼                  ▼                  ▼
//                       Lane A             Lane B             Lane C
//   (each: real repo analysis → WRITES a patch file → runs a shell test cmd)
//   (Lane C uses spawn_subagent to delegate a sub-analysis, folds it into truth)
//                          └──────────────────┼──────────────────┘
//                                             ▼
//                                    Construction Review      (diamond fan-in #1)
//                                             ▼
//                                    Integration Builder (runs typecheck/test)
//                                             ▼
//                                    Verification Runner      (diamond fan-in #2)
//                                             ▼
//                                    Implementation Report
//
// IT-3's distinctive mechanics (asserted in the test files):
//   - facet lane isolation: each lane subscribes ONLY to its OWN work-plan facet +
//     the foundation, so a lane wakes iff its facet or the foundation moves; an
//     unchanged lane emits a cheap SKIP receipt.
//   - foundation fanout: a foundation change wakes all three lanes in one wave.
//   - diamond fan-in: Construction Review (over the 3 lanes) and Verification Runner
//     reconverge to a SINGLE render for their fan-in tuple.
//   - restart-skip: re-running with unchanged inputs boots to all-skips.

import { ATOMIC_FACET, type Facet } from "../shapes";
import {
  fingerprintArtifact,
  files,
  jsonFile,
  readTextFile,
  InMemoryWorldModelStore,
  type Canonicalizer,
  type WorldModelFiles,
  type WorldModelStore,
} from "../world-model";
import { zeroCost, type RenderContext } from "../sdk/render-atom";
import { type MountedRender } from "../sdk/mounted-dag";
import {
  buildScenario,
  injectExternalReceipt,
  materialFingerprint,
  readJson,
  type NodeDecl,
  type ReconcileResult,
  type Scenario,
} from "./fixture";

// ---------------------------------------------------------------------------
// Identities + facets
// ---------------------------------------------------------------------------

export const PLANNING_SOURCE = "ingress.planning-docs"; // the system's edge (phantom)
export const REPO_SOURCE = "ingress.target-repo"; // the system's edge (phantom)

export const PLANNING_GATEWAY = "gateway.planning-docs";
export const REPO_GATEWAY = "gateway.target-repo";
export const CORPUS = "responsibility.corpus";
export const WORK_PLAN = "responsibility.work-plan";
export const FOUNDATION = "responsibility.foundation-builder";

export const LANE_A = "responsibility.lane-a"; // sdk_world_model
export const LANE_B = "responsibility.lane-b"; // sdk_runtime
export const LANE_C = "responsibility.lane-c"; // skill_contract (uses spawn_subagent)
export const LANES = [LANE_A, LANE_B, LANE_C] as const;

export const CONSTRUCTION_REVIEW = "responsibility.construction-review";
export const INTEGRATION_BUILDER = "responsibility.integration-builder";
export const VERIFICATION_RUNNER = "responsibility.verification-runner";
export const IMPLEMENTATION_REPORT = "responsibility.implementation-report";

/** The work-plan's per-lane facets — one per fixed construction lane. */
export const FACET_A: Facet = "facet_a";
export const FACET_B: Facet = "facet_b";
export const FACET_C: Facet = "facet_c";
export const FACET_BY_LANE: Record<string, Facet> = {
  [LANE_A]: FACET_A,
  [LANE_B]: FACET_B,
  [LANE_C]: FACET_C,
};

/** The foundation's shared-shape facet — every lane subscribes to it. */
export const FOUNDATION_FACET: Facet = "foundation";

export const PLAN_INGRESS: Facet = "plan_docs";
export const REPO_INGRESS: Facet = "repo_snapshot";

// ---------------------------------------------------------------------------
// The external payloads + harness deps the fake renders close over
// ---------------------------------------------------------------------------

/** A planning outline: per-lane work items + a shared shape the foundation owns. */
export interface PlanningDocs {
  /** Work items, each tagged with the lane that owns it. */
  readonly items: readonly { id: string; lane: string; goal: string }[];
  /** The shared shape the Foundation establishes (moving it fans out to all lanes). */
  readonly shared_shape: string;
}

/** A tiny synthetic target repo snapshot (file index + test command). */
export interface RepoSnapshot {
  readonly files: readonly string[];
  readonly test_command: string;
}

export interface PipelineDeps {
  readonly store: WorldModelStore;
  /** The current planning outline (mutable so a test can move one lane's facet). */
  planning: PlanningDocs;
  /** The current repo snapshot (mutable). */
  repo: RepoSnapshot;
  /** Per-node render invocation counts — proves a memo-skip never calls a render. */
  readonly renders: Record<string, number>;
}

function freshDeps(store: WorldModelStore): PipelineDeps {
  return {
    store,
    planning: {
      items: [
        { id: "w1", lane: LANE_A, goal: "world-model store shape" },
        { id: "w2", lane: LANE_B, goal: "reconciler runtime" },
        { id: "w3", lane: LANE_C, goal: "skill contract docs" },
      ],
      shared_shape: "Receipt{node,fingerprints}",
    },
    repo: {
      files: ["src/store.ts", "src/runtime.ts", "src/contract.ts", "test/store.test.ts"],
      test_command: "node -e \"process.exit(0)\"",
    },
    renders: {},
  };
}

function tick(deps: PipelineDeps, node: string): void {
  deps.renders[node] = (deps.renders[node] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Canonicalizers
// ---------------------------------------------------------------------------

const atomicTruth: Canonicalizer = (fm) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

function readTruth(fm: WorldModelFiles): Record<string, unknown> {
  const bytes = fm["truth.json"];
  return bytes === undefined
    ? {}
    : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
}

/** Planning ingress: the raw outline is the single `plan_docs` facet. */
const planIngressCanon: Canonicalizer = (fm) => {
  const bytes = fm["planning.json"];
  const docs = bytes === undefined ? {} : JSON.parse(readTextFile(bytes));
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [PLAN_INGRESS]: materialFingerprint(docs),
  };
};

/** Repo ingress: the raw snapshot is the single `repo_snapshot` facet. */
const repoIngressCanon: Canonicalizer = (fm) => {
  const bytes = fm["repo.json"];
  const snap = bytes === undefined ? {} : JSON.parse(readTextFile(bytes));
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [REPO_INGRESS]: materialFingerprint(snap),
  };
};

/** Gateway canonicalizers carry the ingress facet they republish. */
const planGatewayCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [PLAN_INGRESS]: materialFingerprint(t["docs"] ?? {}),
  };
};
const repoGatewayCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [REPO_INGRESS]: materialFingerprint(t["snapshot"] ?? {}),
  };
};

/**
 * Work Plan: ONE facet per lane (lane isolation). Each lane facet token is over
 * ONLY that lane's assigned work items + goals — so Lane A's `facet_a` moves iff
 * the work assigned to Lane A moves, independent of Lane B / Lane C. This is what
 * makes "wake only when YOUR lane facet changes" a fingerprint fact.
 */
export const workPlanCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  const byLane = (t["lane_assignments"] ?? {}) as Record<string, unknown>;
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [FACET_A]: materialFingerprint(byLane[LANE_A] ?? []),
    [FACET_B]: materialFingerprint(byLane[LANE_B] ?? []),
    [FACET_C]: materialFingerprint(byLane[LANE_C] ?? []),
  };
};

/**
 * Foundation: the shared-shape facet every lane subscribes to. Moving the shared
 * shape moves `foundation`, which fans out to all three lanes in one wave.
 */
export const foundationCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [FOUNDATION_FACET]: materialFingerprint(t["shared_shapes"] ?? {}),
  };
};

// ---------------------------------------------------------------------------
// The render bodies (factories closing over deps)
// ---------------------------------------------------------------------------

function commit(truth: unknown, ctx: RenderContext) {
  return {
    world_model: files({ "truth.json": jsonFile(truth) }),
    cost: zeroCost(ctx.wake.source),
  };
}

function planGatewayRender(deps: PipelineDeps): MountedRender {
  return (ctx) => {
    tick(deps, PLANNING_GATEWAY);
    const docs = readJson(deps.store, PLANNING_SOURCE, "planning.json") ?? {};
    return commit({ docs }, ctx);
  };
}

function repoGatewayRender(deps: PipelineDeps): MountedRender {
  return (ctx) => {
    tick(deps, REPO_GATEWAY);
    const snapshot = readJson(deps.store, REPO_SOURCE, "repo.json") ?? {};
    return commit({ snapshot }, ctx);
  };
}

function corpusRender(deps: PipelineDeps): MountedRender {
  return (ctx) => {
    tick(deps, CORPUS);
    const plan = readJson(deps.store, PLANNING_GATEWAY);
    const repo = readJson(deps.store, REPO_GATEWAY);
    const docs = (plan?.["docs"] ?? {}) as PlanningDocs;
    const snap = (repo?.["snapshot"] ?? {}) as RepoSnapshot;
    return commit(
      {
        docs,
        repo_snapshot: snap,
        constraints: { forbidden_operations: ["rm -rf /"], commit_policy: "no push" },
        source_fingerprints: {
          plan: materialFingerprint(docs),
          repo: materialFingerprint(snap),
        },
      },
      ctx,
    );
  };
}

/**
 * Work Plan: normalize the corpus's work items into stable, per-lane assignments.
 * Each lane gets ONLY its own items; the facet canonicalizer above projects each
 * lane's assignment into an independent facet token (lane isolation).
 */
function workPlanRender(deps: PipelineDeps): MountedRender {
  return (ctx) => {
    tick(deps, WORK_PLAN);
    const corpus = readJson(deps.store, CORPUS);
    const docs = (corpus?.["docs"] ?? {}) as PlanningDocs;
    const items = docs.items ?? [];
    const lane_assignments: Record<string, { id: string; goal: string }[]> = {
      [LANE_A]: [],
      [LANE_B]: [],
      [LANE_C]: [],
    };
    const unassigned_work: { id: string; lane: string }[] = [];
    for (const it of items) {
      if (lane_assignments[it.lane] !== undefined) {
        lane_assignments[it.lane]!.push({ id: it.id, goal: it.goal });
      } else {
        // A seventh lane cannot be created — extra work is recorded, not mounted.
        unassigned_work.push({ id: it.id, lane: it.lane });
      }
    }
    return commit(
      {
        work_items: items,
        lane_assignments,
        owned_paths_by_lane: {
          [LANE_A]: ["src/store.ts"],
          [LANE_B]: ["src/runtime.ts"],
          [LANE_C]: ["src/contract.ts"],
        },
        unassigned_work,
      },
      ctx,
    );
  };
}

/** Foundation Builder: establish the shared shape + invariants from the corpus. */
function foundationRender(deps: PipelineDeps): MountedRender {
  return (ctx) => {
    tick(deps, FOUNDATION);
    const corpus = readJson(deps.store, CORPUS);
    const docs = (corpus?.["docs"] ?? {}) as PlanningDocs;
    return commit(
      {
        shared_shapes: { receipt: docs.shared_shape ?? "Receipt{}" },
        invariants: ["receipts are append-only"],
        vocabulary: ["facet", "memo key"],
        notes_for_lanes: "conform to the shared receipt shape",
      },
      ctx,
    );
  };
}

/**
 * A Construction Lane. Reads ONLY its own work-plan facet + the foundation (lane
 * isolation: its `requires` lists exactly { WorkPlan.facet_x, Foundation } — never
 * a sibling lane). It does "real repo analysis" (deterministic here: derives a
 * patch over its OWNED paths), simulates WRITING a patch file (the offline analog
 * of the live fs_write into the working dir), and records a deterministic
 * test-command result (the offline analog of the live shell_exec).
 */
function laneRender(deps: PipelineDeps, node: string): MountedRender {
  return (ctx) => {
    tick(deps, node);
    const plan = readJson(deps.store, WORK_PLAN);
    const foundation = readJson(deps.store, FOUNDATION);
    const assignments = (plan?.["lane_assignments"] ?? {}) as Record<
      string,
      { id: string; goal: string }[]
    >;
    const ownedPaths =
      ((plan?.["owned_paths_by_lane"] ?? {}) as Record<string, string[]>)[node] ??
      [];
    const myItems = assignments[node] ?? [];
    // The "patch file" the lane proposes over its OWNED paths (a single touched
    // file with a deterministic body derived from its assigned items).
    const patchPath = ownedPaths[0] ?? `src/${node}.ts`;
    const patch_set = [
      {
        path: patchPath,
        body: `// ${node}: ${myItems.map((i) => i.goal).join("; ")}`,
      },
    ];
    return commit(
      {
        status: myItems.length > 0 ? "proposed" : "noop",
        owned_paths: ownedPaths,
        patch_set,
        tests_added: myItems.map((i) => `test/${i.id}.test.ts`),
        shared_shape_conformed: (
          (foundation?.["shared_shapes"] ?? {}) as Record<string, unknown>
        )["receipt"],
        // The deterministic test-command result (offline analog of shell_exec).
        verification_notes: { command: deps.repo.test_command, exit_code: 0 },
        open_issues: [],
      },
      ctx,
    );
  };
}

/** Construction Review: cross-lane consistency over all three lanes + foundation. */
function constructionReviewRender(deps: PipelineDeps): MountedRender {
  return (ctx) => {
    tick(deps, CONSTRUCTION_REVIEW);
    const accepted: string[] = [];
    const rejected: { lane: string; reason: string }[] = [];
    const ownedByLane: Record<string, string[]> = {};
    for (const lane of LANES) {
      const ls = readJson(deps.store, lane);
      const owned = (ls?.["owned_paths"] ?? []) as string[];
      ownedByLane[lane] = owned;
      const patch = (ls?.["patch_set"] ?? []) as { path: string }[];
      // Path-ownership gate: a lane that touches a path it does not own is rejected.
      const violates = patch.some((p) => !owned.includes(p.path));
      if (violates) {
        rejected.push({ lane, reason: "path ownership violation" });
      } else {
        accepted.push(lane);
      }
    }
    return commit(
      {
        accepted_lanes: accepted,
        rejected_lanes: rejected,
        cross_lane_conflicts: [],
        ready_for_integration: rejected.length === 0,
      },
      ctx,
    );
  };
}

/** Integration Builder: merge accepted lane patches + run typecheck/test commands. */
function integrationRender(deps: PipelineDeps): MountedRender {
  return (ctx) => {
    tick(deps, INTEGRATION_BUILDER);
    const review = readJson(deps.store, CONSTRUCTION_REVIEW);
    const accepted = (review?.["accepted_lanes"] ?? []) as string[];
    // Merge the accepted lanes' patches INCLUDING their bodies, so a changed lane
    // patch moves the integrated truth and propagates to Verification (carrying only
    // {lane, path} would erase a lane's body change — the integration node would
    // not move, and the verification fan-in would never wake on a lane edit).
    const integrated_patch_set: { lane: string; path: string; body: string }[] = [];
    for (const lane of accepted) {
      const ls = readJson(deps.store, lane);
      for (const p of (ls?.["patch_set"] ?? []) as { path: string; body: string }[]) {
        integrated_patch_set.push({ lane, path: p.path, body: p.body });
      }
    }
    return commit(
      {
        integrated_patch_set,
        // Deterministic command results (offline analog of live shell_exec).
        typecheck_result: { command: "tsc --noEmit", exit_code: 0 },
        unit_test_result: { command: deps.repo.test_command, exit_code: 0 },
        remaining_failures: [],
      },
      ctx,
    );
  };
}

/** Verification Runner: full-suite + deterministic-replay checks over integration. */
function verificationRender(deps: PipelineDeps): MountedRender {
  return (ctx) => {
    tick(deps, VERIFICATION_RUNNER);
    const integration = readJson(deps.store, INTEGRATION_BUILDER);
    const patches = (integration?.["integrated_patch_set"] ?? []) as unknown[];
    return commit(
      {
        full_suite_results: { passed: patches.length, failed: 0 },
        deterministic_replay_result: "stable",
        first_failure: null,
        promised_tests_present: true,
      },
      ctx,
    );
  };
}

/** Implementation Report: the terminal projection over plan + review + verify. */
function reportRender(deps: PipelineDeps): MountedRender {
  return (ctx) => {
    tick(deps, IMPLEMENTATION_REPORT);
    const review = readJson(deps.store, CONSTRUCTION_REVIEW);
    const verify = readJson(deps.store, VERIFICATION_RUNNER);
    const integration = readJson(deps.store, INTEGRATION_BUILDER);
    return commit(
      {
        summary: "implementation pipeline run",
        status:
          (verify?.["first_failure"] ?? null) === null ? "passed" : "failed",
        files_changed_by_layer: integration?.["integrated_patch_set"] ?? [],
        rejected_lanes: review?.["rejected_lanes"] ?? [],
        open_risks: [],
      },
      ctx,
    );
  };
}

// ---------------------------------------------------------------------------
// The fixture + driver
// ---------------------------------------------------------------------------

export interface PipelineScenario extends Scenario {
  readonly deps: PipelineDeps;
}

/** Build the Implementation Pipeline mini-fixture mounted over the real reconciler. */
export function pipelineScenario(): PipelineScenario {
  const realStore = new InMemoryWorldModelStore();
  const deps = freshDeps(realStore);

  const laneDecl = (id: string): NodeDecl => ({
    id,
    kind: "responsibility",
    name: `Construction Lane ${id}`,
    // Lane isolation: a lane subscribes to ONLY its OWN work-plan facet + the
    // foundation — never a sibling lane, never another lane's facet. So "wakes iff
    // its facet or the foundation moved" is an honest fingerprint fact.
    requires: [
      { producer: WORK_PLAN, facet: FACET_BY_LANE[id]! },
      { producer: FOUNDATION, facet: FOUNDATION_FACET },
    ],
    maintains: ["lane_state"],
    continuity: "input-driven",
    render: laneRender(deps, id),
    canonicalizer: atomicTruth,
  });

  const decls: NodeDecl[] = [
    {
      id: PLANNING_GATEWAY,
      kind: "gateway",
      name: "Planning Docs",
      requires: [{ producer: PLANNING_SOURCE, facet: PLAN_INGRESS }],
      maintains: ["plan_docs"],
      continuity: "external",
      render: planGatewayRender(deps),
      canonicalizer: planGatewayCanon,
    },
    {
      id: REPO_GATEWAY,
      kind: "gateway",
      name: "Target Repo",
      requires: [{ producer: REPO_SOURCE, facet: REPO_INGRESS }],
      maintains: ["repo_snapshot"],
      continuity: "external",
      render: repoGatewayRender(deps),
      canonicalizer: repoGatewayCanon,
    },
    {
      id: CORPUS,
      kind: "responsibility",
      name: "Implementation Corpus",
      requires: [
        { producer: PLANNING_GATEWAY, facet: PLAN_INGRESS },
        { producer: REPO_GATEWAY, facet: REPO_INGRESS },
      ],
      maintains: ["corpus"],
      continuity: "input-driven",
      render: corpusRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: WORK_PLAN,
      kind: "responsibility",
      name: "Implementation Work Plan",
      requires: [{ producer: CORPUS }],
      maintains: ["facet_a", "facet_b", "facet_c"],
      continuity: "input-driven",
      render: workPlanRender(deps),
      canonicalizer: workPlanCanon,
    },
    {
      id: FOUNDATION,
      kind: "responsibility",
      name: "Foundation Builder",
      requires: [{ producer: CORPUS }],
      maintains: ["foundation"],
      continuity: "input-driven",
      render: foundationRender(deps),
      canonicalizer: foundationCanon,
    },
    laneDecl(LANE_A),
    laneDecl(LANE_B),
    laneDecl(LANE_C),
    {
      id: CONSTRUCTION_REVIEW,
      kind: "responsibility",
      name: "Construction Review",
      requires: [...LANES.map((l) => ({ producer: l })), { producer: FOUNDATION }],
      maintains: ["construction_review"],
      continuity: "input-driven",
      render: constructionReviewRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: INTEGRATION_BUILDER,
      kind: "responsibility",
      name: "Integration Builder",
      requires: [
        { producer: CONSTRUCTION_REVIEW },
        ...LANES.map((l) => ({ producer: l })),
      ],
      maintains: ["integration_state"],
      continuity: "input-driven",
      render: integrationRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: VERIFICATION_RUNNER,
      kind: "responsibility",
      name: "Verification Runner",
      requires: [{ producer: INTEGRATION_BUILDER }],
      maintains: ["verification_state"],
      continuity: "input-driven",
      render: verificationRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: IMPLEMENTATION_REPORT,
      kind: "responsibility",
      name: "Implementation Report",
      requires: [
        { producer: CONSTRUCTION_REVIEW },
        { producer: INTEGRATION_BUILDER },
        { producer: VERIFICATION_RUNNER },
      ],
      maintains: ["implementation_report"],
      continuity: "input-driven",
      render: reportRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const scn = buildScenario(decls, { store: realStore });
  return { ...scn, deps };
}

// ---------------------------------------------------------------------------
// Drivers — stage the two ingress sources, then wake the gateways
// ---------------------------------------------------------------------------

/**
 * Stage the current planning + repo payloads onto the phantom ingress producers
 * and wake both gateways in ONE drain, draining the whole pipeline to quiescence.
 * Mirrors the Counter fixture's `deliverEvent`, but with TWO gateways (the planning
 * + repo sources both fan into the Corpus). Seeding BOTH gateways in a SINGLE
 * `drain` (rather than two sequential `ingest` calls) lets the reconciler coalesce
 * the Corpus's two-gateway fan-in into one wave — so Corpus/Work-Plan/Foundation
 * each render ONCE per cold cascade, not once-per-gateway.
 */
export function runPipeline(scn: PipelineScenario): readonly ReconcileResult[] {
  injectExternalReceipt(
    scn,
    PLANNING_SOURCE,
    files({ "planning.json": jsonFile(scn.deps.planning) }),
    planIngressCanon,
  );
  injectExternalReceipt(
    scn,
    REPO_SOURCE,
    files({ "repo.json": jsonFile(scn.deps.repo) }),
    repoIngressCanon,
  );
  return scn.dag.drain([
    { node: PLANNING_GATEWAY, wake: { source: "external", refs: [] } },
    { node: REPO_GATEWAY, wake: { source: "external", refs: [] } },
  ]);
}

/**
 * Re-wake both gateways with the EXACT current payloads (no change): the ingress
 * facets are byte-identical, so both gateways memo-SKIP and the whole pipeline
 * boots to all-skips. This is the honest no-change re-run / restart-skip.
 */
export function reRunUnchanged(
  scn: PipelineScenario,
): readonly ReconcileResult[] {
  return runPipeline(scn);
}

/**
 * Move ONLY one lane's work-plan facet: append a NEW work item assigned to that
 * lane, leaving the other lanes' items + the shared shape unchanged. Only the
 * target lane's facet should move (lane isolation), so only that lane re-renders.
 */
export function moveLaneFacet(scn: PipelineScenario, lane: string): readonly ReconcileResult[] {
  const next = scn.deps.planning.items.length + 1;
  scn.deps.planning = {
    ...scn.deps.planning,
    items: [
      ...scn.deps.planning.items,
      { id: `w${next}`, lane, goal: `extra work for ${lane}` },
    ],
  };
  return runPipeline(scn);
}

/**
 * Move the shared shape the Foundation owns: this moves the `foundation` facet,
 * which fans out to ALL three lanes in one wave (foundation fanout).
 */
export function moveSharedShape(scn: PipelineScenario): readonly ReconcileResult[] {
  scn.deps.planning = {
    ...scn.deps.planning,
    shared_shape: `${scn.deps.planning.shared_shape}+migrated`,
  };
  return runPipeline(scn);
}

export { readJson };
