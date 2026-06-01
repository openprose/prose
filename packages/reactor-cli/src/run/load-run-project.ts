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
  CliCompiledProject,
  ContractView,
  ProjectTruthProjection,
} from './run-core';

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
}

/** Input to {@link callRunProject}: the compiled project + substrate + render. */
export interface CallRunProjectInput {
  readonly compiled: CliCompiledProject;
  readonly adapters: RunAdapters;
  readonly directory?: string;
  readonly render: RunRender;
}

/** A structural mirror of an SDK ledger receipt (the fields the CLI reads). */
export interface ReactorReceipt {
  readonly node: string;
  readonly status: string;
  readonly cost: { readonly tokens: { readonly fresh: number; readonly reused: number } };
  readonly input_fingerprints: readonly string[];
  readonly fingerprints: Readonly<Record<string, string>>;
}

/** A structural mirror of the SDK `AssembledReactor` surface the CLI drives. */
export interface AssembledReactorLike {
  readonly dag: unknown;
  readonly ledger: {
    readonly all: () => readonly ReactorReceipt[];
  };
  readonly store: {
    readonly read: (node: string, workspace?: string) => unknown;
    readonly publishedFingerprints: (node: string) => Record<string, string>;
  };
  readonly clock: { readonly now: () => string };
  readonly bootAsync: () => Promise<
    readonly { node: string; disposition: string }[]
  >;
}

/** The result of {@link callRunProject}: the assembled reactor + boot results. */
export interface CallRunProjectResult {
  readonly reactor: AssembledReactorLike;
  readonly bootResults: readonly { node: string; disposition: string }[];
}

/** The model-bearing run-project barrel specifier (a variable so TS does not
 * statically resolve the subpath under Node resolution — runtime resolves it
 * against the built `dist`, exactly as the offline boundary intends: reached
 * ONLY via dynamic import inside the run/serve handler). */
const RUN_PROJECT_SPECIFIER = '@openprose/reactor/run-project';

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
    throw new Error(
      'reactor run/serve needs the model extras (@openai/agents + zod). Install ' +
        'them (`npm i @openai/agents zod`) or run an offline gate with a fake ' +
        'render.\n' +
        `underlying error: ${String((err as Error)?.message ?? err)}`,
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
): Promise<CallRunProjectResult> {
  const { runProject } = await importRunProject();
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

  return runProject({
    compiled: input.compiled,
    adapters: input.adapters,
    ...(input.directory !== undefined ? { directory: input.directory } : {}),
    render: renderConfig,
  });
}
