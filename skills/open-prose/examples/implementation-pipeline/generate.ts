// The Implementation Pipeline fixture GENERATOR — produces a deterministic,
// replayable `replay/` state-dir whose flagship lesson is FACET-LEVEL LANE
// INVALIDATION UNDER A FIXED TOPOLOGY. It is a sibling of the devtools
// `news-desk` / `masked-relay` generators and reuses ONLY the public, exported
// SDK primitives from `@openprose/reactor` (+ `/sdk`). No SDK change is required.
//
// THE STORY (what the receipts must land — scenarios IP00..IP06 of
//   planning/.../tests/implementation-pipeline.md, encoded as the beat arc):
//
//   A large implementation effort runs as a Reactor system instead of one long
//   chat transcript. ONE gateway (the planning-corpus inbox) exposes three feed
//   facets (docs, repo, config). A `corpus` responsibility folds them; a
//   `work-plan` responsibility normalizes the corpus into work items and assigns
//   each to one of SIX FIXED construction lanes — exposing ONE FACET PER LANE
//   (`lane:sdk-world-model`, …). A `foundation` node establishes the shared
//   shapes every lane must conform to (its `shared-shapes` facet is the FANOUT
//   spine). A `foundation-review` gate sits between. Then SIX statically-mounted
//   construction lanes each subscribe to ONLY (their own work-plan lane facet +
//   the foundation). They fan in to a `construction-review` (which can REJECT a
//   lane), then `integration` (which NEVER merges a rejected lane), then
//   `verification`, then the terminal `signpost-index` + `implementation-report`.
//
//   THE INVARIANT (the tenet this example teaches):
//     The planner may reassign lane CONTENTS; it may NOT mutate the GRAPH. Extra
//     work it cannot place becomes `unassigned_work` on the work-plan truth —
//     never a 7th mounted node. The topology is FIXED at 16 nodes forever.
//
//   The scripted beat arc:
//     IP00/IP06 cold-boot → quiet (a byte-identical re-tick memo-SKIPS the WHOLE
//     graph, fresh flat at zero) → IP03 lane-local (one lane facet moves ⇒ ONLY
//     that lane lights; the five siblings stay dark) → IP02 foundation fanout
//     (the shared shape moves ⇒ ALL SIX lanes wake once) → IP04 review-blocks
//     (a lane proposes an out-of-bounds patch ⇒ construction-review REJECTS it ⇒
//     integration EXCLUDES it; the report shows the rejection) → quiet bookend.
//
// THE MECHANICAL FIX (the dark-lane is REAL): the work-plan canonicalizer emits
// INDEPENDENT per-lane facet tokens. A skill-contract-only edit perturbs ONLY
// the `lane:skill-contract` token; the five sibling tokens are byte-identical,
// so their lanes never wake. And `unassigned_work`/`diagnostics` live on the
// work-plan's OWN truth (the `diagnostics` facet), never as a new graph node.
//
// It persists the SAME full state-dir shape the devtools fixtures do (so
// reactor-devtools can replay it unchanged):
//
//   replay/receipts.json                 (durable append-only ledger trail)
//   replay/world-models/<hexNodeId>/…    (per-node published truth + history)
//   replay/compile/topology.json         (the flat TopologyWorldModel the SPA draws)
//   replay/compile/labels.json           (nodeId → friendly label for the SPA)
//   replay/beats.json                    (the scripted beat timeline; self-written
//                                          so a regen is LOSSLESS — no clobber)
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much actually moved.
// Same generator ⇒ byte-identical state-dir ⇒ a regen is a reviewable no-op diff.

import { createHash } from "node:crypto";
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
  zeroCost,
  ATOMIC_FACET,
  createNullSignature,
  EMPTY_SEMANTIC_DIFF,
  type WorldModelStore,
  type WorldModelFiles,
  type Cost,
  type Fingerprint,
  type Facet,
  type WakeSource,
  type TopologyWorldModel,
  type TopologyNode,
  type TopologyEdge,
  type Wake,
} from "@openprose/reactor";

