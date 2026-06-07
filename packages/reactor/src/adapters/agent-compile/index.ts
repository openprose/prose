/**
 * The compile path, built as SESSIONS — the Phase-3 public surface
 * (architecture.md §2/§3; ROADMAP Phase 3). Three intelligent compile renders,
 * each a SKILL-loaded `@openai/agents` session over the loaded contract set, each
 * emitting a structured artifact that is then LOWERED DETERMINISTICALLY by the
 * existing producers (`wire` / `compileNode` / `compilePostconditions`):
 *
 *   - {@link compileForme}        → the topology DAG (`ReconcilerTopology`)
 *   - {@link compileCanonicalizer} → a node's run-time canonicalizer (`CompiledNode`)
 *   - {@link compilePostcondition} → a node's commit-gate validators
 *
 * The Determinism boundary (gap-audit): the SESSION makes the one judgment only
 * it can (semantic match / materiality / postcondition mode); the deterministic
 * scaffolding does the rest and produces an artifact the dumb run phase executes.
 * NOTHING parses `.prose` semantics — only the trivial {@link loadContractSet}
 * file-loading is deterministic (gap-audit #8; a `.prose` parser is a NON-GOAL).
 *
 * THE FULL FLOW (a project mounts WITHOUT hand-authoring):
 *   1. `loadContractSet(dir)` — enumerate + slice the `.prose.md` set (dumb).
 *   2. `compileForme(contracts, fps)` — the Forme session → `ReconcilerTopology`.
 *   3. per node: `compileCanonicalizer` + `compilePostcondition` sessions →
 *      the run-time canonicalizers + validators.
 *   4. mount the topology + canonicalizers via `mountDag` / `createReactor` and
 *      run dumbly — exactly as the scenario harness mounts a hand-authored DAG.
 *
 * Offline-build guard: this barrel and `session.ts` import `@openai/agents`+`zod`
 * (dev/optional). It is intentionally NOT re-exported by the offline adapters
 * barrel (`adapters/index.ts`); a consumer of the offline core never reaches it.
 * The pure, SDK-free pieces (the loader, the lowerings, the schemas-as-data) are
 * separately importable for offline tests.
 */

import type { AgentOutputType } from "@openai/agents";

import type { Cost, Fingerprint } from "../../shapes";
import type { CompiledNode } from "../../canonicalizer";
import type { CompilePostconditionsResult } from "../../postcondition";
import type { ContractSet, LoadedContract } from "./contract-loader";
import {
  runCompileSession,
  type CompileSessionConfig,
} from "./session";
import {
  formeOutputSchema,
  lowerFormeOutput,
  type FormeOutputSignal,
  type LoweredFormeOutput,
} from "./forme-output";
import {
  canonicalizerOutputSchema,
  lowerCanonicalizerOutput,
  type CanonicalizerOutputSignal,
} from "./canonicalizer-output";
import {
  postconditionOutputSchema,
  lowerPostconditionOutput,
  type PostconditionOutputSignal,
} from "./postcondition-output";
import {
  FORME_TASK,
  canonicalizerTask,
  postconditionTask,
} from "./tasks";

// ---------------------------------------------------------------------------
// Shared per-call options (everything except the step/task/schema)
// ---------------------------------------------------------------------------

/**
 * The per-call knobs a caller passes to a compile step — the session config
 * MINUS the fields each step fixes itself (`step`, `task`, `outputType`).
 */
export type CompileStepOptions = Omit<
  CompileSessionConfig,
  "step" | "task" | "outputType"
>;

// ---------------------------------------------------------------------------
// 3a. Forme — the topology session
// ---------------------------------------------------------------------------

/** Forme compile result: the mountable topology + its session cost + diagnostics. */
export interface FormeCompileResult extends LoweredFormeOutput {
  readonly cost: Cost;
}

/**
 * Run Forme as a compile SESSION over the contract set and lower its decisions
 * into a mountable {@link import("../../reactor").ReconcilerTopology}
 * (architecture.md §3.1; forme.md). The session makes the semantic match; the
 * deterministic `wire(...)` scaffolding draws the edges, slots fan-in, surfaces
 * diagnostics, and runs the acyclicity DFS over the session's decisions.
 *
 * `contractFingerprints` is the loaded contract set's frozen fingerprints (the
 * memo key's first half) — supplied by the caller, never invented by the model.
 * Inspect `forme.diagnostics` / `forme.topology.acyclic` to fail the compile on
 * an unsatisfied/ambiguous match or a cycle (the caller's policy).
 */
export async function compileForme(
  contracts: ContractSet,
  contractFingerprints: Readonly<Record<string, Fingerprint>>,
  options: CompileStepOptions = {},
): Promise<FormeCompileResult> {
  const { output, cost } = await runCompileSession(contracts, {
    ...options,
    step: "forme",
    task: FORME_TASK,
    outputType: formeOutputSchema() as AgentOutputType,
  });
  const lowered = lowerFormeOutput(
    output as FormeOutputSignal,
    contractFingerprints,
  );
  return { ...lowered, cost };
}

