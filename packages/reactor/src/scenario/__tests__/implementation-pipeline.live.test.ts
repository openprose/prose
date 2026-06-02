// IT-3 — Implementation Pipeline, scaled, LIVE (the fs/shell + subagent stress test).
// Source: tests/implementation-pipeline.md; INTEGRATION-TESTS-PLAN.md §3 IT-3.
//
// The offline sibling (`implementation-pipeline.test.ts`) asserts the run-loop
// MECHANICS (facet lane isolation, foundation fanout, diamond fan-in, restart-skip)
// over the ~12-node pipeline with DETERMINISTIC FAKE renders — zero model calls, the
// green bar that gates the commit. THIS file is the key-gated LIVE smoke: it boots a
// scaled-down (cost-bounded) version of the SAME shape, swaps every fake render for
// the live `createAgentRender` adapter (real google/gemini-3.5-flash @ temp 0), and
// kicks the tires on the HEAVIEST Phase-1.5 affordances end to end:
//
//   Planning Docs + Target Repo (gateways) → Corpus → Work Plan (facets a/b/c)
//     → Foundation → 3 Construction Lanes → Construction Review
//     → Integration Builder (runs shell typecheck/test) → Verification → Report
//
// The live headline (INTEGRATION-TESTS-PLAN.md §3 IT-3):
//   (a) a lane render WRITES a real patch file through `fs_write` AND runs
//       `shell_exec` in its per-node working dir; the harness HARVESTS the directory
//       → commits → fingerprints (Option-B), so the harvested patch file appears in
//       the lane's PUBLISHED truth (not just `truth.json`);
//   (b) the `spawn_subagent` lane (Lane C) commits with the child session's tokens
//       ROLLED UP into its receipt Cost (non-zero fresh spend; the numeric
//       parent+child proof lives in run-project.test.ts IT-0);
//   (c) the Integration node renders EXACTLY ONCE for its fan-in tuple;
//   (d) a RESTART (re-stage the identical ingress) SKIPS every node — the memo key
//       is unmoved — with ZERO model calls.
//
// Cost discipline (§2): scaled to the minimum that exercises the shape — 3 tiny
// lanes, a 4-file synthetic repo, a trivial `node -e`/`grep` "test cmd" (NOT a real
// build), temp 0, bounded maxTurns. The fixture inputs are tiny.
//
// Wiring (the GROUND BRIEF's preferred path): reuse the scenario topology +
// hand-authored DETERMINISTIC canonicalizers (the per-lane + foundation facet tokens
// are load-bearing for propagation — Work Plan mounts the facet-carrying canon, NOT
// the atomic one), and inject the LIVE render at the mount site via `asyncMounts` +
// `dag.drain`. No parallel harness; the `AsyncMountedRender` seam is the composition
// point and the reconciler cannot tell a live render from a fake one.
//
// Gated `{ skip: hasOpenRouterKey() ? false : "…" }` exactly like every other live
// test, so a keyless run reports a passing (skipped-body) subtest and never touches
// the network — the offline gate stays green and is unaffected by this file.

import { equal, ok } from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
  createNullSignature,
  type Facet, type Fingerprint, asFacet, asFingerprint, asNodeId} from "../../shapes";
import {
  fingerprintArtifact,
  files,
  jsonFile,
  readTextFile,
  FileSystemWorldModelStore,
  type Canonicalizer,
  type WorldModelFiles,
  type WorldModelStore,
} from "../../world-model";
import { mountDag, type AsyncMountedRender } from "../../sdk/mounted-dag";
import { zeroCost, type RenderContext } from "../../sdk/render-atom";
import {
  createAgentRender,
  hasOpenRouterKey,
  createOpenRouterProvider,
} from "../../adapters/agent-render";
import type { CompiledContractView } from "../../adapters/agent-render/instructions";
import { materialFingerprint } from "../fixture";
import {
  countDisposition,
  dispositionOf,
  lastReceipt,
  receiptsFor,
  woke,
} from "../trace";
import type { ReconcilerTopology } from "../../reactor";

// ---------------------------------------------------------------------------
// Identities + facets (a self-contained live graph mirroring the offline fixture)
// ---------------------------------------------------------------------------

