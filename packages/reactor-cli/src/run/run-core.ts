/**
 * The KEYLESS run-phase core (CLI plan Phase 2) — the bridge from the
 * content-addressed compile cache to the SDK's `runProject`.
 *
 * N2 OFFLINE BOUNDARY: this module is reachable from the offline entrypoint, so
 * it imports ONLY the keyless root barrel (`@openprose/reactor`) + the keyless
 * IR cache. It NEVER static-imports `@openprose/reactor/run-project`,
 * `@openprose/reactor/adapters/agent-render`, `@openai/agents`, or `zod` — the
 * model-bearing `runProject` is reached ONLY via a dynamic `import()` inside the
 * `run`/`serve` handlers (see `run/load-run-project.ts`). What lives here is the
 * pure, deterministic glue:
 *
 *   1. {@link loadCompiledProject} re-lowers the cached specs (the existing
 *      keyless `loadIR` → `compileNode(spec)`) and SHAPES them into the SDK's
 *      `CompiledProject` so `runProject` can mount them. (Correction #1: the
 *      cache stores the serializable SPEC; we re-lower at boot, never persist
 *      closures.)
 *   2. {@link buildProjectTruthFor} derives each node's `TruthProjection` from
 *      the compiled spec's facet layout (Correction #2: `runProject` defaults
 *      `projectTruthFor` to EMPTY_PROJECTION, so a faceted producer's fingerprint
 *      never moves and propagation silently no-ops unless we supply this).
 *   3. {@link contractViewFor} hands `runProject` a minimal per-node contract
 *      view so the SDK's `defaultContractFor` (which reads `compiled.contracts`,
 *      a field the cache does not persist) is bypassed.
 *   4. {@link summarizeBoot} projects the boot `ReconcileResult[]` into a small
 *      report (dispositions + cost) the `run` command prints.
 *
 * The CLI CONFIGURES `runProject`; it never re-implements the mount loop
 * (Correction #3 / N3).
 */

import { contentAddressOf } from '@openprose/reactor/adapters';
import {
  type CanonicalizationSpec,
  type CompiledNode,
  type ReconcilerTopology,
} from '@openprose/reactor/internals';

import {
  loadIR,
  isCacheFresh,
  contractSetFingerprint,
  type LoadedCompileIR,
  type PersistedCost,
} from '../compile/ir-cache';
import { loadContractSet as keylessLoadContractSet } from '../compile/contract-images';
import { resolveSdk } from '../meta';
import {
  runCompileCommand,
  type CompileCommandOptions,
} from '../commands/compile';
import type { RunRender } from './load-run-project';
import type { SandboxRunner } from './sandbox';

// ---------------------------------------------------------------------------
// Structural mirrors of the SDK shapes the CLI configures (typed locally so
// this keyless module never imports the model-bearing `./run-project` barrel).
// These are STRUCTURAL — `runProject` accepts any object of this shape.
// ---------------------------------------------------------------------------

/** A node's published files (path → bytes) — the SDK's `WorldModelFiles`. */
export type ProjectFiles = Readonly<Record<string, Uint8Array>>;

/** The structured value a compiled canonicalizer reduces (SDK `WorldModelValue`). */
export type ProjectTruth = unknown;

/** A node's truth projection (SDK `TruthProjection`): files → structured value. */
export type ProjectTruthProjection = (files: ProjectFiles) => ProjectTruth;

/** A minimal per-node contract view (SDK `CompiledContractView`, structural). */
export interface ContractView {
  readonly name: string;
  readonly maintains: readonly string[];
  readonly requires: readonly string[];
  readonly continuity?: string;
  readonly execution?: string;
}

/**
 * The SDK `CompiledProject` shape the CLI assembles from the cache. Mirrors
 * run-project.ts: `reconcilerTopology` + a per-node MAP of `{compiled,
 * postconditions}` + `contracts` + `contractFingerprints` + `cost`. The cache
 * does not persist `contracts` (we pass `[]` and supply `contractFor`) and
 * coarsens `postconditions` to the persisted ref (runProject does not consult
 * them today — documented v1 coarsening, correction #1).
 */
export interface CliCompiledProject {
  readonly reconcilerTopology: ReconcilerTopology;
  readonly perNode: Readonly<
    Record<string, { readonly compiled: CompiledNode; readonly postconditions: unknown }>
  >;
  readonly contracts: readonly unknown[];
  readonly contractFingerprints: Readonly<Record<string, string>>;
  readonly cost: PersistedCost;
}