import type { ReconcilerTopology } from "@openprose/reactor/sdk";
import type { RenderContext, RenderProduct } from "@openprose/reactor/sdk";

// ---------------------------------------------------------------------------
// Node identities. The labels the SPA shows come from the labels map below; the
// ids stay namespaced for the topology.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.planning-corpus"; // the phantom edge: the raw planning inbox
const GATEWAY = "gateway.planning-corpus"; // the SINGLE entry point; docs/repo/config facets

const CORPUS = "responsibility.implementation-corpus";
const WORKPLAN = "responsibility.implementation-work-plan";
const FOUNDATION = "responsibility.foundation-builder";
const FOUNDATION_REVIEW = "responsibility.foundation-review";

// The SIX fixed construction lanes — the wide parallel fanout. This list is
// FROZEN: the work-plan can reassign their CONTENTS but can never add a seventh.
const LANES = [
  "sdk-world-model",
  "sdk-runtime",
  "sdk-compile",
  "skill-contract",
  "examples-tests",
  "docs-signposts",
] as const;
type Lane = (typeof LANES)[number];

const LANE_NODE: Record<Lane, string> = Object.fromEntries(
  LANES.map((l) => [l, `responsibility.lane-${l}`]),
) as Record<Lane, string>;

const CONSTRUCTION_REVIEW = "responsibility.construction-review";
const INTEGRATION = "responsibility.integration-builder";
const VERIFICATION = "responsibility.verification-runner";
const SIGNPOST = "responsibility.signpost-index";
const REPORT = "responsibility.implementation-report";

// --- Facet tokens -----------------------------------------------------------

// The three feed facets the gateway exposes (independent ingress lanes).
const FEED_FACETS = ["docs", "repo", "config"] as const;
type Feed = (typeof FEED_FACETS)[number];
const FEED_FACET: Record<Feed, Facet> = { docs: "docs", repo: "repo", config: "config" };

// ONE facet per lane on the work-plan — the dark-lane boundary. A lane-local
// edit moves ONLY its own token; the five siblings stay byte-identical.
const LANE_FACET: Record<Lane, Facet> = Object.fromEntries(
  LANES.map((l) => [l, `lane:${l}`]),
) as Record<Lane, Facet>;

// The work-plan's diagnostics facet — where `unassigned_work` and `ambiguous_work`
// live. Extra work the six lanes cannot cover surfaces HERE, never as a 7th node.
const DIAGNOSTICS_FACET: Facet = "diagnostics";

// The foundation's gating facet — the intentional FANOUT spine. When the shared
// shape moves, every lane that subscribes to it wakes once.
const SHARED_SHAPES_FACET: Facet = "shared-shapes";

// The construction-review's gating facet — the accepted/rejected verdict the
// integration node reads. A rejected lane never reaches `integrated_patch_set`.
const ACCEPTED_FACET: Facet = "accepted";

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label).
// ---------------------------------------------------------------------------

const LANE_LABEL: Record<Lane, string> = {
  "sdk-world-model": "Lane · SDK World-Model",
  "sdk-runtime": "Lane · SDK Runtime",
  "sdk-compile": "Lane · SDK Compile",
  "skill-contract": "Lane · Skill Contract",
  "examples-tests": "Lane · Examples/Test",
  "docs-signposts": "Lane · Docs/Signpost",
};

const LABELS: Record<string, string> = {
  [SOURCE]: "Planning Inbox",
  [GATEWAY]: "Planning Corpus",
  [CORPUS]: "Implementation Corpus",
  [WORKPLAN]: "Implementation Work Plan",
  [FOUNDATION]: "Foundation Builder",
  [FOUNDATION_REVIEW]: "Foundation Review",
  ...Object.fromEntries(LANES.map((l) => [LANE_NODE[l], LANE_LABEL[l]])),
  [CONSTRUCTION_REVIEW]: "Construction Review",
  [INTEGRATION]: "Integration Builder",
  [VERIFICATION]: "Verification Runner",
  [SIGNPOST]: "Signpost Index",
  [REPORT]: "Implementation Report",
};

