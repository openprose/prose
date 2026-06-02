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

import type { Reactor } from '@openprose/reactor/run/types';

import type {
  CliCompiledProject,
  ContractView,
  ProjectTruthProjection,
} from './run-core';
import type { SandboxRunner } from './sandbox';

// The typed SDK running handle (`@openprose/reactor/run/types`, a TYPE-ONLY entry
// that never crosses the offline boundary). The CLI drives THIS — its async-by-
// default verbs (`ingest`/`tick`/`drain`/`boot`), its first-class `store`/`ledger`/
// `clock` accessors, and `scheduler(...)` — so the pre-`0.3.0` `AssembledReactorLike`
// structural mirror + the `(reactor as { dag }).dag` / `as unknown as { store }`
// drive casts are GONE.
export type ReactorHandle = Reactor;

/** The substrate the run/serve path injects (clock + storage + world-model). */
export interface RunAdapters {
  readonly clock: unknown;
  readonly storage: unknown;
  readonly worldModel?: unknown;
}

/** The render wiring handed to `runProject` (structural mirror of RunProjectRender). */
export interface RunRender {
  readonly contractFor?: (node: string) => ContractView;
  readonly projectTruthFor?: (node: string) => ProjectTruthProjection;
  /** The OFFLINE fake-render seam: (store) => AsyncMountedRender. */
  readonly buildRender?: (store: unknown) => unknown;
  /** The LIVE render provider (omitted offline). */
  readonly provider?: unknown;
  readonly model?: string;
  readonly skill?: string;
  readonly temperature?: number;
  readonly seed?: number;
  readonly maxTurns?: number;
  /**
   * Phase 5 — the constructed render sandbox runner (structural mirror of the
   * SDK's `RenderSandboxRunner`). When set, it reaches `createAgentRender`'s
   * `sandbox` (via Change C's `RunProjectRender.sandbox`) so the render's
   * `sandbox_exec` runs inside the workspace-scoped container. Unset → the render
   * has no sandbox (`sandbox_exec` declines), the locked `mode: none` default.
   */
  readonly sandbox?: SandboxRunner;
  /**
   * Phase 5 — the per-command `shell_exec` timeout (ms) from `[sandbox]
   * .shell_timeout_ms`, threaded onto Change C's `RunProjectRender.shellTimeoutMs`
   * so the cwd-rooted LocalShell honors the configured bound. Unset → the SDK's
   * 300_000 ms default.
   */
  readonly shellTimeoutMs?: number;
}

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

/** The result of {@link callRunProject}: the typed reactor handle + boot results. */
export interface CallRunProjectResult {
  readonly reactor: ReactorHandle;
  readonly bootResults: readonly { node: string; disposition: string }[];
}

/** The model-bearing run-project barrel specifier (a variable so TS does not
 * statically resolve the subpath under Node resolution — runtime resolves it
 * against the built `dist`, exactly as the offline boundary intends: reached
 * ONLY via dynamic import inside the run/serve handler). */
const RUN_PROJECT_SPECIFIER = '@openprose/reactor/run';

/** The shape of the model-bearing run-project barrel we dynamically import. */
interface RunProjectModule {
  runProject: (input: unknown) => Promise<CallRunProjectResult>;
}

/** Dynamic-import the model-bearing run-project barrel with a legible failure. */
async function importRunProject(): Promise<RunProjectModule> {
  try {
    const mod = (await import(RUN_PROJECT_SPECIFIER)) as unknown;
    return mod as RunProjectModule;
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
  runProjectImpl?: (input: unknown) => Promise<CallRunProjectResult>,
): Promise<CallRunProjectResult> {
  const runProject =
    runProjectImpl ?? (await importRunProject()).runProject;
  const renderConfig: Record<string, unknown> = {};
  if (input.render.contractFor !== undefined)
    renderConfig['contractFor'] = input.render.contractFor;
  if (input.render.projectTruthFor !== undefined)
    renderConfig['projectTruthFor'] = input.render.projectTruthFor;
  if (input.render.buildRender !== undefined)
    renderConfig['buildRender'] = input.render.buildRender;
  if (input.render.provider !== undefined)
    renderConfig['provider'] = input.render.provider;
  if (input.render.model !== undefined) renderConfig['model'] = input.render.model;
  if (input.render.skill !== undefined) renderConfig['skill'] = input.render.skill;
  if (input.render.temperature !== undefined)
    renderConfig['temperature'] = input.render.temperature;
  if (input.render.seed !== undefined) renderConfig['seed'] = input.render.seed;
  if (input.render.maxTurns !== undefined)
    renderConfig['maxTurns'] = input.render.maxTurns;
  // Phase 5: thread the constructed sandbox runner + the per-command shell
  // timeout onto Change C's `RunProjectRender.sandbox` / `.shellTimeoutMs`.
  if (input.render.sandbox !== undefined)
    renderConfig['sandbox'] = input.render.sandbox;
  if (input.render.shellTimeoutMs !== undefined)
    renderConfig['shellTimeoutMs'] = input.render.shellTimeoutMs;

  return runProject({
    compiled: input.compiled,
    adapters: input.adapters,
    ...(input.directory !== undefined ? { directory: input.directory } : {}),
    render: renderConfig,
  });
}