/** The fully-loaded run inputs the `run`/`serve` handlers hand to `runProject`. */
export interface LoadedRunProject {
  /** The SDK-shaped compiled project (re-lowered, mountable). */
  readonly compiled: CliCompiledProject;
  /** The re-lowered IR (kept for the truth-projection + node enumeration). */
  readonly ir: LoadedCompileIR;
  /** Per-node truth projection (correction #2). */
  readonly projectTruthFor: (node: string) => ProjectTruthProjection;
  /** Per-node minimal contract view (bypasses the SDK defaultContractFor). */
  readonly contractFor: (node: string) => ContractView;
  /** The self-driven node ids (wake_source === "self") for the continuity loop. */
  readonly selfDrivenNodes: readonly string[];
}

// ---------------------------------------------------------------------------
// Load + re-lower + shape (KEYLESS — no model, no determinism-boundary crossing)
// ---------------------------------------------------------------------------

/**
 * Load the cached IR (re-lowering each node's canonicalizer via the keyless
 * `compileNode(spec)` inside `loadIR`) and shape it into the SDK
 * `CompiledProject` + the per-node projections `runProject` needs. Throws (via
 * `loadIR`) if the cache is missing/incomplete — the caller compiles first.
 */
export function loadCompiledProject(stateDir: string): LoadedRunProject {
  const ir = loadIR(stateDir);

  const perNode: Record<
    string,
    { compiled: CompiledNode; postconditions: unknown }
  > = {};
  for (const [node, entry] of Object.entries(ir.perNode)) {
    perNode[node] = {
      compiled: entry.compiled,
      // runProject does not consult postconditions today (v1 coarsening); persist
      // the cached ref so a future consumer can read mode + artifactId.
      postconditions: ir.postconditions[node] ?? null,
    };
  }

  const compiled: CliCompiledProject = {
    reconcilerTopology: ir.topology,
    perNode,
    contracts: [],
    contractFingerprints: ir.contractFingerprints,
    cost: ir.manifest.cost,
  };

  const selfDrivenNodes = ir.topology.topology.nodes
    .filter((n) => n.wake_source === 'self')
    .map((n) => n.node);

  return {
    compiled,
    ir,
    projectTruthFor: (node) => buildProjectTruthFor(ir, node),
    contractFor: (node) => contractViewFor(ir, node),
    selfDrivenNodes,
  };
}

// ---------------------------------------------------------------------------
// ensureCompiledIR — the shared "ensure IR fresh / compile-if-stale" gate every
// run-phase command (`run`/`serve`/`trigger`) opens with. Load the contract
// images, compute the contract-set fingerprint, and compare to the cached
// manifest; on a miss, run the compile command (KEYLESS at load — the model
// surface is reached only inside `runCompileCommand`'s own dynamic import on a
// real miss). Returns a discriminated result so each caller renders its own
// message (a CLI command via `emitError`, `serve` by throwing).
// ---------------------------------------------------------------------------

/** Inputs to {@link ensureCompiledIR}. All paths are already resolved. */
export interface EnsureCompiledIROptions {
  /** The absolute contracts directory. */
  readonly contractsDir: string;
  /** The absolute, isolated state directory. */
  readonly stateDir: string;
  /** The compile-model id (the cache key component). */
  readonly model: string;
  /** Force offline (forwarded to compile-if-stale). */
  readonly offline?: boolean;
  /** A model override applied to compile-if-stale. */
  readonly modelOverride?: string;
  /** Offline-gate compile seam (fake providers + pre-read SKILL). */
  readonly compileOptions?: CompileCommandOptions;
}

/** The outcome of {@link ensureCompiledIR} (the caller renders its own message). */
export type EnsureCompiledIRResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'no-contracts' }
  | { readonly kind: 'compile-failed' };

/**
 * Ensure the cached IR is fresh for the contract set under `contractsDir`,
 * compiling if stale. Keyless at load — the model surface is reached only on an
 * actual miss, inside `runCompileCommand`'s dynamic import.
 */
export async function ensureCompiledIR(
  options: EnsureCompiledIROptions,
): Promise<EnsureCompiledIRResult> {
  const { contractsDir, stateDir, model } = options;
  const sdkVersion = resolveSdk().version ?? 'unknown';

  const images = keylessLoadContractSet(contractsDir);
  if (images.length === 0) {
    return { kind: 'no-contracts' };
  }
  const setFingerprint = contractSetFingerprint(images);
  if (isCacheFresh(stateDir, setFingerprint, sdkVersion, model)) {
    return { kind: 'ok' };
  }

  const compileOptions = options.compileOptions;
  const code = await runCompileCommand(
    {
      stateDir,
      projectDir: contractsDir,
      ...(options.modelOverride !== undefined ? { model: options.modelOverride } : {}),
      ...(options.offline !== undefined ? { offline: options.offline } : {}),
      json: true,
      ...(compileOptions?.testProviders !== undefined
        ? { testProviders: compileOptions.testProviders }
        : {}),
      ...(compileOptions?.testSkill !== undefined
        ? { testSkill: compileOptions.testSkill }
        : {}),
    },
    // Swallow the compile report's lines (the caller prints its own report).
    () => {},
  );
  return code !== 0 ? { kind: 'compile-failed' } : { kind: 'ok' };
}