// ---------------------------------------------------------------------------
// Deterministic fingerprint of a structured sub-value (own facet tokens). A
// facet token moves iff its projected sub-value moves.
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
// The cost model. Fresh tokens scale with how much NEW material a render had to
// digest/produce; reused tokens are carried. The reconciler stamps `skipped`
// receipts with zeroCost automatically (fresh:0 — a flat line).
//
// `surprise_cause` MUST equal the wake source — read it off ctx, never hardcode
// (receipt validation enforces it on commit).
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 140;
const REUSED_FLOOR = 200;

function renderCost(ctx: RenderContext, freshUnits: number, reusedUnits = 0): Cost {
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
// The planning-corpus payload. A flat map of the three feeds. A "tick"
// re-publishes the inbox; a focused edit mutates exactly one feed's slice.
// ---------------------------------------------------------------------------

interface CorpusInbox {
  /** Planning docs: a map of doc-id → list of requested work items (by lane). */
  readonly docs: Record<string, { lane: Lane | "unassigned"; item: string }[]>;
  /** Target repo snapshot: branch + sha + the shared shape the foundation owns. */
  readonly repo: { branch: string; sha: string; shared_shape: string };
  /** Run config: which lanes are enabled + the forbidden-operation policy. */
  readonly config: { enabled_lanes: Lane[]; forbidden_paths: string[] };
}

function seedInbox(): CorpusInbox {
  return {
    docs: {
      "plan.md": [
        { lane: "sdk-world-model", item: "world-model store" },
        { lane: "sdk-runtime", item: "reconciler" },
        { lane: "sdk-compile", item: "Forme compile step" },
        { lane: "skill-contract", item: "contract docs" },
        { lane: "examples-tests", item: "examples" },
        { lane: "docs-signposts", item: "signposts" },
        // Extra work the six fixed lanes cannot cover — it must become
        // `unassigned_work`, never a seventh mounted node (IP00).
        { lane: "unassigned", item: "a telemetry dashboard nobody owns" },
      ],
    },
    repo: { branch: "feat/intelligent-react", sha: "432d1ce", shared_shape: "Receipt@v1" },
    config: {
      enabled_lanes: [...LANES],
      forbidden_paths: ["packages/reactor/src/receipt/sign.ts"],
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

// The ingress source exposes one facet per feed — the fingerprint of ONLY that
// feed's slice. Mutate `docs` and only the ingress `docs` facet moves.
const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["corpus-inbox.json"];
  const inbox: Partial<CorpusInbox> =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as CorpusInbox);
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const f of FEED_FACETS) out[FEED_FACET[f]] = materialFingerprint(inbox[f] ?? null);
  return out;
};

// The gateway re-projects each feed slice into an INDEPENDENT facet token.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const feeds = (t["feeds"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const f of FEED_FACETS) out[FEED_FACET[f]] = materialFingerprint(feeds[f] ?? null);
  return out;
};

// THE dark-lane boundary. The work-plan exposes ONE facet per fixed lane (the
// fingerprint of ONLY that lane's assigned items), a `diagnostics` facet (the
// `unassigned_work`), and the atomic whole.
const workPlanCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const lanes = (t["lane_assignments"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const l of LANES) out[LANE_FACET[l]] = materialFingerprint(lanes[l] ?? null);
  out[DIAGNOSTICS_FACET] = materialFingerprint({
    unassigned_work: t["unassigned_work"] ?? [],
    ambiguous_work: t["ambiguous_work"] ?? [],
  });
  return out;
};

