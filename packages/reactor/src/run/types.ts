// @openprose/reactor/run/types — the type-only run-phase shapes.
//
// This entry is TYPE-ONLY and carries NO `@openai/agents` value import: a
// consumer can describe a run/compile configuration (RunProjectInput,
// RunProjectRender, CompiledProject, …) without crossing the offline boundary
// (`/run`, which dynamic-imports the live agent adapters). It exists to kill the
// CLI's hand-mirrored structural copies of these shapes.

export type {
  CompileProjectInput,
  CompiledProject,
  CompiledProjectNode,
  NodeStepCompileOptions,
  PerStepCompileOptions,
  RunProjectInput,
  RunProjectRender,
  RunProjectResult,
  RunCommitGateOptions,
  FactsProjection,
} from "../sdk/run-project";

// The typed `Reactor` handle is `RunProjectResult.reactor`. Re-exported here as a
// TYPE-ONLY name so a consumer (e.g. the reference CLI) can type the running
// handle it drives WITHOUT crossing the offline boundary — killing the CLI's
// hand-mirrored `AssembledReactorLike` structural copy and its drive casts.
export type {
  Reactor,
  SyncDriveSurface,
  IngestInput,
} from "../sdk/reactor-handle";

// EXPERIMENT A: the budget option (`RunProjectInput.budget`) + the handle's
// accessor shape — TYPE-ONLY, so describing a budgeted run configuration never
// crosses the offline boundary.
export type {
  ReactorBudget,
  ReactorBudgetOption,
} from "../cost/budget";
