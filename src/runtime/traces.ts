import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProviderKind, ProviderResult } from "../providers/index.js";
import type { ExecutionPlan, ProseIR, RunRecord } from "../types.js";

export interface RuntimeTraceContext {
  ir: ProseIR;
  plan: ExecutionPlan;
  provider: { kind: ProviderKind };
  runId: string;
  runDir: string;
  createdAt: string;
}

export async function writeBlockedTrace(
  ctx: RuntimeTraceContext,
  runId: string,
  reasons: string[],
): Promise<void> {
  await writeFile(
    join(ctx.runDir, "trace.json"),
    `${JSON.stringify([{ event: "run.blocked", run_id: runId, reasons }], null, 2)}\n`,
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
      at: ctx.createdAt,
      ir_hash: ctx.ir.semantic_hash,
    },
    {
      event: "provider.finished",
      run_id: ctx.runId,
      provider: ctx.provider.kind,
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
): Promise<void> {
  const events = [
    {
      event: "graph.started",
      run_id: ctx.runId,
      provider: ctx.provider.kind,
      at: ctx.createdAt,
      ir_hash: ctx.ir.semantic_hash,
      planned_nodes: ctx.plan.materialization_set.nodes,
      skipped_nodes: ctx.plan.nodes
        .filter((node) => node.status === "skipped")
        .map((node) => node.component_ref),
    },
    ...nodeRecords.map((node) => ({
      event: "node.finished",
      run_id: node.run_id,
      graph_run_id: ctx.runId,
      component_ref: node.component_ref,
      status: node.status,
      acceptance: node.acceptance.status,
      at: node.completed_at,
    })),
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