// The foundation exposes its `shared-shapes` gating facet (the FANOUT spine) +
// the atomic whole.
const foundationCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [SHARED_SHAPES_FACET]: materialFingerprint(t["shared_shapes"] ?? null),
  };
};

// The construction-review exposes its `accepted` verdict facet (the set of
// accepted lanes + the per-lane reject reasons) + the atomic whole.
const reviewCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [ACCEPTED_FACET]: materialFingerprint({
      accepted_lanes: t["accepted_lanes"] ?? [],
      rejected_lanes: t["rejected_lanes"] ?? [],
    }),
  };
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved).
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}
type Render = (ctx: RenderContext) => RenderProduct;

// The gateway: read the raw inbox, normalize into the three independent feeds.
function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const inbox =
      (readJson<Partial<CorpusInbox>>(deps.store, SOURCE, "corpus-inbox.json") ??
        {}) as Partial<CorpusInbox>;
    const feeds: Record<string, unknown> = {
      docs: inbox.docs ?? {},
      repo: inbox.repo ?? null,
      config: inbox.config ?? null,
    };
    return commit({ feeds, watched: FEED_FACETS.length }, renderCost(ctx, 1, 1));
  };
}

// The Implementation Corpus: fold the three feeds into one corpus truth.
function corpusRender(deps: Deps): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const feeds = (gw?.["feeds"] ?? {}) as Record<string, unknown>;
    return commit(
      {
        docs: feeds["docs"] ?? {},
        repo_snapshot: feeds["repo"] ?? null,
        constraints: feeds["config"] ?? null,
      },
      renderCost(ctx, 1, 1),
    );
  };
}

// The Implementation Work Plan: normalize the corpus docs into work items and
// assign each to one of the SIX FIXED lanes. Items it cannot place become
// `unassigned_work` (IP00) — it NEVER creates a new lane. Exposes one facet per
// lane so a lane-local edit lights ONLY that lane.
function workPlanRender(deps: Deps): Render {
  return (ctx) => {
    const corpus = readJson(deps.store, CORPUS);
    const docs = (corpus?.["docs"] ?? {}) as Record<
      string,
      { lane: Lane | "unassigned"; item: string }[]
    >;
    const lane_assignments: Record<string, string[]> = Object.fromEntries(
      LANES.map((l) => [l, [] as string[]]),
    );
    const unassigned_work: string[] = [];
    for (const items of Object.values(docs)) {
      for (const w of items) {
        if (w.lane === "unassigned" || !LANES.includes(w.lane as Lane)) {
          // Discovered more work than the fixed lanes cover. Record the fact;
          // do NOT create a new lane (the invariant).
          unassigned_work.push(w.item);
        } else {
          lane_assignments[w.lane]!.push(w.item);
        }
      }
    }
    const moved = LANES.filter((l) => lane_assignments[l]!.length > 0).length;
    return commit(
      {
        lane_assignments,
        unassigned_work,
        ambiguous_work: [] as string[],
        fixed_lane_count: LANES.length,
      },
      renderCost(ctx, Math.max(1, moved), 2),
    );
  };
}

// The Foundation Builder: establish the shared shapes every lane must conform
// to. Its `shared-shapes` facet is the intentional fanout spine.
function foundationRender(deps: Deps): Render {
  return (ctx) => {
    const corpus = readJson(deps.store, CORPUS);
    const repo = (corpus?.["repo_snapshot"] ?? {}) as Record<string, unknown>;
    const sharedShape = (repo["shared_shape"] as string) ?? "Receipt@v1";
    return commit(
      {
        shared_shapes: { receipt: sharedShape },
        invariants: ["lanes own disjoint paths", "rejected lanes never integrate"],
        notes_for_lanes: "conform to the shared receipt shape",
      },
      renderCost(ctx, 2, 2),
    );
  };
}

