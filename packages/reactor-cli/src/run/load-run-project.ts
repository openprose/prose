/**
 * The MODEL-BEARING run-phase loader — the dynamic-import seam onto the SDK's
 * `runProject`.
 *
 * N2 OFFLINE BOUNDARY: this module deep-imports `@openprose/reactor/run`,
 * which carries `@openai/agents` + `zod`. It is therefore reached ONLY via a
 * dynamic `import()` from the `run`/`serve` command handlers, never at the
 * offline entrypoint's load scope. The OFFLINE gate hands a fake `buildRender`
 * so no provider is ever constructed; a LIVE run leaves `buildRender` unset and
 * the SDK's `createAgentRender` (lazy provider) serves the render.
 *
 * The CLI CONFIGURES `runProject` (hands it the re-lowered compiled project +
 * `projectTruthFor` + `contractFor` + the render seam) and never re-implements
 * the mount loop (Correction #3 / N3).
 */

import type {
  Reactor,
  RunProjectInput,
  RunProjectRender,
  RunProjectResult,
} from '@openprose/reactor/run/types';

import type { CliCompiledProject } from './run-core';
import type { ModelConfig } from '../config';

// The typed SDK running handle (`@openprose/reactor/run/types`, a TYPE-ONLY entry
// that never crosses the offline boundary). The CLI drives THIS — its async-by-
// default verbs (`ingest`/`tick`/`drain`/`boot`), its first-class `store`/`ledger`/
// `clock` accessors, and `scheduler(...)` — so the pre-`0.3.0` `AssembledReactorLike`
// structural mirror + the `(reactor as { dag }).dag` / `as unknown as { store }`
// drive casts are GONE.
export type ReactorHandle = Reactor;

// The run/serve substrate + render wiring are the SDK's OWN run-phase shapes,
// imported TYPE-ONLY from `@openprose/reactor/run/types` (no `@openai/agents`
// value import crosses the offline boundary). The pre-`0.3.0` `RunAdapters` /
// `RunRender` structural mirrors are GONE — the CLI now configures `runProject`
// against its real `RunProjectInput['adapters']` / `RunProjectRender` types, so
// a field the SDK adds (or renames) is a CLI compile error, not a silent drift.

/**
 * The substrate the run/serve path injects (clock + storage + world-model +
 * optional ledger). The blessed durable form is the SDK's `Substrate`
 * (`buildDurableSubstrate` → `fileSystemSubstrate`); the test seam injects a
 * partial `{ clock, storage, worldModel }`. `NonNullable` strips the `| undefined`
 * the SDK's now-optional `adapters` field carries (the SDK accepts EITHER
 * `substrate` or `adapters`).
 */
export type RunAdapters = NonNullable<RunProjectInput['adapters']>;

/** The render wiring handed to `runProject` (the SDK `RunProjectRender`). */
export type RunRender = RunProjectRender;

/** Input to {@link callRunProject}: the compiled project + substrate + render. */
export interface CallRunProjectInput {
  readonly compiled: CliCompiledProject;
  readonly adapters: RunAdapters;
  readonly directory?: string;
  readonly render: RunRender;
  /**
   * The keyless provider plan for a CUSTOM (non-default) provider. When present
   * (with {@link apiKey}), {@link callRunProject} builds a scoped live
   * `ModelProvider` behind the dynamic-import boundary and sets it as
   * `render.provider`, so the run-phase renders hit the configured
   * OpenAI/Anthropic/Google/custom endpoint. Omitted on the default OpenRouter
   * path (the SDK builds its scoped provider lazily) and the offline gate.
   */
  readonly providerPlan?: import('../model/provider-plan').ProviderPlan;
  /** The resolved API key for {@link providerPlan}. Required when it is set. */
  readonly apiKey?: string;
  /**
   * The configured render model id. Threaded into the render so the run phase uses
   * `model.render_model` (NOT the SDK's gemini default) — required for a custom
   * provider, whose endpoint would 404 on the default model id.
   */
  readonly renderModel?: string;
  /**
   * The configured decoding temperature (`model.temperature`). Threaded into the
   * render so run/serve honor `reactor.yml` exactly like compile does. Unset →
   * the render omits the key (the provider's default; required by reasoning
   * models, which reject explicit values).
   */
  readonly renderTemperature?: number;
  /**
   * The configured reasoning effort (`model.reasoning_effort`), passed verbatim.
   * Unset → omitted.
   */
  readonly renderReasoningEffort?: string;
  /** The provider label for the receipt cost (set with a custom provider). */
  readonly providerLabel?: string;
}