const PLANNING_SOURCE = "ingress.planning-docs";
const REPO_SOURCE = "ingress.target-repo";
const PLANNING_GATEWAY = "gateway.planning-docs";
const REPO_GATEWAY = "gateway.target-repo";
const CORPUS = "responsibility.corpus";
const WORK_PLAN = "responsibility.work-plan";
const FOUNDATION = "responsibility.foundation-builder";
const LANE_A = "responsibility.lane-a";
const LANE_B = "responsibility.lane-b";
const LANE_C = "responsibility.lane-c"; // uses spawn_subagent
const LANES = [LANE_A, LANE_B, LANE_C] as const;
const CONSTRUCTION_REVIEW = "responsibility.construction-review";
const INTEGRATION_BUILDER = "responsibility.integration-builder";
const VERIFICATION_RUNNER = "responsibility.verification-runner";
const IMPLEMENTATION_REPORT = "responsibility.implementation-report";

const PLAN_INGRESS = asFacet("plan_docs");
const REPO_INGRESS = asFacet("repo_snapshot");
const FACET_A = asFacet("facet_a");
const FACET_B = asFacet("facet_b");
const FACET_C = asFacet("facet_c");
const FACET_BY_LANE: Record<string, Facet> = {
  [LANE_A]: FACET_A,
  [LANE_B]: FACET_B,
  [LANE_C]: FACET_C,
};
const FOUNDATION_FACET = asFacet("foundation");

const TRUTH = "truth.json";
const PLAN_FILE = "planning.json";
const REPO_FILE = "repo.json";
/** The real patch file a lane writes via fs_write + harvests (Option-B). */
const PATCH_FILE = "patch.diff";

// ---------------------------------------------------------------------------
// The tiny synthetic fixture payloads (no external network)
// ---------------------------------------------------------------------------

const PLANNING_DOCS = {
  items: [
    { id: "w1", lane: LANE_A, goal: "world-model store shape" },
    { id: "w2", lane: LANE_B, goal: "reconciler runtime" },
    { id: "w3", lane: LANE_C, goal: "skill contract docs" },
  ],
  shared_shape: "Receipt{node,fingerprints}",
};

const REPO_SNAPSHOT = {
  files: ["src/store.ts", "src/runtime.ts", "src/contract.ts", "test/store.test.ts"],
  // The "test cmd" is a trivial deterministic shell command over the fixture — a
  // node -e exit-0, NOT a real build (§ IT-3 fixture note).
  test_command: 'node -e "process.exit(0)"',
};

const OWNED_PATH_BY_LANE: Record<string, string> = {
  [LANE_A]: "src/store.ts",
  [LANE_B]: "src/runtime.ts",
  [LANE_C]: "src/contract.ts",
};

// ---------------------------------------------------------------------------
// Deterministic facet-carrying canonicalizers (load-bearing propagation tokens —
// same facet semantics as the offline fixture; only the RENDER is live).
// ---------------------------------------------------------------------------

function readTruth(fm: WorldModelFiles): Record<string, unknown> {
  const bytes = fm[TRUTH];
  return bytes === undefined
    ? {}
    : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
}

const atomicTruth: Canonicalizer = (fm) => ({
  [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
});

const planIngressCanon: Canonicalizer = (fm) => {
  const bytes = fm[PLAN_FILE];
  const docs = bytes === undefined ? {} : JSON.parse(readTextFile(bytes));
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [PLAN_INGRESS]: asFingerprint(materialFingerprint(docs)),
  };
};
const repoIngressCanon: Canonicalizer = (fm) => {
  const bytes = fm[REPO_FILE];
  const snap = bytes === undefined ? {} : JSON.parse(readTextFile(bytes));
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [REPO_INGRESS]: asFingerprint(materialFingerprint(snap)),
  };
};
const planGatewayCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [PLAN_INGRESS]: asFingerprint(materialFingerprint(t["docs"] ?? {})),
  };
};
const repoGatewayCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [REPO_INGRESS]: asFingerprint(materialFingerprint(t["snapshot"] ?? {})),
  };
};

/** Work Plan: one facet per lane (lane isolation). */
const workPlanCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  const byLane = (t["lane_assignments"] ?? {}) as Record<string, unknown>;
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [FACET_A]: asFingerprint(materialFingerprint(byLane[LANE_A] ?? [])),
    [FACET_B]: asFingerprint(materialFingerprint(byLane[LANE_B] ?? [])),
    [FACET_C]: asFingerprint(materialFingerprint(byLane[LANE_C] ?? [])),
  };
};