// The Foundation Review: gate the foundation before the construction fanout.
function foundationReviewRender(deps: Deps): Render {
  return (ctx) => {
    const f = readJson(deps.store, FOUNDATION);
    return commit(
      {
        accepted: true,
        required_fixes: [] as string[],
        review_summary: `foundation accepted (${JSON.stringify(f?.["shared_shapes"] ?? {})})`,
      },
      renderCost(ctx, 1, 1),
    );
  };
}

// A construction lane: read ONLY its own work-plan lane facet + the foundation +
// the foundation-review. Emit a LaneState. A lane flagged out-of-bounds proposes
// a patch into a forbidden path (the review rejects it). A lane with no items
// publishes an explicit no-op LaneState and can memo-skip on later quiet runs.
function laneRender(deps: Deps, lane: Lane): Render {
  return (ctx) => {
    const wp = readJson(deps.store, WORKPLAN);
    const assignments = (wp?.["lane_assignments"] ?? {}) as Record<string, string[]>;
    const items = assignments[lane] ?? [];
    const foundation = readJson(deps.store, FOUNDATION);
    const sharedShape =
      ((foundation?.["shared_shapes"] ?? {}) as Record<string, unknown>)["receipt"] ?? "?";

    // The out-of-bounds beat (IP04): when a lane's assignment carries the poison
    // item, it proposes a patch OUTSIDE its owned paths (a forbidden file). The
    // construction-review will reject it; integration will exclude it.
    const outOfBounds = items.some((i) => i.includes("OUT-OF-BOUNDS"));
    const ownedPrefix = `packages/${lane}/`;
    const patch_set = outOfBounds
      ? [{ path: "packages/reactor/src/receipt/sign.ts", change: "tamper" }]
      : items.map((i, n) => ({ path: `${ownedPrefix}f${n}.ts`, change: i }));

    return commit(
      {
        status: items.length === 0 ? "no-op" : outOfBounds ? "out-of-bounds" : "proposed",
        owned_paths: [ownedPrefix],
        patch_set,
        tests_added: items.map((_, n) => `${ownedPrefix}f${n}.test.ts`),
        exports_needed: items.length > 0 ? [`${lane}Api`] : [],
        signpost: `signposts/${lane}.md`,
        open_issues: [] as string[],
        verification_notes: `conforms to ${sharedShape}`,
      },
      renderCost(ctx, Math.max(1, items.length), 1),
    );
  };
}

// The Construction Review: fan in from all six lanes + the foundation. Reject any
// lane whose proposed patch escapes its owned paths or hits a forbidden path.
function constructionReviewRender(deps: Deps): Render {
  return (ctx) => {
    const config = (readJson(deps.store, CORPUS)?.["constraints"] ?? {}) as {
      forbidden_paths?: string[];
    };
    const forbidden = new Set(config.forbidden_paths ?? []);
    const accepted_lanes: Lane[] = [];
    const rejected_lanes: { lane: Lane; reason: string }[] = [];
    for (const l of LANES) {
      const ls = readJson(deps.store, LANE_NODE[l]);
      const owned = ((ls?.["owned_paths"] ?? []) as string[])[0] ?? `packages/${l}/`;
      const patches = (ls?.["patch_set"] ?? []) as { path: string }[];
      const violation = patches.find(
        (p) => forbidden.has(p.path) || !p.path.startsWith(owned),
      );
      if (violation) {
        rejected_lanes.push({
          lane: l,
          reason: `patch ${violation.path} escapes owned paths / hits a forbidden path`,
        });
      } else {
        accepted_lanes.push(l);
      }
    }
    return commit(
      {
        accepted_lanes,
        rejected_lanes,
        cross_lane_conflicts: [] as string[],
        ready_for_integration: rejected_lanes.length === 0 ? "all" : "accepted-only",
      },
      renderCost(ctx, Math.max(1, accepted_lanes.length), 2),
    );
  };
}

