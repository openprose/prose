import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ProviderKind,
  ProviderResult,
  ProviderTelemetryEvent,
} from "../providers/index.js";
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
  provider: { kind: ProviderKind };
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
        provider: ctx.provider.kind,
        runtime_profile: ctx.runtimeProfile,
        failure_class: "pre_session_gate",
        gate: gateKind(reasons),
        reasons,
        approval_records: approvalTraceRecords(ctx),
      },
    ], null, 2)}\n`,
  );
}

export async function writeProviderTrace(
  ctx: RuntimeTraceContext,
  result: ProviderResult,
  record: RunRecord,
): Promise<void> {
  const events = [
    {
      event: "run.started",
      run_id: ctx.runId,
      provider: ctx.provider.kind,
      runtime_profile: ctx.runtimeProfile,
      at: ctx.createdAt,
      ir_hash: ctx.ir.semantic_hash,
      approval_records: approvalTraceRecords(ctx),
    },
    ...providerTraceEvents(result, record),
    {
      event: "provider.finished",
      run_id: ctx.runId,
      provider: ctx.provider.kind,
      runtime_profile: ctx.runtimeProfile,
      status: result.status,
      diagnostics: result.diagnostics,
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
  providerResultsByRunId: Map<string, ProviderResult> = new Map(),
): Promise<void> {
  const events = [
    {
      event: "graph.started",
      run_id: ctx.runId,
      provider: ctx.provider.kind,
      runtime_profile: ctx.runtimeProfile,
      at: ctx.createdAt,
      ir_hash: ctx.ir.semantic_hash,
      planned_nodes: ctx.plan.materialization_set.nodes,
      approval_records: approvalTraceRecords(ctx),
      skipped_nodes: ctx.plan.nodes
        .filter((node) => node.status === "skipped")
        .map((node) => node.component_ref),
    },
    ...nodeRecords.flatMap((node) => nodeTraceEvents(ctx, node, providerResultsByRunId)),
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
  providerResultsByRunId: Map<string, ProviderResult>,
): TraceEvent[] {
  const providerResult = providerResultsByRunId.get(node.run_id);
  return [
    {
      event: "node.started",
      run_id: node.run_id,
      graph_run_id: ctx.runId,
      component_ref: node.component_ref,
      at: node.created_at,
    },
    ...(providerResult
      ? providerTraceEvents(providerResult, node, {
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

function providerTraceEvents(
  result: ProviderResult,
  record: RunRecord,
  extra: Record<string, unknown> = {},
): TraceEvent[] {
  const events: TraceEvent[] = [];
  if (result.session) {
    events.push({
      event: "provider.session",
      run_id: record.run_id,
      at: record.created_at,
      provider: result.session.provider,
      session_id: result.session.session_id,
      session_file: result.session.metadata.session_file ?? null,
      model_provider: result.session.metadata.model_provider ?? null,
      model: result.session.metadata.model_id ?? null,
      metadata: result.session.metadata,
      ...extra,
    });
  }

  events.push(
    ...(result.telemetry ?? []).map((event) =>
      providerTelemetryTraceEvent(event, record, extra),
    ),
  );

  if (result.cost) {
    events.push({
      event: "provider.cost",
      run_id: record.run_id,
      at: record.completed_at ?? record.created_at,
      provider: result.session?.provider ?? "unknown",
      currency: result.cost.currency,
      amount: result.cost.amount,
      items: result.cost.items,
      ...extra,
    });
  }

  if (result.status !== "succeeded") {
    events.push({
      event: "provider.failure",
      run_id: record.run_id,
      at: record.completed_at ?? record.created_at,
      provider: result.session?.provider ?? "unknown",
      failure_class: failureClass(result),
      diagnostic_codes: result.diagnostics.map((diagnostic) => diagnostic.code).sort(),
      ...extra,
    });
  }

  return events;
}

function providerTelemetryTraceEvent(
  event: ProviderTelemetryEvent,
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

function failureClass(result: ProviderResult): string {
  const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
  if (codes.some((code) => code.includes("timeout"))) {
    return "timeout";
  }
  if (codes.some((code) => code.includes("model_error"))) {
    return "model_error";
  }
  if (codes.some((code) => code.includes("output_submission"))) {
    return "output_submission";
  }
  if (codes.some((code) => code.includes("output"))) {
    return "output_contract";
  }
  return result.status === "blocked" ? "blocked" : "provider_error";
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