/** Foundation: the shared-shape facet every lane subscribes to. */
const foundationCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [FOUNDATION_FACET]: asFingerprint(materialFingerprint(t["shared_shapes"] ?? {})),
  };
};

// ---------------------------------------------------------------------------
// The live contract views: each node's `### Maintains` + the EXACT file shape so
// the deterministic canonicalizers above find their tokens. The model reads its
// upstream truth BY REFERENCE via wm_list_upstream / wm_read_upstream, and the
// lanes do REAL fs_write + shell_exec in their per-node working dir (Option-B).
// ---------------------------------------------------------------------------

function liveContractFor(node: string): CompiledContractView {
  if (node === PLANNING_GATEWAY) {
    return {
      name: "Planning Docs",
      maintains: ["`plan_docs`: the ingested planning outline."],
      requires: ["the raw planning outline"],
      continuity: "External.",
      execution:
        `Read your upstream BY REFERENCE: \`wm_list_upstream\` then ` +
        `\`wm_read_upstream\` (path \`${PLAN_FILE}\`) — a JSON outline with ` +
        `\`items\` (each {id, lane, goal}) and \`shared_shape\`. Then write ` +
        `\`${TRUTH}\` to your workspace, valid JSON: {"docs": <the outline you ` +
        `read, verbatim>}. Then report status "done".`,
    };
  }
  if (node === REPO_GATEWAY) {
    return {
      name: "Target Repo",
      maintains: ["`repo_snapshot`: the ingested repo snapshot."],
      requires: ["the raw repo snapshot"],
      continuity: "External.",
      execution:
        `Read your upstream BY REFERENCE: \`wm_list_upstream\` then ` +
        `\`wm_read_upstream\` (path \`${REPO_FILE}\`) — a JSON snapshot with ` +
        `\`files\` and \`test_command\`. Then write \`${TRUTH}\` to your ` +
        `workspace, valid JSON: {"snapshot": <the snapshot you read, verbatim>}. ` +
        `Then report status "done".`,
    };
  }
  if (node === CORPUS) {
    return {
      name: "Implementation Corpus",
      maintains: ["`corpus`: the merged planning + repo corpus."],
      requires: ["Planning Docs", "Target Repo"],
      continuity: "Input-driven.",
      execution:
        `You subscribe to TWO producers. \`wm_list_upstream\`, then ` +
        `\`wm_read_upstream\` (path \`${TRUTH}\`) for EACH. From the planning ` +
        `producer read \`docs\`; from the repo producer read \`snapshot\`. Then ` +
        `write \`${TRUTH}\`, valid JSON: {"docs": <the docs object>, ` +
        `"repo_snapshot": <the snapshot object>}. Then report status "done".`,
    };
  }
  if (node === WORK_PLAN) {
    return {
      name: "Implementation Work Plan",
      maintains: [
        "`facet_a`: Lane A's assigned work.",
        "`facet_b`: Lane B's assigned work.",
        "`facet_c`: Lane C's assigned work.",
      ],
      requires: ["the Implementation Corpus"],
      continuity: "Input-driven. Fixed lanes — never invent a new lane.",
      execution:
        `\`wm_list_upstream\` then \`wm_read_upstream\` (path \`${TRUTH}\`) on the ` +
        `Corpus. Read \`docs.items\` (each {id, lane, goal}). Assign each item to ` +
        `the lane named in its \`lane\` field. Then write \`${TRUTH}\`, valid JSON ` +
        `of EXACTLY this shape: {"lane_assignments": {"${LANE_A}": [ {"id": <id>, ` +
        `"goal": <goal>} for each item whose lane is "${LANE_A}"], "${LANE_B}": ` +
        `[...for "${LANE_B}"], "${LANE_C}": [...for "${LANE_C}"]}, ` +
        `"owned_paths_by_lane": {"${LANE_A}": ["${OWNED_PATH_BY_LANE[LANE_A]}"], ` +
        `"${LANE_B}": ["${OWNED_PATH_BY_LANE[LANE_B]}"], "${LANE_C}": ` +
        `["${OWNED_PATH_BY_LANE[LANE_C]}"]}}. Then report status "done".`,
    };
  }
  if (node === FOUNDATION) {
    return {
      name: "Foundation Builder",
      maintains: ["`foundation`: the shared shapes all lanes conform to."],
      requires: ["the Implementation Corpus"],
      continuity: "Input-driven.",
      execution:
        `\`wm_list_upstream\` then \`wm_read_upstream\` (path \`${TRUTH}\`) on the ` +
        `Corpus. Read \`docs.shared_shape\`. Then write \`${TRUTH}\`, valid JSON: ` +
        `{"shared_shapes": {"receipt": <the shared_shape string>}, "invariants": ` +
        `["receipts are append-only"], "notes_for_lanes": "conform to the shared ` +
        `shape"}. Then report status "done".`,
    };
  }
  if ((LANES as readonly string[]).includes(node)) {
    const ownedPath = OWNED_PATH_BY_LANE[node]!;
    const usesSpawn = node === LANE_C;
    const spawnClause = usesSpawn
      ? `Because this lane needs a focused sub-analysis, you MUST delegate it: call ` +
        `the \`spawn_subagent\` tool ONCE, asking the helper to return a ONE-LINE ` +
        `risk note (a short string) about your owned path. Use the helper's returned ` +
        `string as your \`risk_note\`. `
      : ``;
    return {
      name: `Construction Lane (${node})`,
      maintains: ["`lane_state`: the lane's patch set + verification notes."],
      requires: [`Work Plan (your OWN facet only)`, "Foundation Builder"],
      continuity: "Input-driven. Touch ONLY your owned path; never a sibling lane's.",
      execution:
        `You subscribe to your OWN Work-Plan lane facet + the Foundation. ` +
        `\`wm_list_upstream\`, then \`wm_read_upstream\` (path \`${TRUTH}\`) for the ` +
        `Work Plan (read \`lane_assignments["${node}"]\` and ` +
        `\`owned_paths_by_lane["${node}"]\`) and for the Foundation (read ` +
        `\`shared_shapes\`). Your owned path is \`${ownedPath}\`. ` +
        // The REAL filesystem work (Option-B): write a patch file with fs_write,
        // then run the test command with shell_exec, in your working dir.
        `Now do the executable work in your working directory: (1) call \`fs_write\` ` +
        `to write the file \`${PATCH_FILE}\` whose content is a one-line unified-diff ` +
        `comment describing your change to \`${ownedPath}\` (e.g. the text ` +
        `"+++ ${ownedPath}: <your goal>"). (2) Call \`shell_exec\` to run the single ` +
        `command \`node -e "process.exit(0)"\` and capture its exit code. ` +
        spawnClause +
        `Finally call \`fs_write\` to write \`${TRUTH}\`, valid JSON: {"status": ` +
        `"proposed", "owned_paths": ["${ownedPath}"], "patch_file": "${PATCH_FILE}", ` +
        `"test_exit_code": <the exit code from shell_exec, an integer>` +
        (usesSpawn ? `, "risk_note": <the helper's returned string>` : ``) +
        `}. (Do NOT delete the \`${PATCH_FILE}\` file — the harness harvests your ` +
        `whole working directory.) Then report status "done".`,
    };
  }
  if (node === CONSTRUCTION_REVIEW) {
    return {
      name: "Construction Review",
      maintains: ["`construction_review`: cross-lane accept/reject."],
      requires: ["all three Construction Lanes", "Foundation Builder"],
      continuity: "Input-driven.",
      execution:
        `You subscribe to the three lanes + the foundation. \`wm_list_upstream\`, ` +
        `then \`wm_read_upstream\` (path \`${TRUTH}\`) for EACH lane. A lane is ` +
        `accepted iff its \`status\` is "proposed" and its \`test_exit_code\` is 0. ` +
        `Then write \`${TRUTH}\`, valid JSON: {"accepted_lanes": [ <node id of each ` +
        `accepted lane> ], "rejected_lanes": [], "ready_for_integration": <true iff ` +
        `no rejects>}. Then report status "done".`,
    };
  }
  if (node === INTEGRATION_BUILDER) {
    return {
      name: "Integration Builder",
      maintains: ["`integration_state`: merged patches + command results."],
      requires: ["Construction Review", "all three Construction Lanes"],
      continuity: "Input-driven.",
      execution:
        `\`wm_list_upstream\`, then \`wm_read_upstream\` (path \`${TRUTH}\`) on the ` +
        `Construction Review (read \`accepted_lanes\`) and on EACH accepted lane ` +
        `(read its \`patch_file\`). Now run the integration command yourself: call ` +
        `\`shell_exec\` with the single command \`node -e "process.exit(0)"\` (the ` +
        `typecheck/test stand-in) and capture its exit code. Then write \`${TRUTH}\`, ` +
        `valid JSON: {"integrated_patch_set": [ {"lane": <accepted lane id>, ` +
        `"patch_file": <its patch_file>} ], "typecheck_exit_code": <the exit code>, ` +
        `"remaining_failures": []}. Then report status "done".`,
    };
  }
  if (node === VERIFICATION_RUNNER) {
    return {
      name: "Verification Runner",
      maintains: ["`verification_state`: full-suite + replay result."],
      requires: ["Integration Builder"],
      continuity: "Input-driven.",
      execution:
        `\`wm_list_upstream\` then \`wm_read_upstream\` (path \`${TRUTH}\`) on the ` +
        `Integration Builder. Read \`integrated_patch_set\` and ` +
        `\`typecheck_exit_code\`. Then write \`${TRUTH}\`, valid JSON: ` +
        `{"full_suite_passed": <true iff typecheck_exit_code is 0>, ` +
        `"deterministic_replay_result": "stable", "first_failure": null}. Then ` +
        `report status "done".`,
    };
  }
  if (node === IMPLEMENTATION_REPORT) {
    return {
      name: "Implementation Report",
      maintains: ["`implementation_report`: the terminal report projection."],
      requires: ["Construction Review", "Integration Builder", "Verification Runner"],
      continuity: "Input-driven.",
      execution:
        `\`wm_list_upstream\`, then \`wm_read_upstream\` (path \`${TRUTH}\`) for ` +
        `EACH of your three producers. Read Verification's \`first_failure\`. Then ` +
        `write \`${TRUTH}\`, valid JSON: {"summary": "implementation pipeline run", ` +
        `"status": <"passed" iff first_failure is null else "failed">, ` +
        `"open_risks": []}. Then report status "done".`,
    };
  }
  throw new Error(`no contract for ${node}`);
}

