import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  GraphVmKind,
  NodeRunResult,
  NodeTelemetryEvent,
} from "../node-runners/index.js";
import type {
  ExecutionPlan,
  ProseIR,
  RunRecord,
  RuntimeProfile,
  TraceEvent,
} from "../types.js";
import type { EffectApprovalRecord } from "../policy/index.js";

export interface RuntimeTraceContext {
  ir: ProseIR;
  plan: ExecutionPlan;
  nodeRunner: { kind: GraphVmKind };
  runtimeProfile: RuntimeProfile;
  runId: string;
  runDir: string;
  createdAt: string;
  approvalRecords?: EffectApprovalRecord[];
}

export async function writeBlockedTrace(
  ctx: RuntimeTraceContext,
  runId: string,
  reasons: string[],
): Promise<void> {
  await writeFile(
    join(ctx.runDir, "trace.json"),
    `${JSON.stringify([
      {
        event: "run.blocked",
        at: ctx.createdAt,
        run_id: runId,
        graph_vm: ctx.nodeRunner.kind,
        runtime_profile: ctx.runtimeProfile,
        failure_class: "pre_session_gate",
        gate: gateKind(reasons),
        reasons,
        approval_records: approvalTraceRecords(ctx),
      },
    ], null, 2)}\n`,
  );
}

export async function writeNodeTrace(
  ctx: RuntimeTraceContext,
  result: NodeRunResult,
  record: RunRecord,
): Promise<void> {
  const events = [
    {
      event: "run.started",
      run_id: ctx.runId,
      graph_vm: ctx.nodeRunner.kind,
      runtime_profile: record.runtime.profile,
      at: ctx.createdAt,
      ir_hash: ctx.ir.semantic_hash,
      approval_records: approvalTraceRecords(ctx),
    },
    ...nodeRunTraceEvents(result, record),
    {
      event: "node_run.finished",
      run_id: ctx.runId,
      graph_vm: ctx.nodeRunner.kind,
      runtime_profile: record.runtime.profile,
      status: result.status,
      diagnostics: result.diagnostics,
      ...(result.declared_error ? { declared_error: result.declared_error } : {}),
      ...(result.finally_evidence ? { finally_evidence: result.finally_evidence } : {}),
      duration_ms: result.duration_ms,
      at: record.completed_at,
    },
  ];
  await writeFile(join(ctx.runDir, "trace.json"), `${JSON.stringify(events, null, 2)}\n`);
}

export async function writeGraphTrace(
  ctx: RuntimeTraceContext,
  record: RunRecord,
  nodeRecords: RunRecord[],
  nodeRunResultsByRunId: Map<string, NodeRunResult> = new Map(),
): Promise<void> {
  const events = [
    {
      event: "graph.started",
      run_id: ctx.runId,
      graph_vm: ctx.nodeRunner.kind,
      runtime_profile: record.runtime.profile,
      at: ctx.createdAt,
      ir_hash: ctx.ir.semantic_hash,
      planned_nodes: ctx.plan.materialization_set.nodes,
      approval_records: approvalTraceRecords(ctx),
      skipped_nodes: ctx.plan.nodes
        .filter((node) => node.status === "skipped")
        .map((node) => node.component_ref),
    },
    ...nodeRecords.flatMap((node) => nodeTraceEvents(ctx, node, nodeRunResultsByRunId)),
    {
      event: "graph.finished",
      run_id: ctx.runId,
      status: record.status,
      acceptance: record.acceptance.status,
      at: record.completed_at,
    },
  ];
  await writeFile(join(ctx.runDir, "trace.json"), `${JSON.stringify(events, null, 2)}\n`);
}

function approvalTraceRecords(ctx: RuntimeTraceContext) {
  return (ctx.approvalRecords ?? []).map((record) => ({
    approval_id: record.approval_id,
    status: record.status,
    effects: record.effects,
    principal_id: record.principal_id,
    component_ref: record.component_ref,
    expires_at: record.expires_at,
  }));
}

