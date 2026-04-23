export { compileFile, compileSource } from "./compiler";
export { formatFile, formatSource } from "./format";
export { buildGraphView, graphFile, graphSource, renderGraphMermaid } from "./graph";
export { lintFile, lintSource, renderLintText } from "./lint";
export { materializeFile, materializeSource } from "./materialize";
export { projectManifest } from "./manifest";
export { planFile, planSource } from "./plan";
export { renderTraceText, traceFile } from "./trace";
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
  TraceEvent,
  TraceNodeView,
  TraceView,
} from "./types";