// ---------------------------------------------------------------------------
// Topology + canonicalizers per node (the deterministic seam; only render is live)
// ---------------------------------------------------------------------------

interface NodeSpec {
  readonly id: string;
  readonly wake: "external" | "input";
  readonly edges: readonly { producer: string; facet: Facet }[];
  readonly canonicalizer: Canonicalizer;
}

const NODE_SPECS: readonly NodeSpec[] = [
  {
    id: PLANNING_GATEWAY,
    wake: "external",
    edges: [{ producer: PLANNING_SOURCE, facet: PLAN_INGRESS }],
    canonicalizer: planGatewayCanon,
  },
  {
    id: REPO_GATEWAY,
    wake: "external",
    edges: [{ producer: REPO_SOURCE, facet: REPO_INGRESS }],
    canonicalizer: repoGatewayCanon,
  },
  {
    id: CORPUS,
    wake: "input",
    edges: [
      { producer: PLANNING_GATEWAY, facet: PLAN_INGRESS },
      { producer: REPO_GATEWAY, facet: REPO_INGRESS },
    ],
    canonicalizer: atomicTruth,
  },
  {
    id: WORK_PLAN,
    wake: "input",
    edges: [{ producer: CORPUS, facet: ATOMIC_FACET }],
    canonicalizer: workPlanCanon,
  },
  {
    id: FOUNDATION,
    wake: "input",
    edges: [{ producer: CORPUS, facet: ATOMIC_FACET }],
    canonicalizer: foundationCanon,
  },
  // Each lane subscribes to ONLY its own work-plan facet + the foundation facet.
  ...LANES.map((id) => ({
    id,
    wake: "input" as const,
    edges: [
      { producer: WORK_PLAN, facet: FACET_BY_LANE[id]! },
      { producer: FOUNDATION, facet: FOUNDATION_FACET },
    ],
    canonicalizer: atomicTruth,
  })),
  {
    id: CONSTRUCTION_REVIEW,
    wake: "input",
    edges: [
      ...LANES.map((l) => ({ producer: l, facet: ATOMIC_FACET })),
      { producer: FOUNDATION, facet: ATOMIC_FACET },
    ],
    canonicalizer: atomicTruth,
  },
  {
    id: INTEGRATION_BUILDER,
    wake: "input",
    edges: [
      { producer: CONSTRUCTION_REVIEW, facet: ATOMIC_FACET },
      ...LANES.map((l) => ({ producer: l, facet: ATOMIC_FACET })),
    ],
    canonicalizer: atomicTruth,
  },
  {
    id: VERIFICATION_RUNNER,
    wake: "input",
    edges: [{ producer: INTEGRATION_BUILDER, facet: ATOMIC_FACET }],
    canonicalizer: atomicTruth,
  },
  {
    id: IMPLEMENTATION_REPORT,
    wake: "input",
    edges: [
      { producer: CONSTRUCTION_REVIEW, facet: ATOMIC_FACET },
      { producer: INTEGRATION_BUILDER, facet: ATOMIC_FACET },
      { producer: VERIFICATION_RUNNER, facet: ATOMIC_FACET },
    ],
    canonicalizer: atomicTruth,
  },
];