function nodeTraceEvents(
  ctx: RuntimeTraceContext,
  node: RunRecord,
  nodeRunResultsByRunId: Map<string, NodeRunResult>,
): TraceEvent[] {
  const nodeRunResult = nodeRunResultsByRunId.get(node.run_id);
  return [
    {
      event: "node.started",
      run_id: node.run_id,
      graph_run_id: ctx.runId,
      component_ref: node.component_ref,
      at: node.created_at,
    },
    ...(nodeRunResult
      ? nodeRunTraceEvents(nodeRunResult, node, {
          graph_run_id: ctx.runId,
          component_ref: node.component_ref,
        })
      : []),
    ...(node.status === "blocked"
      ? [
          {
            event: "node.blocked",
            run_id: node.run_id,
            graph_run_id: ctx.runId,
            component_ref: node.component_ref,
            at: node.completed_at ?? node.created_at,
            failure_class: "pre_session_gate",
            gate: gateKind([node.acceptance.reason ?? ""]),
            reason: node.acceptance.reason,
          },
        ]
      : []),
    {
      event: "node.finished",
      run_id: node.run_id,
      graph_run_id: ctx.runId,
      component_ref: node.component_ref,
      status: node.status,
      acceptance: node.acceptance.status,
      at: node.completed_at ?? node.created_at,
    },
  ];
}

function nodeRunTraceEvents(
  result: NodeRunResult,
  record: RunRecord,
  extra: Record<string, unknown> = {},
): TraceEvent[] {
  const events: TraceEvent[] = [];
  if (result.session) {
    events.push({
      event: "node_session.started",
      run_id: record.run_id,
      at: record.created_at,
      graph_vm: result.session.graph_vm,
      session_id: result.session.session_id,
      session_file: result.session.metadata.session_file ?? null,
      model_provider: result.session.metadata.model_provider ?? null,
      model: result.session.metadata.model_id ?? null,
      metadata: result.session.metadata,
      ...extra,
    });
  }

  if (result.private_state) {
    events.push({
      event: "node_private_state.available",
      run_id: record.run_id,
      at: record.created_at,
      manifest_ref: result.private_state.manifest_ref,
      subagents_root_ref: result.private_state.subagents_root_ref,
      visibility: "node_private",
      retained_by_default: true,
      ...extra,
    });
  }

  events.push(
    ...(result.telemetry ?? []).map((event) =>
      nodeTelemetryTraceEvent(event, record, extra),
    ),
  );

  if (result.cost) {
    events.push({
      event: "node_run.cost",
      run_id: record.run_id,
      at: record.completed_at ?? record.created_at,
      graph_vm: result.session?.graph_vm ?? "unknown",
      currency: result.cost.currency,
      amount: result.cost.amount,
      items: result.cost.items,
      ...extra,
    });
  }

  if (result.status !== "succeeded") {
    events.push({
      event: "node_run.failure",
      run_id: record.run_id,
      at: record.completed_at ?? record.created_at,
      graph_vm: result.session?.graph_vm ?? "unknown",
      failure_class: failureClass(result),
      diagnostic_codes: result.diagnostics.map((diagnostic) => diagnostic.code).sort(),
      ...(result.declared_error ? { declared_error: result.declared_error } : {}),
      ...(result.finally_evidence ? { finally_evidence: result.finally_evidence } : {}),
      ...extra,
    });
  }

  return events;
}

function nodeTelemetryTraceEvent(
  event: NodeTelemetryEvent,
  record: RunRecord,
  extra: Record<string, unknown>,
): TraceEvent {
  return {
    ...event,
    run_id: record.run_id,
    at: event.at ?? record.created_at,
    ...extra,
  };
}

function failureClass(result: NodeRunResult): string {
  const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
  if (codes.some((code) => code.includes("timeout"))) {
    return "timeout";
  }
  if (codes.some((code) => code.includes("model_error"))) {
    return "model_error";
  }
  if (result.declared_error || codes.some((code) => code === "openprose_declared_error")) {
    return "declared_error";
  }
  if (codes.some((code) => code.includes("output_submission"))) {
    return "output_submission";
  }
  if (codes.some((code) => code.includes("output"))) {
    return "output_contract";
  }
  return result.status === "blocked" ? "blocked" : "node_runner_error";
}

function gateKind(reasons: string[]): string {
  const text = reasons.join(" ").toLowerCase();
  if (text.includes("effect") || text.includes("approval") || text.includes("gate")) {
    return "effect_approval";
  }
  if (text.includes("input")) {
    return "input";
  }
  if (text.includes("upstream")) {
    return "upstream";
  }
  return "pre_session";
}