/**
 * The configured decoding knobs (`model.temperature` / `model.reasoning_effort`)
 * as optional {@link CallRunProjectInput} fields. Absent stays absent — the
 * render then omits the keys from the model request entirely, which reasoning
 * models require. Shared by `run`, `serve`, and the multi-reactor host so the
 * threading can never drift between entry points.
 */
export function renderDecodingInputs(model: ModelConfig): {
  renderTemperature?: number;
  renderReasoningEffort?: string;
} {
  return {
    ...(model.temperature !== undefined
      ? { renderTemperature: model.temperature }
      : {}),
    ...(model.reasoning_effort !== undefined
      ? { renderReasoningEffort: model.reasoning_effort }
      : {}),
  };
}

/**
 * The SDK running handle the CLI drives — the typed {@link Reactor} from
 * `@openprose/reactor/run/types` (re-exported above as {@link ReactorHandle}).
 *
 * @deprecated Prefer {@link ReactorHandle} (= the SDK `Reactor`). This alias keeps
 * the old name compiling; it is no longer a structural MIRROR — it IS the SDK
 * type, so the `(reactor as { dag }).dag` / `as unknown as { store }` drive casts
 * that the mirror forced are deleted at the call sites.
 */
export type AssembledReactorLike = ReactorHandle;

/**
 * The result of {@link callRunProject}: the typed reactor handle + boot results
 * — the SDK's own `RunProjectResult` (`@openprose/reactor/run/types`). The
 * pre-`0.3.0` structural mirror (`{ reactor; bootResults: { node; disposition }[] }`)
 * is GONE: `bootResults` is the SDK `ReconcileResult[]`, `reactor` the typed
 * {@link Reactor} handle.
 */
export type CallRunProjectResult = RunProjectResult;

/** The model-bearing run-project barrel specifier (a variable so TS does not
 * statically resolve the subpath under Node resolution — runtime resolves it
 * against the built `dist`, exactly as the offline boundary intends: reached
 * ONLY via dynamic import inside the run/serve handler). */
const RUN_PROJECT_SPECIFIER = '@openprose/reactor/run';

/**
 * The model-bearing `runProject` we dynamically import, typed against the SDK's
 * own `RunProjectInput`/`RunProjectResult` (`@openprose/reactor/run/types`). The
 * lone widening below is `compiled`: the keyless cache stores a deliberately
 * COARSENED project ({@link CliCompiledProject}) — no rich `ContractSet`,
 * coarsened `postconditions`, un-branded fingerprints — which `runProject`
 * accepts structurally but cannot be the strict SDK `CompiledProject`. Everything
 * else (`adapters`/`render`/the result) is the real SDK type, so the
 * `Record<string, unknown>` render rebuild + the `(input: unknown)` cast are gone.
 */
export type RunProjectFn = (
  input: Omit<RunProjectInput, 'compiled'> & { readonly compiled: CliCompiledProject },
) => Promise<RunProjectResult>;

/** The shape of the model-bearing run-project barrel we dynamically import. */
interface RunProjectModule {
  runProject: RunProjectFn;
}

/** Dynamic-import the model-bearing run-project barrel with a legible failure. */
async function importRunProject(): Promise<RunProjectModule> {
  try {
    const mod = (await import(RUN_PROJECT_SPECIFIER)) as RunProjectModule;
    return mod;
  } catch (err) {
    // G21(b): keep only the legible first line of the underlying error — never the
    // multi-line raw `Require stack:` dump Node appends to a MODULE_NOT_FOUND.
    const message = String((err as Error)?.message ?? err);
    const firstLine = (message.split('\nRequire stack:')[0] ?? message)
      .split('\n')[0]!
      .trim();
    throw new Error(
      'reactor run/serve needs the model extras (@openai/agents + zod). Install ' +
        'them (`npm i @openai/agents zod`) or run an offline gate with a fake ' +
        'render.\n' +
        `underlying error: ${firstLine}`,
    );
  }
}