function pipelineTopology(): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const s of NODE_SPECS) {
    contract_fingerprints[s.id] = asFingerprint(`contract:${s.id}@live`);
  }
  return {
    topology: {
      nodes: NODE_SPECS.map((s) => ({
        node: asNodeId(s.id),
        contract_fingerprint: contract_fingerprints[s.id] as Fingerprint,
        wake_source: s.wake,
      })),
      edges: NODE_SPECS.flatMap((s) =>
        s.edges.map((e) => ({
          subscriber: asNodeId(s.id),
          producer: asNodeId(e.producer),
          facet: e.facet,
        })),
      ),
      entry_points: [asNodeId(PLANNING_GATEWAY), asNodeId(REPO_GATEWAY)],
      acyclic: true,
    },
    contract_fingerprints,
  };
}

/** Stage an ingress payload onto a phantom SOURCE producer's published truth. */
function stageIngress(
  store: WorldModelStore,
  ledger: ReturnType<typeof mountDag>["ledger"],
  source: string,
  file: string,
  payload: unknown,
  canon: Canonicalizer,
): void {
  const commit = store.commitPublished(source, files({ [file]: jsonFile(payload) }), canon);
  const prev = ledger.lastReceipt(source);
  const prevRef = prev !== null ? ledger.addressOf(prev) : null;
  ledger.append({
    node: asNodeId(source),
    contract_fingerprint: asFingerprint(`contract:${source}@ingress`),
    wake: { source: "external", refs: [] },
    input_fingerprints: [],
    fingerprints: commit.fingerprints,
    semantic_diff: EMPTY_SEMANTIC_DIFF,
    prev: prevRef,
    status: "rendered",
    cost: zeroCost("external"),
    sig: createNullSignature(),
  });
}

