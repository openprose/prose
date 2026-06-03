/**
 * The MODEL-BEARING compile runner — the intelligent compile sessions.
 *
 * N2 OFFLINE BOUNDARY: this module deep-imports `@openprose/reactor/agents` (the
 * model-bearing compile sessions), which carries `@openai/agents` + `zod`. It is
 * therefore reached ONLY via a dynamic `import()` from the `compile`
 * command handler, never at the offline entrypoint's load scope. A cache HIT never
 * imports this file (the keyless re-lower lives in `ir-cache.ts`).
 *
 * WHY this orchestrates the exported steps instead of calling `compileProject`
 * wholesale: the Phase-1 cache must persist a re-lowerable `CanonicalizationSpec`
 * so a fresh process can `compileNode(spec)` at boot WITHOUT a model (cli.md §4.2;
 * CLI plan Phase 1 + Phase 2 re-lower). `compileProject` returns only the
 * in-memory `CompiledNode` (apply/serialize CLOSURES) and DISCARDS the spec —
 * there is no `compiled.spec` to persist. So the runner drives the EXPORTED
 * deterministic pieces (`compileForme` for the topology, then per node the
 * canonicalizer session via `runCompileSession` → the raw signal →
 * `toCanonicalizationSpec`, plus `compilePostcondition` for the IR ref) to CAPTURE
 * the spec. Every lowering it uses is the SDK's own pure, keyless lowering; this
 * crosses NO determinism boundary (the only model calls are the sessions, exactly
 * as `compileProject` makes them).
 */

import type {
  ContractImage,
  PersistedCost,
  PersistedPostcondition,
  SerializableCompileIR,
} from './ir-cache';
import { contractSetFingerprint } from './ir-cache';

/** A per-step session cost the report breaks out (cli.md §4.4). */
export interface StepCost {
  readonly step: string;
  readonly node?: string;
  readonly fresh: number;
  readonly reused: number;
}

/** A Forme wiring diagnostic surfaced in the report (never silently guessed). */
export interface CompileDiagnostic {
  readonly kind: string;
  readonly subscriber?: string;
  readonly detail?: string;
}

/** The full result of a fresh compile: the serializable IR + the costed report. */
export interface CompileRunResult {
  readonly ir: SerializableCompileIR;
  readonly stepCosts: readonly StepCost[];
  readonly diagnostics: readonly CompileDiagnostic[];
  readonly acyclic: boolean;
  readonly entryPoints: readonly string[];
}

export interface CompileRunOptions {
  /** The contracts directory (the `.prose.md` set). */
  readonly contractsDir: string;
  /** The compile model id (the cache key's third component). */
  readonly model: string;
  /** The SDK version (the cache key's second component). */
  readonly sdkVersion: string;
  /** Decoding temperature (determinism knob). */
  readonly temperature?: number;
  /** Max agentic turns per compile session. */
  readonly maxTurns?: number;
  /**
   * An offline test seam: a per-step fake `ModelProvider`. The offline gate hands
   * a distinct fake per step (each step's `outputType` differs). A live compile
   * leaves this unset and the scoped OpenRouter provider serves every step.
   */
  readonly providers?: CompileStepProviders;
  /** Pre-read SKILL system prompt (offline tests pass a stub). */
  readonly skill?: string;
  /**
   * The keyless provider plan for a CUSTOM (non-default) provider. When present
   * (with {@link apiKey}), the runner builds a scoped live `ModelProvider` and
   * makes it the default for every compile session — so a configured
   * OpenAI/Anthropic/Google/custom endpoint actually drives the compile. Omitted
   * for the default OpenRouter path (the SDK builds its scoped provider lazily) and
   * for the offline gate (which injects per-step fakes via {@link providers}).
   */
  readonly providerPlan?: import('../model/provider-plan').ProviderPlan;
  /** The resolved API key for {@link providerPlan}. Required when it is set. */
  readonly apiKey?: string;
}

