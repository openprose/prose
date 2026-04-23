export { compileFile, compileSource } from "./compiler";
export { formatFile, formatPath, formatSource, renderFormatCheckText } from "./format";
export { collectSourceFiles } from "./files";
export { buildGraphView, graphFile, graphSource, renderGraphMermaid } from "./graph";
export { highlightFile, highlightSource, renderHighlightText } from "./highlight";
export { lintFile, lintPath, lintSource, renderLintReportText, renderLintText } from "./lint";
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
  HighlightToken,
  HighlightView,
  PortIR,
  ProseIR,
  RuntimeSettingIR,
  ServiceIR,
  SourceSpan,
  TraceEvent,
  TraceNodeView,
  TraceView,
} from "./types";
