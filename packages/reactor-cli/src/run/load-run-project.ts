/**
 * The MODEL-BEARING run-phase loader — the dynamic-import seam onto the SDK's
 * `runProject`.
 *
 * N2 OFFLINE BOUNDARY: this module deep-imports `@openprose/reactor/run-project`,
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

/** The substrate the run/serve path injects (clock + storage + world-model). */
export type RunAdapters = RunProjectInput['adapters'];

/** The render wiring handed to `runProject` (the SDK `RunProjectRender`). */
export type RunRender = RunProjectRender;

/** Input to {@link callRunProject}: the compiled project + substrate + render. */
export interface CallRunProjectInput {
  readonly compiled: CliCompiledProject;
  readonly adapters: RunAdapters;
  readonly directory?: string;
  readonly render: RunRender;
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
type RunProjectFn = (
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

  // `input.render` IS the SDK `RunProjectRender` (no `Record<string, unknown>`
  // rebuild, no per-field copy): hand it through VERBATIM. Phase 5's `sandbox` /
  // `shellTimeoutMs` and the curated `provider`/`model`/`temperature`/`seed`/
  // `maxTurns` ride along as plain typed fields of that one shape.
  return runProject({
    compiled: input.compiled,
    adapters: input.adapters,
    ...(input.directory !== undefined ? { directory: input.directory } : {}),
    render: input.render,
  });
}