/** Per-step provider seam for the offline gate (each step's schema differs). */
export interface CompileStepProviders {
  readonly forme?: unknown;
  readonly canonicalizer?: Readonly<Record<string, unknown>>;
  readonly postcondition?: Readonly<Record<string, unknown>>;
  /** Skip the postcondition session (synthesize the empty IR ref). */
  readonly skipPostconditions?: boolean;
}

/**
 * Run the compile sessions and assemble the serializable IR + report. Dynamic-
 * imports the model-bearing barrels; throws a legible error if `@openai/agents`
 * is absent (a keyless install that tries to compile).
 */
export async function runCompile(options: CompileRunOptions): Promise<CompileRunResult> {
  const agentCompile = await importAgentCompile();
  const {
    loadContractSet,
    compileForme,
    compilePostcondition,
    runCompileSession,
    canonicalizerOutputSchema,
    canonicalizerTask,
    toCanonicalizationSpec,
    postconditionArtifactId,
  } = agentCompile;

  const contracts = loadContractSet(options.contractsDir);
  if (contracts.length === 0) {
    throw new Error(
      `reactor compile: no .prose.md contracts found under ${options.contractsDir}`,
    );
  }

  // Deterministic, keyless: the per-node contract fingerprints (the memo key's
  // first half) + the contract-set fingerprint (the cache key's first component).
  const contractFingerprints = deriveContractFingerprints(contracts);
  const setFingerprint = contractSetFingerprint(contracts.map(toContractImage));

  const stepCosts: StepCost[] = [];
  const sessionBase = sessionOptions(options);

  // CUSTOM provider: build a scoped live `ModelProvider` ONCE and make it the
  // default for every compile session, so a configured non-OpenRouter endpoint
  // (OpenAI/Anthropic/Google/custom) actually drives the compile. The per-step
  // fake provider (offline gate) still overrides it; the default OpenRouter path
  // leaves `providerPlan` unset and the SDK builds its scoped provider lazily.
  if (options.providerPlan !== undefined && options.apiKey !== undefined) {
    const { buildLiveProvider } = await import('../model/live-provider');
    sessionBase['provider'] = buildLiveProvider(options.providerPlan, options.apiKey);
    // Stamp the configured provider label on the compile cost (label-only). The
    // model label is already `options.model` (the compile_model) via sessionOptions.
    sessionBase['providerLabel'] = options.providerPlan.provider;
  }

  // 1. FORME — the topology session.
  const formeProvider = options.providers?.forme;
  const forme = await compileForme(contracts, contractFingerprints, {
    ...sessionBase,
    ...(formeProvider !== undefined ? { provider: formeProvider } : {}),
  });
  stepCosts.push({
    step: 'forme',
    fresh: forme.cost.tokens.fresh,
    reused: forme.cost.tokens.reused,
  });

  let totalFresh = forme.cost.tokens.fresh;
  let totalReused = forme.cost.tokens.reused;
  let provider = forme.cost.provider;
  let model = forme.cost.model;

  const perNodeSpec: Record<string, unknown> = {};
  const postconditions: Record<string, PersistedPostcondition> = {};

  // 2. per node — the canonicalizer session (captured as a re-lowerable spec) +
  //    the postcondition session (captured as the IR ref).
  for (const tNode of forme.reconcilerTopology.topology.nodes) {
    const node = tNode.node;

    // Canonicalizer session → raw signal → CanonicalizationSpec (PERSISTABLE).
    const canonProvider = options.providers?.canonicalizer?.[node];
    const canonSession = await runCompileSession(contracts, {
      ...sessionBase,
      step: 'canonicalizer',
      task: canonicalizerTask(node),
      outputType: canonicalizerOutputSchema(),
      ...(canonProvider !== undefined ? { provider: canonProvider } : {}),
    });
    const spec = toCanonicalizationSpec(node, canonSession.output);
    perNodeSpec[node] = spec;
    stepCosts.push({
      step: 'canonicalizer',
      node,
      fresh: canonSession.cost.tokens.fresh,
      reused: canonSession.cost.tokens.reused,
    });
    totalFresh += canonSession.cost.tokens.fresh;
    totalReused += canonSession.cost.tokens.reused;
    provider = canonSession.cost.provider;
    model = canonSession.cost.model;

    // Postcondition session → the IR ref (mode + artifactId). The run phase does
    // not consult postconditions today (documented v1 coarsening), so we persist
    // only the ref. `skipPostconditions` synthesizes the empty deterministic ref.
    if (options.providers?.skipPostconditions === true) {
      postconditions[node] = {
        node,
        mode: 'deterministic',
        artifactId: postconditionArtifactId(node, 'deterministic'),
      };
    } else {
      const pcProvider = options.providers?.postcondition?.[node];
      const pc = await compilePostcondition(node, contracts, {
        ...sessionBase,
        ...(pcProvider !== undefined ? { provider: pcProvider } : {}),
      });
      postconditions[node] = {
        node,
        mode: pc.result.ref.mode,
        artifactId: pc.result.ref.artifactId,
      };
      stepCosts.push({
        step: 'postcondition',
        node,
        fresh: pc.cost.tokens.fresh,
        reused: pc.cost.tokens.reused,
      });
      totalFresh += pc.cost.tokens.fresh;
      totalReused += pc.cost.tokens.reused;
    }
  }

  const cost: PersistedCost = {
    provider,
    model,
    tokens: { fresh: totalFresh, reused: totalReused },
    surprise_cause: 'self',
  };

  const topology = forme.reconcilerTopology;
  const ir: SerializableCompileIR = {
    topology,
    perNodeSpec: perNodeSpec as SerializableCompileIR['perNodeSpec'],
    postconditions,
    contractFingerprints,
    manifest: {
      contract_set_fingerprint: setFingerprint,
      sdk_version: options.sdkVersion,
      model: options.model,
      cost,
      nodes: topology.topology.nodes.length,
      edges: topology.topology.edges.length,
      compiled_at: new Date().toISOString(),
    },
  };

  const diagnostics: CompileDiagnostic[] = (forme.forme.diagnostics ?? []).map(
    (d: { kind: string; subscriber?: string }) => ({
      kind: d.kind,
      ...(d.subscriber !== undefined ? { subscriber: d.subscriber } : {}),
    }),
  );

  return {
    ir,
    stepCosts,
    diagnostics,
    acyclic: topology.topology.acyclic,
    entryPoints: [...topology.topology.entry_points],
  };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

interface LoadedContractLike {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly requires?: string;
  readonly maintains?: string;
  readonly continuity?: string;
  readonly execution?: string;
  readonly criteria?: string;
}

function toContractImage(c: LoadedContractLike): ContractImage {
  const out: Record<string, unknown> = { id: c.id, name: c.name, kind: c.kind };
  if (c.requires !== undefined) out['requires'] = c.requires;
  if (c.maintains !== undefined) out['maintains'] = c.maintains;
  if (c.continuity !== undefined) out['continuity'] = c.continuity;
  if (c.execution !== undefined) out['execution'] = c.execution;
  if (c.criteria !== undefined) out['criteria'] = c.criteria;
  return out as unknown as ContractImage;
}

/**
 * Derive the per-node contract fingerprints the same way the SDK does
 * (run-project.ts `deriveContractFingerprints` — `contentAddressOf` over a fixed
 * source image). Replicated here (keyless) so the topology the CLI persists
 * carries the exact fingerprints Forme drew the edges over. NOT a model call.
 */
function deriveContractFingerprints(
  contracts: readonly LoadedContractLike[],
): Record<string, string> {
  // contentAddressOf is on the keyless /adapters barrel.

  const { contentAddressOf } = require('@openprose/reactor/adapters') as {
    contentAddressOf: (bytes: Uint8Array) => string;
  };
  const out: Record<string, string> = {};
  for (const c of contracts) {
    const image = [
      `id:${c.id}`,
      `name:${c.name}`,
      `kind:${c.kind}`,
      `requires:${c.requires ?? ''}`,
      `maintains:${c.maintains ?? ''}`,
      `continuity:${c.continuity ?? ''}`,
      `execution:${c.execution ?? ''}`,
      `criteria:${c.criteria ?? ''}`,
    ].join('\n');
    out[c.id] = contentAddressOf(new TextEncoder().encode(image));
  }
  return out;
}

/** Shared per-session options (skill / temperature / maxTurns). */
function sessionOptions(options: CompileRunOptions): Record<string, unknown> {
  const base: Record<string, unknown> = { model: options.model };
  if (options.skill !== undefined) base['skill'] = options.skill;
  if (options.temperature !== undefined) base['temperature'] = options.temperature;
  if (options.maxTurns !== undefined) base['maxTurns'] = options.maxTurns;
  return base;
}

/** The shape of the model-bearing agent-compile barrel we dynamically import. */
interface AgentCompileModule {
  loadContractSet: (dir: string) => readonly LoadedContractLike[];
  compileForme: (
    contracts: readonly LoadedContractLike[],
    fps: Readonly<Record<string, string>>,
    options: Record<string, unknown>,
  ) => Promise<{
    reconcilerTopology: import('@openprose/reactor/internals').ReconcilerTopology;
    forme: { diagnostics?: readonly { kind: string; subscriber?: string }[] };
    cost: { provider: string; model: string; tokens: { fresh: number; reused: number } };
  }>;
  compilePostcondition: (
    node: string,
    contracts: readonly LoadedContractLike[],
    options: Record<string, unknown>,
  ) => Promise<{
    result: { ref: { node: string; mode: 'deterministic' | 'render-attested'; artifactId: string } };
    cost: { tokens: { fresh: number; reused: number } };
  }>;
  runCompileSession: (
    contracts: readonly LoadedContractLike[],
    config: Record<string, unknown>,
  ) => Promise<{
    output: unknown;
    cost: { provider: string; model: string; tokens: { fresh: number; reused: number } };
  }>;
  canonicalizerOutputSchema: () => unknown;
  canonicalizerTask: (node: string) => string;
  toCanonicalizationSpec: (node: string, signal: unknown) => unknown;
  postconditionArtifactId: (node: string, mode: 'deterministic' | 'render-attested') => string;
}

/** The model-bearing barrel specifier (a variable so TS does not statically
 * type-resolve the subpath under `moduleResolution: Node` — runtime resolves it
 * against the built `dist`, exactly as the offline boundary intends: this is
 * reached ONLY via dynamic import inside the compile handler). */
const AGENT_COMPILE_SPECIFIER = '@openprose/reactor/agents';

/**
 * Reduce a thrown error to its single legible first line — dropping the multi-line
 * `Require stack:\n  - …` dump Node appends to a `MODULE_NOT_FOUND` (G21(b)). The
 * good "Cannot find module 'X'" stays; the raw require-stack internals are cut.
 */
export function firstErrorLine(err: unknown): string {
  const message = String((err as Error)?.message ?? err);
  const [first] = message.split('\nRequire stack:');
  return (first ?? message).split('\n')[0]!.trim();
}

/** Dynamic-import the model-bearing agent-compile barrel with a legible failure. */
async function importAgentCompile(): Promise<AgentCompileModule> {
  try {
    const mod = (await import(AGENT_COMPILE_SPECIFIER)) as unknown;
    return mod as AgentCompileModule;
  } catch (err) {
    throw new Error(
      'reactor compile needs the model extras (@openai/agents + zod) — install them ' +
        'with `npm i @openai/agents zod` (use `npm i -g @openai/agents zod` if you ' +
        'installed reactor globally; a global CLI resolves them from the global tree). ' +
        'They are optional peers, required only to ' +
        'compile or render (the keyless paths — `compile --check`, `status`, `topology`, ' +
        '`receipts` — do not need them). Note: REACTOR_OFFLINE=1 only skips the live key ' +
        'check; it does NOT substitute a provider, so it cannot stand in for the extras here.\n' +
        // G21(b): keep only the legible first line of the underlying error (e.g.
        // "Cannot find module '@openai/agents'") — never the multi-line raw
        // `Require stack:` dump Node appends, which leaks install internals.
        `underlying error: ${firstErrorLine(err)}`,
    );
  }
}