// ---------------------------------------------------------------------------
// buildRenderWithDefaults — fill a (possibly partial) render with the per-node
// projections + sandbox bound the run-phase commands default in. A test render
// that already wired its own contractFor/projectTruthFor/sandbox/shellTimeoutMs
// keeps them; an omitted field falls back to the loaded IR + built sandbox.
// ---------------------------------------------------------------------------

/** The subset of {@link LoadedRunProject} {@link buildRenderWithDefaults} reads. */
export interface RenderDefaultsSource {
  readonly contractFor: (node: string) => ContractView;
  readonly projectTruthFor: (node: string) => ProjectTruthProjection;
}

/** The built sandbox runner + per-command shell timeout the render defaults in. */
export interface RenderSandboxDefaults {
  readonly runner: SandboxRunner | undefined;
  readonly shellTimeoutMs: number;
}

/**
 * Assemble the render `runProject` receives by defaulting each unset field of
 * `baseRender` from the loaded IR + the built sandbox. Defaulting semantics:
 * `contractFor`/`projectTruthFor` fall back to the loaded projections so faceted
 * producers still propagate (#2); `sandbox` is filled only when the base omits it
 * AND a runner was built; `shellTimeoutMs` is filled only when the base omits it.
 */
export function buildRenderWithDefaults(
  baseRender: RunRender,
  loaded: RenderDefaultsSource,
  sandbox: RenderSandboxDefaults,
): RunRender {
  return {
    ...baseRender,
    contractFor: baseRender.contractFor ?? ((node) => loaded.contractFor(node)),
    projectTruthFor:
      baseRender.projectTruthFor ?? ((node) => loaded.projectTruthFor(node)),
    ...(baseRender.sandbox === undefined && sandbox.runner !== undefined
      ? { sandbox: sandbox.runner }
      : {}),
    ...(baseRender.shellTimeoutMs === undefined
      ? { shellTimeoutMs: sandbox.shellTimeoutMs }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// projectTruthFor — derive a node's TruthProjection from its compiled spec
// (Correction #2). Without this, faceted producers never propagate.
// ---------------------------------------------------------------------------

const TEXT_DECODER = new TextDecoder();

/**
 * Build a node's `TruthProjection` from the cached `CanonicalizationSpec`. The
 * spec's `fields[].path` are the structured field paths the canonicalizer
 * reduces; a render writes its structured truth as JSON at a documented file
 * path. The convention (matching the SDK's own offline gate + `init` scaffold):
 * a node publishes its structured backing at `state/<node>.json` (or any single
 * `.json` file under `state/`), and the projection parses that JSON into the
 * `WorldModelValue` the compiled canonicalizer reduces.
 *
 * A node whose compiled canonicalizer emits NO named facets (`facets` empty —
 * the atomic-only case) needs no structured projection (nothing subscribes to a
 * named facet of it); it returns the empty projection. This mirrors the SDK
 * offline gate's `projectTruthFor` (monitor projects its funding JSON; the brief
 * returns `() => ({})`).
 */
export function buildProjectTruthFor(
  ir: LoadedCompileIR,
  node: string,
): ProjectTruthProjection {
  const entry = ir.perNode[node];
  if (entry === undefined) {
    return () => ({});
  }
  const facets = entry.compiled.canonicalizer.facets;
  if (!Array.isArray(facets) || facets.length === 0) {
    // No named facet → no downstream subscriber on a facet → no structured
    // projection needed (the atomic body is fingerprinted whole by the SDK).
    return () => ({});
  }
  return (files: ProjectFiles) => projectStructuredJson(files);
}

/**
 * Project a node's published files into its structured `WorldModelValue` by
 * parsing the single JSON file the render maintained under `state/`. Deterministic
 * + keyless (no model). Returns `{}` when no such file is present (cold/empty),
 * so the canonicalizer reduces an empty structure rather than throwing.
 */
function projectStructuredJson(files: ProjectFiles): ProjectTruth {
  // Prefer a `state/*.json` file (the documented structured-backing convention);
  // fall back to any single `.json` file. A stable lexicographic pick keeps the
  // projection deterministic when several are present.
  const jsonPaths = Object.keys(files)
    .filter((p) => p.endsWith('.json'))
    .sort();
  const statePath = jsonPaths.find((p) => p.startsWith('state/'));
  const chosen = statePath ?? jsonPaths[0];
  if (chosen === undefined) {
    return {};
  }
  const bytes = files[chosen];
  if (bytes === undefined) {
    return {};
  }
  try {
    return JSON.parse(TEXT_DECODER.decode(bytes)) as ProjectTruth;
  } catch {
    // A non-JSON or malformed body is not structured backing → empty value (the
    // canonicalizer then reduces nothing; never a thrown render).
    return {};
  }
}

// ---------------------------------------------------------------------------
// contractFor — a minimal per-node view so the SDK defaultContractFor (which
// reads compiled.contracts, unpersisted) is bypassed.
// ---------------------------------------------------------------------------

/**
 * A minimal per-node `CompiledContractView`. The cache does not persist the
 * loaded contract source (only the re-lowerable spec + fingerprints), so the
 * run/serve path supplies a coarse view derived from the topology: the node id
 * as the name + its maintained/required facets read off the spec + edges. The
 * load-bearing run-time behavior (materiality, propagation) comes from the
 * COMPILED canonicalizer, not this view (the view is the instruction layer, only
 * material on the LIVE render path; the offline gate uses a fake render that
 * ignores it). For an offline run this is sufficient; a live `run` would
 * typically re-compile to recover the rich contract view.
 */
export function contractViewFor(ir: LoadedCompileIR, node: string): ContractView {
  const entry = ir.perNode[node];
  const maintains = entry?.compiled.canonicalizer.facets ?? [];
  const requires = ir.topology.topology.edges
    .filter((e) => e.subscriber === node)
    .map((e) => e.facet);
  return {
    name: node,
    maintains: [...maintains],
    requires,
  };
}

// ---------------------------------------------------------------------------
// Boot summary — project ReconcileResult[] into the run report
// ---------------------------------------------------------------------------

/** A per-node disposition the `run` report prints. */
export interface NodeDisposition {
  readonly node: string;
  readonly disposition: 'rendered' | 'skipped' | 'failed' | 'coalesced';
}

/** A minimal structural mirror of the SDK `ReconcileResult` (disposition is the
 * SDK's `ReconcileDisposition` string union; typed loosely as `string` so the
 * boot/ingest results flow through without a narrowing cast — `summarizeBoot`
 * normalizes it to the known union). */
export interface CliReconcileResult {
  readonly node: string;
  readonly disposition: string;
}

/** The known reconcile dispositions (the SDK `ReconcileDisposition` union). */
const KNOWN_DISPOSITIONS = new Set([
  'rendered',
  'skipped',
  'failed',
  'coalesced',
]);

function normalizeDisposition(
  disposition: string,
): 'rendered' | 'skipped' | 'failed' | 'coalesced' {
  return KNOWN_DISPOSITIONS.has(disposition)
    ? (disposition as 'rendered' | 'skipped' | 'failed' | 'coalesced')
    : 'failed';
}

/** A minimal structural mirror of an SDK ledger `Receipt` (the fields we read). */
export interface CliReceipt {
  readonly node: string;
  readonly cost: { readonly tokens: { readonly fresh: number; readonly reused: number } };
}

/** The run report: per-node dispositions + the summed run cost. */
export interface RunReport {
  readonly dispositions: readonly NodeDisposition[];
  readonly cost: { readonly fresh: number; readonly reused: number };
  readonly receipts: number;
}

/**
 * Project the boot `ReconcileResult[]` + the ledger receipts into the run report.
 * The run cost is the summed token attribution across the receipts the boot
 * appended (cost is receipt data, never part of the cache identity — N4).
 */
export function summarizeBoot(
  bootResults: readonly CliReconcileResult[],
  receipts: readonly CliReceipt[],
): RunReport {
  const dispositions = bootResults.map((r) => ({
    node: r.node,
    disposition: normalizeDisposition(r.disposition),
  }));
  let fresh = 0;
  let reused = 0;
  for (const r of receipts) {
    fresh += r.cost.tokens.fresh;
    reused += r.cost.tokens.reused;
  }
  return { dispositions, cost: { fresh, reused }, receipts: receipts.length };
}

/** Re-export the keyless content-address primitive (one import surface). */
export { contentAddressOf };
export type { CanonicalizationSpec };