// ---------------------------------------------------------------------------
// The live mounted pipeline graph: every node a real createAgentRender, wrapped to
// COUNT invocations (so the restart can assert ZERO model calls).
// ---------------------------------------------------------------------------

interface LiveGraph {
  readonly dag: ReturnType<typeof mountDag>;
  readonly store: WorldModelStore;
  readonly renderCounts: Record<string, number>;
}

function buildLiveGraph(wmDir: string, workspaceRoot: string): LiveGraph {
  const store = new FileSystemWorldModelStore({ directory: wmDir });
  const provider = createOpenRouterProvider();
  const renderCounts: Record<string, number> = {};

  const render = createAgentRender({
    store,
    contractFor: liveContractFor,
    provider,
    temperature: 0,
    seed: 7,
    maxTurns: 18,
    // A real, durable per-node working-dir base (Option-B): the lanes fs_write +
    // shell_exec here, and the harness harvests <root>/<node>/ on commit.
    workspaceRoot,
  });
  const counting: AsyncMountedRender = async (ctx: RenderContext) => {
    renderCounts[ctx.node] = (renderCounts[ctx.node] ?? 0) + 1;
    return render(ctx);
  };

  const asyncMounts = Object.fromEntries(
    NODE_SPECS.map((s) => [s.id, { render: counting, canonicalizer: s.canonicalizer }]),
  );

  const dag = mountDag({
    topology: pipelineTopology(),
    mounts: {},
    asyncMounts,
    store,
  });
  return { dag, store, renderCounts };
}

function publishedFiles(store: WorldModelStore, node: string): WorldModelFiles | null {
  const read = store.read(node, "published");
  if (read.ref.version === null) return null;
  return read.files;
}

function publishedTruth(
  store: WorldModelStore,
  node: string,
): Record<string, unknown> | null {
  const fm = publishedFiles(store, node);
  if (fm === null || fm[TRUTH] === undefined) return null;
  return JSON.parse(readTextFile(fm[TRUTH]!)) as Record<string, unknown>;
}