// The Integration Builder: merge ONLY the accepted lane outputs. A rejected lane
// NEVER reaches `integrated_patch_set` (IP04). For a skipped lane, integration
// reuses its prior accepted output by reference (IP03).
function integrationRender(deps: Deps): Render {
  return (ctx) => {
    const review = readJson(deps.store, CONSTRUCTION_REVIEW);
    const accepted = new Set((review?.["accepted_lanes"] ?? []) as Lane[]);
    const rejected = (review?.["rejected_lanes"] ?? []) as { lane: Lane }[];
    const integrated_patch_set: { lane: Lane; path: string }[] = [];
    for (const l of LANES) {
      if (!accepted.has(l)) continue; // rejected lanes are excluded by construction
      const ls = readJson(deps.store, LANE_NODE[l]);
      for (const p of (ls?.["patch_set"] ?? []) as { path: string }[]) {
        integrated_patch_set.push({ lane: l, path: p.path });
      }
    }
    return commit(
      {
        integrated_patch_set,
        excluded_lanes: rejected.map((r) => r.lane),
        typecheck_result: "pass",
        unit_test_result: "pass",
        remaining_failures: [] as string[],
        integration_signpost: "signposts/integration.md",
      },
      renderCost(ctx, Math.max(1, integrated_patch_set.length), 3),
    );
  };
}

// The Verification Runner: run the full suite + the deterministic replay check.
function verificationRender(deps: Deps): Render {
  return (ctx) => {
    const integ = readJson(deps.store, INTEGRATION);
    const patches = (integ?.["integrated_patch_set"] ?? []) as unknown[];
    return commit(
      {
        full_suite_results: "pass",
        deterministic_replay_result: "stable",
        promised_tests_present: true,
        first_failure: null,
        verification_signpost: "signposts/verification.md",
        checked_patches: patches.length,
      },
      renderCost(ctx, 2, 2),
    );
  };
}

// The Signpost Index: a terminal projection over the whole tree.
function signpostRender(deps: Deps): Render {
  return (ctx) => {
    const verif = readJson(deps.store, VERIFICATION);
    return commit(
      {
        tree: { foundation: "signposts/foundation.md", lanes: LANES.map((l) => `signposts/${l}.md`) },
        verify_commands: ["REACTOR_OFFLINE=1 npx vitest run"],
        rewind_instructions: "replay receipts.json from the prior @atomic version",
        verification: verif?.["deterministic_replay_result"] ?? "?",
      },
      renderCost(ctx, 1, 2),
    );
  };
}