/**
 * CONFIGURE + call the SDK's `runProject` (the dumb run phase). Dynamic-imports
 * the model-bearing barrel, hands it the re-lowered compiled project + the run
 * substrate + the render wiring, and returns the assembled reactor + boot
 * results. NEVER hand-mounts (N3): `runProject` self-mounts via
 * `compiledStoreCanonicalizer` + `createReactor` + `bootAsync`.
 */
export async function callRunProject(
  input: CallRunProjectInput,
  /**
   * Test seam (OFFLINE gate): inject the `runProject` implementation so a test can
   * CAPTURE the exact render config the CLI hands it (e.g. prove Phase 5's
   * `sandbox`/`shellTimeoutMs` flow through) WITHOUT the dynamic import + a real
   * provider. Defaults to the dynamically-imported model-bearing barrel.
   */
  runProjectImpl?: RunProjectFn,
): Promise<CallRunProjectResult> {
  const runProject =
    runProjectImpl ?? (await importRunProject()).runProject;

  // CUSTOM provider: build the scoped live `ModelProvider` HERE — past the dynamic-
  // import boundary — and set it as the render's first-class `provider`, so the
  // run-phase renders hit the configured endpoint. The offline gate / default
  // OpenRouter path leave `providerPlan` unset and the render is byte-for-byte what
  // it was (a test `buildRender`, or the SDK's lazy scoped OpenRouter provider).
  let render = input.render;
  // Thread the configured render model into the NESTED `render: RenderOptions` so
  // the run phase uses `model.render_model` rather than the SDK's gemini default.
  // This is REQUIRED for a custom provider (whose endpoint 404s on the default id)
  // and simply honors the config for the default provider.
  if (input.renderModel !== undefined) {
    render = { ...render, render: { ...(render.render ?? {}), model: input.renderModel } };
  }
  // Thread the configured decoding knobs the same way: `reactor.yml`'s
  // `temperature`/`reasoning_effort` must govern run/serve renders, not only
  // compile. Absent stays absent so the render omits the keys.
  if (input.renderTemperature !== undefined || input.renderReasoningEffort !== undefined) {
    render = {
      ...render,
      render: {
        ...(render.render ?? {}),
        ...(input.renderTemperature !== undefined
          ? { temperature: input.renderTemperature }
          : {}),
        ...(input.renderReasoningEffort !== undefined
          ? { reasoningEffort: input.renderReasoningEffort }
          : {}),
      },
    };
  }
  if (input.providerPlan !== undefined && input.apiKey !== undefined) {
    const { buildLiveProvider } = await import('../model/live-provider');
    // The `@openai/agents` escape hatch (incl. `provider`) lives in the NESTED
    // `render: RenderOptions` field of `RunProjectRender`, not at the top level
    // (top level is contractFor/projectTruthFor/sandbox/shellTimeoutMs). Merge into
    // it so the live `createAgentRender` receives the scoped provider. The provider
    // LABEL is a top-level cost-only field.
    render = {
      ...render,
      render: {
        ...(render.render ?? {}),
        provider: buildLiveProvider(input.providerPlan, input.apiKey),
      },
      ...(input.providerLabel !== undefined
        ? { providerLabel: input.providerLabel }
        : {}),
    };
  }

  // `input.render` IS the SDK `RunProjectRender` (no `Record<string, unknown>`
  // rebuild, no per-field copy): hand it through VERBATIM. Phase 5's `sandbox` /
  // `shellTimeoutMs` ride along as plain typed fields of that one shape; the model
  // + the full `@openai/agents` escape hatch (`provider`/`model`/`temperature`/
  // `seed`/`maxTurns`/…) live in its nested `render: RenderOptions`.
  return runProject({
    compiled: input.compiled,
    adapters: input.adapters,
    ...(input.directory !== undefined ? { directory: input.directory } : {}),
    render,
  });
}
