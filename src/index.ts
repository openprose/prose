export { compileFile, compileSource } from "./compiler";
export { buildGraphView, graphFile, graphSource, renderGraphMermaid } from "./graph";
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
  GraphView,
  GraphViewEdge,
  GraphViewNode,
  PortIR,
  ProseIR,
  RuntimeSettingIR,
  ServiceIR,
  SourceSpan,
} from "./types";