// The Implementation Report: the terminal executive projection. Surfaces the
// rejected lanes (IP04) and the skipped lanes (IP03/IP06).
function reportRender(deps: Deps): Render {
  return (ctx) => {
    const wp = readJson(deps.store, WORKPLAN);
    const review = readJson(deps.store, CONSTRUCTION_REVIEW);
    const integ = readJson(deps.store, INTEGRATION);
    const verif = readJson(deps.store, VERIFICATION);
    return commit(
      {
        summary: "implementation pipeline run",
        status: verif?.["full_suite_results"] ?? "?",
        unassigned_work: wp?.["unassigned_work"] ?? [],
        rejected_lanes: review?.["rejected_lanes"] ?? [],
        files_changed: (integ?.["integrated_patch_set"] ?? []) as unknown[],
        open_risks: [] as string[],
        artifact_refs: ["signposts/", "receipts.json"],
      },
      renderCost(ctx, 1, 3),
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
// The beat timeline (self-written so a regen is LOSSLESS — never clobbered).
// ---------------------------------------------------------------------------

interface Beat {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly holdMs: number;
  readonly caption: string;
}

// ---------------------------------------------------------------------------
// The generator.
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  readonly stateDir: string;
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
 * Build the deterministic Implementation Pipeline state-dir at `opts.stateDir`.
 * Drives the scripted beat timeline through the REAL reconciler over the
 * FileSystem store + ledger, then writes `compile/topology.json`,
 * `compile/labels.json`, and `beats.json`. Re-running reproduces the bytes.
 */
export function generateImplementationPipelineFixture(opts: GenerateOptions): GenerateResult {
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
    {
      id: CORPUS,
      kind: "responsibility",
      requires: [{ producer: GATEWAY }],
      render: corpusRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: WORKPLAN,
      kind: "responsibility",
      requires: [{ producer: CORPUS }],
      render: workPlanRender(deps),
      canonicalizer: workPlanCanon,
    },
    {
      id: FOUNDATION,
      kind: "responsibility",
      requires: [{ producer: CORPUS }],
      render: foundationRender(deps),
      canonicalizer: foundationCanon,
    },
    {
      id: FOUNDATION_REVIEW,
      kind: "responsibility",
      requires: [{ producer: FOUNDATION }],
      render: foundationReviewRender(deps),
      canonicalizer: atomicTruth,
    },
    // The SIX fixed construction lanes — each subscribes to ONLY its own work-plan
    // lane facet + the foundation's shared-shapes facet + the foundation-review.
    ...LANES.map<NodeDecl>((l) => ({
      id: LANE_NODE[l],
      kind: "responsibility",
      requires: [
        { producer: WORKPLAN, facet: LANE_FACET[l] },
        { producer: FOUNDATION, facet: SHARED_SHAPES_FACET },
        { producer: FOUNDATION_REVIEW },
      ],
      render: laneRender(deps, l),
      canonicalizer: atomicTruth,
    })),
    {
      id: CONSTRUCTION_REVIEW,
      kind: "responsibility",
      // DIAMOND fan-in from all six lanes (atomic) + the foundation.
      requires: [...LANES.map((l) => ({ producer: LANE_NODE[l] })), { producer: FOUNDATION }],
      render: constructionReviewRender(deps),
      canonicalizer: reviewCanon,
    },
    {
      id: INTEGRATION,
      kind: "responsibility",
      // Subscribes to the accepted verdict facet + every lane's truth (it reuses
      // prior accepted outputs for skipped lanes by reference).
      requires: [
        { producer: CONSTRUCTION_REVIEW, facet: ACCEPTED_FACET },
        ...LANES.map((l) => ({ producer: LANE_NODE[l] })),
      ],
      render: integrationRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: VERIFICATION,
      kind: "responsibility",
      requires: [{ producer: INTEGRATION }],
      render: verificationRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: SIGNPOST,
      kind: "responsibility",
      requires: [
        { producer: FOUNDATION },
        ...LANES.map((l) => ({ producer: LANE_NODE[l] })),
        { producer: INTEGRATION },
        { producer: VERIFICATION },
      ],
      render: signpostRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: REPORT,
      kind: "responsibility",
      requires: [
        { producer: WORKPLAN },
        { producer: CONSTRUCTION_REVIEW },
        { producer: INTEGRATION },
        { producer: VERIFICATION },
        { producer: SIGNPOST },
      ],
      render: reportRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  const inbox: CorpusInbox = seedInbox();

  // Re-publish the planning inbox and wake the gateway. When `inbox` is
  // byte-identical to the prior publish, the gateway memo-skips and the whole
  // graph below it memo-skips too (the quiet-world re-wake).
  const publishAndWake = (): void => {
    const fm = files({ "corpus-inbox.json": jsonFile(inbox) });
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

  const beatBounds: { name: string; caption: string; holdMs: number; from: number }[] = [];
  const beatStart = (name: string, caption: string, holdMs: number) => {
    beatBounds.push({ name, caption, holdMs, from: ledger.all().length });
  };

  // ======================================================================
  // The scripted beat timeline (encodes IP00..IP06).
  // ======================================================================

  // --- Beat 1: COLD BOOT (IP00). Seed the inbox; every node renders once — the
  // full fixed graph lights up. The work-plan assigns the six lanes and records
  // the un-ownable item as `unassigned_work` (NOT a seventh node).
  beatStart("cold-boot", "the fixed graph wires up · 6 lanes mounted · extra work parks in unassigned_work", 2600);
  publishAndWake();

  // --- Beat 2: QUIET (IP06). Byte-identical re-scans: the WHOLE graph memo-SKIPS,
  // the fresh-line flat at zero. The report fingerprint does not move.
  beatStart("quiet", "a no-change replay · every node memo-skips · cost flat, the report fingerprint is stable", 2800);
  for (let i = 0; i < 6; i++) publishAndWake();

  // --- Beat 3: LANE-LOCAL (IP03). Edit ONLY the skill-contract doc guidance. The
  // `lane:skill-contract` work-plan facet moves; the five sibling lane facets stay
  // byte-identical ⇒ ONLY the Skill Contract lane lights; the five siblings skip.
  // Construction-review → integration → verification → signpost → report wake
  // because a lane output moved.
  beatStart("lane-local", "IP03 · only skill-contract guidance changed · ONE lane lights, five lanes stay dark", 3600);
  inbox.docs["plan.md"] = inbox.docs["plan.md"].map((w) =>
    w.lane === "skill-contract" ? { ...w, item: "contract docs + facet sub-headings" } : w,
  );
  publishAndWake();

  // --- Beat 4: QUIET bookend after the lane-local change.
  beatStart("quiet-2", "back to a flat memo-skip field · the changed lane settled", 2400);
  for (let i = 0; i < 3; i++) publishAndWake();

  // --- Beat 5: FOUNDATION FANOUT (IP02). The shared receipt shape bumps to v2.
  // The foundation's `shared-shapes` facet moves ⇒ ALL SIX lanes wake once (the
  // intentional fanout). Each re-conforms; the wave flows to review/integration.
  beatStart("foundation-fanout", "IP02 · the shared shape moves to Receipt@v2 · ALL SIX lanes wake once (intentional fanout)", 3800);
  inbox.repo = { ...inbox.repo, shared_shape: "Receipt@v2" };
  publishAndWake();

  // --- Beat 6: REVIEW BLOCKS UNSAFE LANE (IP04). The docs read assigns an
  // out-of-bounds item to the sdk-runtime lane: it proposes a patch into a
  // forbidden file. Construction-review REJECTS it; integration EXCLUDES it; the
  // report shows the rejection.
  beatStart("review-blocks", "IP04 · a lane patches a forbidden path · construction-review REJECTS · integration excludes it", 3400);
  inbox.docs["plan.md"] = inbox.docs["plan.md"].map((w) =>
    w.lane === "sdk-runtime" ? { ...w, item: "reconciler OUT-OF-BOUNDS edit" } : w,
  );
  publishAndWake();

  // --- Beat 7: FINAL QUIET (IP06). Byte-identical re-scans — flat-line bookend.
  beatStart("quiet-final", "the bookend · no-change replay · the whole fixed graph memo-skips at zero fresh", 2600);
  for (let i = 0; i < 6; i++) publishAndWake();

  const total = ledger.all().length;
  const beats: Beat[] = beatBounds.map((b, i) => ({
    name: b.name,
    from: b.from,
    to: (i + 1 < beatBounds.length ? beatBounds[i + 1]!.from : total) - 1,
    holdMs: b.holdMs,
    caption: b.caption,
  }));

  // --- Persist the compile snapshot + the beat timeline (MANDATORY for replay) --
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
    `${JSON.stringify(
      {
        scenario: "implementation-pipeline",
        title:
          "A wide implementation effort as a FIXED DAG · 6 construction lanes · the planner reassigns lane contents but can never grow the graph.",
        beats,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [
      ...FEED_FACETS.map((f) => FEED_FACET[f]),
      ...LANES.map((l) => LANE_FACET[l]),
      DIAGNOSTICS_FACET,
      SHARED_SHAPES_FACET,
      ACCEPTED_FACET,
    ],
  };
}
