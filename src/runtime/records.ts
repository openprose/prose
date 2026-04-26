import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { sha256 } from "../hash.js";
import { mergePolicyLabels } from "../policy/index.js";
import type {
  NodeArtifactResult,
  GraphVmKind,
  NodeRunResult,
} from "../node-runners/index.js";
import { writeRunAttemptRecord } from "../store/attempts.js";
import { upsertRunIndexEntry } from "../store/local.js";
import type {
  ComponentIR,
  Diagnostic,
  ProseIR,
  RunOutputRecord,
  RunRecord,
  RuntimeProfile,
} from "../types.js";

export interface RuntimeRecordContext {
  ir: ProseIR;
  nodeRunner: { kind: GraphVmKind };
  runtimeProfile: RuntimeProfile;
  runId: string;
  runDir: string;
  storeRoot: string;
  createdAt: string;
  completedAt?: string;
  trigger: RunRecord["caller"]["trigger"];
}

export function baseRunRecord(
  ctx: RuntimeRecordContext,
  component: ComponentIR,
  kind: "component" | "graph",
  runId = ctx.runId,
): Omit<RunRecord, "inputs" | "dependencies" | "effects" | "outputs" | "evals" | "acceptance" | "trace_ref" | "status" | "completed_at"> {
  return {
    run_id: runId,
    kind,
    component_ref: component.name,
    component_version: {
      source_sha: ctx.ir.package.source_sha,
      package_ref: ctx.ir.package.source_ref,
      ir_hash: ctx.ir.semantic_hash,
    },
    caller: {
      principal_id: "local",
      tenant_id: "local",
      roles: ["local"],
      trigger: ctx.trigger,
    },
    runtime: {
      harness: "openprose-node-runner",
      worker_ref: ctx.nodeRunner.kind,
      graph_vm: ctx.runtimeProfile.graph_vm,
      single_run_harness: ctx.runtimeProfile.single_run_harness,
      model_provider: ctx.runtimeProfile.model_provider,
      model: ctx.runtimeProfile.model,
      thinking: ctx.runtimeProfile.thinking,
      tools: ctx.runtimeProfile.tools,
      persist_sessions: ctx.runtimeProfile.persist_sessions,
      profile: ctx.runtimeProfile,
      environment_ref: null,
    },
    created_at: ctx.createdAt,
  };
}

export async function writeRunRecordFile(
  ctx: RuntimeRecordContext,
  recordPath: string,
  record: RunRecord,
): Promise<void> {
  const path = join(ctx.runDir, recordPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
}

export async function writeNodeAttemptRecord(
  ctx: RuntimeRecordContext,
  record: RunRecord,
  result: NodeRunResult,
  diagnostics = result.diagnostics,
): Promise<void> {
  await writeRunAttemptRecord(ctx.storeRoot, {
    runId: record.run_id,
    componentRef: record.component_ref,
    attemptNumber: 1,
    status: record.status,
    runtimeProfile: ctx.runtimeProfile,
    nodeSession: result.session,
    startedAt: record.created_at,
    finishedAt: record.completed_at,
    diagnostics,
    failure:
      record.status === "succeeded"
        ? null
        : {
            code: "node_run_failed",
            message: record.acceptance.reason ?? "Node run failed.",
            retryable: record.status === "failed",
          },
  });
}

export async function writeBlockedAttemptRecord(
  ctx: RuntimeRecordContext,
  record: RunRecord,
): Promise<void> {
  await writeRunAttemptRecord(ctx.storeRoot, {
    runId: record.run_id,
    componentRef: record.component_ref,
    attemptNumber: 1,
    status: record.status,
    runtimeProfile: ctx.runtimeProfile,
    nodeSession: null,
    startedAt: record.created_at,
    finishedAt: record.completed_at,
    diagnostics: recordDiagnostics(record),
    failure: {
      code: "run_blocked",
      message: record.acceptance.reason ?? "Run blocked.",
      retryable: false,
    },
    resume: resumePointForBlockedRecord(record),
  });
}

export async function indexRunRecord(
  ctx: RuntimeRecordContext,
  record: RunRecord,
  recordPath: string,
): Promise<void> {
  await upsertRunIndexEntry(ctx.storeRoot, {
    run_id: record.run_id,
    kind: record.kind,
    component_ref: record.component_ref,
    status: record.status,
    acceptance: record.acceptance.status,
    created_at: record.created_at,
    completed_at: record.completed_at,
    record_ref: normalizePath(relative(ctx.storeRoot, join(ctx.runDir, recordPath))),
  });
}

export function dependencyRecords(ctx: RuntimeRecordContext): RunRecord["dependencies"] {
  return ctx.ir.package.dependencies.map((dependency) => ({
    package: dependency.package,
    sha: dependency.sha,
  }));
}

export function completionTimestamp(ctx: RuntimeRecordContext): string {
  return ctx.completedAt ?? new Date().toISOString();
}

export function nodeRunId(
  ctx: RuntimeRecordContext,
  component: ComponentIR,
): string {
  return `${ctx.runId}:${component.name}`;
}

export function nodeRunRecordPath(component: ComponentIR): string {
  return join("nodes", `${component.id}.run.json`);
}

export async function writeRunOutputArtifacts(
  ctx: RuntimeRecordContext,
  component: ComponentIR,
  artifacts: NodeArtifactResult[],
  policyLabelsByPort: Record<string, string[]> = {},
): Promise<RunOutputRecord[]> {
  const outputs: RunOutputRecord[] = [];
  for (const artifact of artifacts) {
    if (artifact.content === null) {
      continue;
    }
    const artifactRef = artifact.artifact_ref ?? join("bindings", component.id, `${artifact.port}.md`);
    const path = join(ctx.runDir, artifactRef);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, artifact.content, "utf8");
    outputs.push({
      port: artifact.port,
      value_hash: artifact.content_hash ?? sha256(artifact.content),
      artifact_ref: normalizePath(artifactRef),
      policy_labels: mergePolicyLabels(
        policyLabelsByPort[artifact.port] ?? [],
        artifact.policy_labels,
      ),
    });
  }
  return outputs;
}

export function diagnosticsReason(diagnostics: Diagnostic[]): string | null {
  return diagnostics.length > 0
    ? diagnostics.map((diagnostic) => diagnostic.message).join(" ")
    : null;
}

export function recordDiagnostics(record: RunRecord): Diagnostic[] {
  return record.acceptance.reason
    ? [
        {
          severity: record.status === "succeeded" ? "info" : "error",
          code: `run_${record.status}`,
          message: record.acceptance.reason,
        },
      ]
    : [];
}

export function recordDiagnosticsReason(reasons: string[]): Diagnostic[] {
  return reasons.map((reason) => ({
    severity: "error",
    code: "run_blocked",
    message: reason,
  }));
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function resumePointForBlockedRecord(record: RunRecord) {
  const gated = record.effects.declared.some(
    (effect) => effect !== "pure" && effect !== "read_external",
  );
  if (!gated) {
    return null;
  }
  return {
    checkpoint_ref: "plan.json",
    reason: record.acceptance.reason,
  };
}