// ===========================================================================
// THE LIVE HEADLINE — boot the pipeline with REAL renders that fs_write a patch +
// shell_exec in their working dir; assert the harness HARVESTS the patch file into
// published truth (Option-B), the spawn lane rolls up child tokens, Integration
// renders ONCE for its fan-in, then a restart SKIPS every node (zero model calls).
// Gated; skips offline.
// ===========================================================================

test(
  "IT-3 LIVE: lanes fs_write a real patch + shell_exec in per-node working dirs (Option-B harvest); spawn_subagent lane rolls up child tokens; Integration renders once; a restart memo-skips with zero model calls",
  { skip: hasOpenRouterKey() ? false : "OPENROUTER_API_KEY not set" },
  async () => {
    const wmDir = mkdtempSync(join(tmpdir(), "it3-wm-"));
    const wsDir = mkdtempSync(join(tmpdir(), "it3-ws-"));
    try {
      const { dag, store, renderCounts } = buildLiveGraph(wmDir, wsDir);

      // Stage the two tiny ingress payloads onto the phantom sources.
      stageIngress(store, dag.ledger, PLANNING_SOURCE, PLAN_FILE, PLANNING_DOCS, planIngressCanon);
      stageIngress(store, dag.ledger, REPO_SOURCE, REPO_FILE, REPO_SNAPSHOT, repoIngressCanon);

      // --- drainAsync: wake BOTH gateways in ONE async fixpoint and run the whole
      // pipeline live (the two-gateway Corpus fan-in coalesces into one wave).
      const r = await dag.drainAsync([
        { node: PLANNING_GATEWAY, wake: { source: "external", refs: [] } },
        { node: REPO_GATEWAY, wake: { source: "external", refs: [] } },
      ]);

      // The upstream spine booted: both gateways + corpus + work-plan + foundation.
      equal(dispositionOf(r, PLANNING_GATEWAY), "rendered", "planning gateway must commit");
      equal(dispositionOf(r, REPO_GATEWAY), "rendered", "repo gateway must commit");
      equal(dispositionOf(r, CORPUS), "rendered", "corpus must commit");
      equal(dispositionOf(r, WORK_PLAN), "rendered", "work plan must commit");
      equal(dispositionOf(r, FOUNDATION), "rendered", "foundation must commit");
      // The work-plan published its three per-lane facets (load-bearing for isolation).
      const wpRec = lastReceipt(dag.ledger, WORK_PLAN);
      ok(wpRec);
      ok(wpRec.fingerprints[FACET_A], "work plan must publish facet_a");
      ok(wpRec.fingerprints[FACET_B], "work plan must publish facet_b");
      ok(wpRec.fingerprints[FACET_C], "work plan must publish facet_c");

      // (a) OPTION-B HARVEST: every lane committed; the patch file the lane wrote via
      // fs_write was HARVESTED into its PUBLISHED truth (the directory harvest folded
      // the real on-disk patch into the world-model alongside truth.json). The lane's
      // truth.json records the shell_exec exit code (the test cmd ran in its cwd).
      for (const lane of LANES) {
        equal(dispositionOf(r, lane), "rendered", `${lane} must commit`);
        const fm = publishedFiles(store, lane);
        ok(fm, `${lane} must have published files`);
        ok(
          fm![PATCH_FILE],
          `${lane} must have HARVESTED its real ${PATCH_FILE} into published truth (Option-B)`,
        );
        ok(fm![TRUTH], `${lane} must have harvested its ${TRUTH}`);
        const laneTruth = JSON.parse(readTextFile(fm![TRUTH]!)) as Record<string, unknown>;
        equal(
          laneTruth["test_exit_code"],
          0,
          `${lane} must record its shell_exec test-cmd exit code (0)`,
        );
        // Each lane consumed exactly its (work-plan facet + foundation) inbound tuple.
        const rec = lastReceipt(dag.ledger, lane);
        ok(rec);
        equal(
          rec.input_fingerprints.length,
          2,
          `${lane} must consume its 2 inbound (own facet + foundation) fingerprints`,
        );
      }

      // (b) SPAWN-ROLLUP: Lane C's contract REQUIRES it to delegate a sub-analysis
      // via spawn_subagent. Its RENDERED receipt (a lane may also carry a later cheap
      // SKIP receipt with zero cost — so inspect the rendered one, not merely the
      // last) reports a non-zero fresh-token cost — the child session's tokens roll
      // up into THIS receipt's Cost (the tool runs the helper through the parent
      // RunContext; the NUMERIC parent+child proof is the baseline-vs-spawn assertion
      // in run-project.test.ts IT-0). Its truth carries the helper's returned
      // risk_note, proving the sub-agent value folded in.
      const laneCRendered = receiptsFor(dag.ledger, LANE_C).find(
        (rc) => rc.status === "rendered",
      );
      ok(laneCRendered, "Lane C must have a rendered receipt");
      ok(
        laneCRendered.cost.tokens.fresh > 0,
        "the spawn_subagent lane must report a non-zero fresh token spend (child rolled up)",
      );
      const laneCTruth = publishedTruth(store, LANE_C);
      ok(
        typeof laneCTruth?.["risk_note"] === "string" &&
          (laneCTruth["risk_note"] as string).length > 0,
        "Lane C must fold the spawn_subagent helper's returned risk_note into its truth",
      );

      // The convergence + terminal nodes committed.
      ok(woke(r, CONSTRUCTION_REVIEW), "Construction Review must wake");
      ok(woke(r, INTEGRATION_BUILDER), "Integration Builder must wake");
      ok(woke(r, VERIFICATION_RUNNER), "Verification Runner must wake");
      ok(woke(r, IMPLEMENTATION_REPORT), "Implementation Report must wake");

      // (c) INTEGRATION renders ONCE for its fan-in tuple. Construction Review (⊂ the
      // three same-depth lanes + foundation) reconverges to a SINGLE render, and
      // Integration likewise renders once for its coalesced fan-in (the lanes + the
      // review all land in one wave under drainAsync's serialized fixpoint).
      equal(
        countDisposition(r, CONSTRUCTION_REVIEW, "rendered"),
        1,
        "Construction Review must render exactly once for the 3-lane fan-in tuple",
      );
      equal(
        countDisposition(r, INTEGRATION_BUILDER, "rendered"),
        1,
        "Integration Builder must render exactly once for its fan-in tuple",
      );

      // Snapshot render tallies; every node ran at least once on the cold cascade.
      const countsAfterFirst = { ...renderCounts };
      for (const s of NODE_SPECS) {
        ok(
          (countsAfterFirst[s.id] ?? 0) >= 1,
          `${s.id} must have rendered live at least once on the cold cascade`,
        );
      }

      // (d) RESTART / NO-CHANGE: re-stage the IDENTICAL ingress payloads (unmoved
      // ingress facets) and re-wake both gateways. Both memo-skip; a skip propagates
      // nothing, so NO downstream node wakes — and NO render body runs (zero model
      // calls). The memo key is unmoved across the restart (Option-B harvest is
      // deterministic; the gateways' input fingerprints did not move).
      stageIngress(store, dag.ledger, PLANNING_SOURCE, PLAN_FILE, PLANNING_DOCS, planIngressCanon);
      stageIngress(store, dag.ledger, REPO_SOURCE, REPO_FILE, REPO_SNAPSHOT, repoIngressCanon);
      const again = await dag.drainAsync([
        { node: PLANNING_GATEWAY, wake: { source: "external", refs: [] } },
        { node: REPO_GATEWAY, wake: { source: "external", refs: [] } },
      ]);

      equal(
        dispositionOf(again, PLANNING_GATEWAY),
        "skipped",
        "the planning gateway must memo-skip on an unmoved ingress (zero model calls)",
      );
      equal(
        dispositionOf(again, REPO_GATEWAY),
        "skipped",
        "the repo gateway must memo-skip on an unmoved ingress (zero model calls)",
      );
      for (const s of NODE_SPECS) {
        if (s.id === PLANNING_GATEWAY || s.id === REPO_GATEWAY) continue;
        ok(!woke(again, s.id), `${s.id} must not wake on a restart (no-change)`);
      }
      for (const s of NODE_SPECS) {
        equal(
          renderCounts[s.id] ?? 0,
          countsAfterFirst[s.id] ?? 0,
          `${s.id} must not render on a restart (zero model calls)`,
        );
      }
    } finally {
      rmSync(wmDir, { recursive: true, force: true });
      rmSync(wsDir, { recursive: true, force: true });
    }
  },
);
