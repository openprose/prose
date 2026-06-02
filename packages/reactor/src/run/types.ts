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
  PerStepCompileOptions,
  RunProjectInput,
  RunProjectRender,
  RunProjectResult,
} from "../sdk/run-project";
