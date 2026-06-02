// @openprose/reactor/run — the OFFLINE BOUNDARY (the run-phase model surface).
//
// `compileProject` / `runProject` deep-import the live agent adapters
// (`@openai/agents` + `zod`). They are kept OFF the keyless front door so a
// keyless inspection/replay build never loads a provider. This module is the
// dynamic-import target for the run phase.
//
// The pure type shapes (RunProjectInput / RunProjectRender / CompiledProject /
// …) live at `@openprose/reactor/run/types`, which carries NO `@openai/agents`
// value import — so a consumer can type a run config without crossing the
// offline boundary.

export {
  compileProject,
  runProject,
} from "../sdk/run-project";

export type {
  CompileProjectInput,
  CompiledProject,
  CompiledProjectNode,
  PerStepCompileOptions,
  RunProjectInput,
  RunProjectRender,
  RunProjectResult,
} from "../sdk/run-project";