// ---------------------------------------------------------------------------
// 3b. Canonicalizer — the per-node materiality session
// ---------------------------------------------------------------------------

/** Canonicalizer compile result: the run-time `CompiledNode` + its session cost. */
export interface CanonicalizerCompileResult {
  readonly compiled: CompiledNode;
  readonly cost: Cost;
}

/**
 * Run the canonicalizer-compiler as a compile SESSION for ONE node and lower its
 * materiality decision into the deterministic run-time canonicalizer
 * (architecture.md §3.2; world-model.md §3). The session reads `node`'s
 * `### Maintains` prose + `####` facet parts; `compileNode(...)` freezes the
 * reported spec into `canonicalizer(world-model) → FingerprintMap` code that
 * runs deterministically at run time.
 *
 * The whole contract set is passed as evidence (a node's materiality can depend
 * on what downstreams subscribe to), but the session emits the spec for `node`.
 */
export async function compileCanonicalizer(
  node: string,
  contracts: ContractSet,
  options: CompileStepOptions = {},
): Promise<CanonicalizerCompileResult> {
  const { output, cost } = await runCompileSession(contracts, {
    ...options,
    step: "canonicalizer",
    task: canonicalizerTask(node),
    outputType: canonicalizerOutputSchema() as AgentOutputType,
  });
  const compiled = lowerCanonicalizerOutput(
    node,
    output as CanonicalizerOutputSignal,
  );
  return { compiled, cost };
}

// ---------------------------------------------------------------------------
// 3b. Postcondition — the per-node commit-gate session
// ---------------------------------------------------------------------------

/** Postcondition compile result: the validator set + IR ref + session cost. */
export interface PostconditionCompileResult {
  readonly result: CompilePostconditionsResult;
  readonly cost: Cost;
}

/**
 * Run the postcondition-compiler as a compile SESSION for ONE node and lower its
 * decisions into the deterministic commit-gate validator set (architecture.md
 * §3.3). The session reads `node`'s `### Maintains` postconditions
 * and tags each `deterministic` (a predicate) or
 * `render-attested`; `compilePostconditions(...)` mode-sorts them into the
 * run-time set `gateCommit(...)` executes.
 */
export async function compilePostcondition(
  node: string,
  contracts: ContractSet,
  options: CompileStepOptions = {},
): Promise<PostconditionCompileResult> {
  const { output, cost } = await runCompileSession(contracts, {
    ...options,
    step: "postcondition",
    task: postconditionTask(node),
    outputType: postconditionOutputSchema() as AgentOutputType,
  });
  const result = lowerPostconditionOutput(
    node,
    output as PostconditionOutputSignal,
  );
  return { result, cost };
}

// ---------------------------------------------------------------------------
// Re-exports — the whole compile-path surface from one module
// ---------------------------------------------------------------------------

export {
  type ContractSet,
  type LoadedContract,
  type ContractSet as LoadedContractSet,
  loadContractSet,
  loadContract,
  sliceContract,
  enumerateContractFiles,
  defaultWakeSource,
  CONTRACT_SUFFIX,
} from "./contract-loader";

export { renderContractSet, renderContract } from "./contract-set-input";

export {
  runCompileSession,
  composeCompileInstructions,
  DEFAULT_COMPILE_MAX_TURNS,
  type CompileSessionConfig,
  type CompileSessionResult,
  type CompileStep,
} from "./session";

export {
  formeOutputSchema,
  lowerFormeOutput,
  sessionMatcher,
  type FormeOutputSignal,
  type FormeNodeDecl,
  type FormeMatchDecl,
  type LoweredFormeOutput,
} from "./forme-output";

export {
  canonicalizerOutputSchema,
  lowerCanonicalizerOutput,
  toCanonicalizationSpec,
  type CanonicalizerOutputSignal,
  type CanonicalizerFieldDecl,
  type CanonicalizerFacetDecl,
} from "./canonicalizer-output";

export {
  postconditionOutputSchema,
  predicateSchema,
  flatPredicateSchema,
  flatPredicateNodeSchema,
  decodeFlatPredicate,
  lowerPostconditionOutput,
  toAuthoredPostconditions,
  postconditionArtifactId,
  MAX_PREDICATE_DEPTH,
  MAX_PREDICATE_NODES,
  type PostconditionOutputSignal,
  type PostconditionDecl,
  type FlatPredicate,
  type FlatPredicateNode,
} from "./postcondition-output";

export {
  FORME_TASK,
  canonicalizerTask,
  postconditionTask,
} from "./tasks";

export type { CompiledNode } from "../../canonicalizer";
export type { CompilePostconditionsResult } from "../../postcondition";
