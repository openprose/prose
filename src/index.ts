export { compileFile, compileSource } from "./compiler";
export { materializeFile, materializeSource } from "./materialize";
export { projectManifest } from "./manifest";
export { planFile, planSource } from "./plan";
export type {
  AccessIR,
  ComponentIR,
  Diagnostic,
  EffectIR,
  EnvironmentIR,
  ExecutionIR,
  GraphEdgeIR,
  GraphIR,
  GraphNodeIR,
  PortIR,
  ProseIR,
  RuntimeSettingIR,
  ServiceIR,
  SourceSpan,
} from "./types";
