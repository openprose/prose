export type ComponentKind = "program" | "service" | "composite" | "test";

export interface SourceSpan {
  path: string;
  start_line: number;
  end_line: number;
}

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  source_span?: SourceSpan;
}

export interface PortIR {
  name: string;
  direction: "input" | "output";
  type: string;
  description: string;
  required: boolean;
  policy_labels: string[];
  source_span: SourceSpan;
}

export interface ServiceIR {
  name: string;
  ref: string;
  compose: string | null;
  with: Record<string, string | number | boolean>;
  source_span: SourceSpan;
}

export interface EnvironmentIR {
  name: string;
  description: string;
  required: boolean;
  source_span: SourceSpan;
}

export interface EffectIR {
  kind: string;
  description: string;
  config: Record<string, string | number | boolean>;
  source_span: SourceSpan;
}

export interface AccessIR {
  rules: Record<string, string[]>;
  source_span?: SourceSpan;
}

export interface ExecutionIR {
  language: "prose";
  body: string;
  source_span: SourceSpan;
}

export interface ComponentIR {
  id: string;
  name: string;
  kind: ComponentKind;
  source: {
    path: string;
    span: SourceSpan;
  };
  ports: {
    requires: PortIR[];
    ensures: PortIR[];
  };
  services: ServiceIR[];
  schemas: unknown[];
  environment: EnvironmentIR[];
  execution: ExecutionIR | null;
  effects: EffectIR[];
  access: AccessIR;
  evals: unknown[];
  expansions: unknown[];
}

export interface GraphNodeIR {
  id: string;
  component: string;
  kind: ComponentKind;
  source_span: SourceSpan;
}

export interface GraphEdgeEndpointIR {
  component: string;
  port: string;
}

export interface GraphEdgeIR {
  from: GraphEdgeEndpointIR;
  to: GraphEdgeEndpointIR;
  kind: "exact" | "semantic" | "pinned" | "execution" | "caller" | "return";
  confidence: number;
  reason: string;
  source: "auto" | "wiring" | "execution";
}

export interface GraphIR {
  nodes: GraphNodeIR[];
  edges: GraphEdgeIR[];
}

export interface ProseIR {
  ir_version: "0.1";
  semantic_hash: string;
  package: {
    name: string;
    source_ref: string;
    source_sha: string;
  };
  components: ComponentIR[];
  graph: GraphIR;
  diagnostics: Diagnostic[];
}

