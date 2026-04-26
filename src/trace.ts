import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { listArtifactRecordsForRun } from "./store/artifacts.js";
import { listRunAttemptRecords } from "./store/attempts.js";
import { readLocalStoreMetadata } from "./store/local.js";
import type {
  LocalArtifactRecord,
  LocalRunAttemptRecord,
  RunRecord,
  TraceArtifactView,
  TraceAttemptView,
  TraceEvent,
  TraceView,
} from "./types";

export interface TraceOptions {
  path: string;
}

export async function traceFile(
  path: string,
  _options: Omit<TraceOptions, "path"> = {},
): Promise<TraceView> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  const runDir = info.isDirectory() ? resolved : dirname(resolved);

  const record = JSON.parse(
    await readFile(
      info.isDirectory() ? resolve(runDir, "run.json") : resolved,
      "utf8",
    ),
  ) as RunRecord;

  const nodeRecords = await loadNodeRecords(runDir);
  const events = await loadTraceEvents(runDir, record.trace_ref);
  const storeRoot = await findAdjacentStoreRoot(runDir);
  const attempts = storeRoot ? await loadTraceAttempts(storeRoot, record.run_id) : [];
  const artifacts = storeRoot ? await loadTraceArtifacts(storeRoot, record.run_id) : [];

  return {
    trace_version: "0.1",
    run_id: record.run_id,
    component_ref: record.component_ref,
    kind: record.kind,
    status: record.status,
    acceptance: record.acceptance.status,
    acceptance_reason: record.acceptance.reason,
    runtime: record.runtime,
    created_at: record.created_at,
    completed_at: record.completed_at,
    inputs: record.inputs.map((input) => input.port).sort(),
    outputs: record.outputs.map((output) => output.port).sort(),
    dependencies: record.dependencies
      .map((dependency) => `${dependency.package}@${dependency.sha || "unresolved"}`)
      .sort(),
    nodes: nodeRecords
      .map((node) => ({
        run_id: node.run_id,
        component_ref: node.component_ref,
        status: node.status,
        acceptance: node.acceptance.status,
        acceptance_reason: node.acceptance.reason,
        outputs: node.outputs.map((output) => output.port).sort(),
        effects: node.effects.declared.sort(),
      }))
      .sort((a, b) => a.component_ref.localeCompare(b.component_ref)),
    attempts: attempts.map(traceAttemptView),
    artifacts: artifacts.map(traceArtifactView),
    events,
  };
}

export function renderTraceText(trace: TraceView): string {
  const lines: string[] = [];
  lines.push(`Run: ${trace.run_id}`);
  lines.push(`Component: ${trace.component_ref} [${trace.kind}]`);
  lines.push(`Status: ${trace.status} (${trace.acceptance})`);
  if (trace.acceptance_reason) {
    lines.push(`Acceptance reason: ${trace.acceptance_reason}`);
  }
  lines.push(
    `Runtime: ${trace.runtime.graph_vm}` +
      `${trace.runtime.model_provider ? ` / ${trace.runtime.model_provider}` : ""}` +
      `${trace.runtime.model ? ` / ${trace.runtime.model}` : ""}` +
      ` (${trace.runtime.harness}${trace.runtime.worker_ref ? ` / ${trace.runtime.worker_ref}` : ""})`,
  );
  lines.push(`Created: ${trace.created_at}`);
  if (trace.completed_at) {
    lines.push(`Completed: ${trace.completed_at}`);
  }
  lines.push("");

  lines.push(`Inputs: ${trace.inputs.length ? trace.inputs.join(", ") : "(none)"}`);
  lines.push(`Outputs: ${trace.outputs.length ? trace.outputs.join(", ") : "(none)"}`);
  lines.push(
    `Dependencies: ${trace.dependencies.length ? trace.dependencies.join(", ") : "(none)"}`,
  );

  if (trace.nodes.length > 0) {
    lines.push("");
    lines.push("Nodes:");
    for (const node of trace.nodes) {
      lines.push(
        `- ${node.component_ref}: ${node.status} (${node.acceptance})` +
          `${node.acceptance_reason ? ` reason[${node.acceptance_reason}]` : ""}` +
          `${node.outputs.length ? ` outputs[${node.outputs.join(", ")}]` : ""}` +
          `${node.effects.length ? ` effects[${node.effects.join(", ")}]` : ""}`,
      );
    }
  }

  if (trace.attempts.length > 0) {
    lines.push("");
    lines.push("Attempts:");
    for (const attempt of trace.attempts) {
      const diagnostics = attempt.diagnostic_codes.length
        ? ` diagnostics[${attempt.diagnostic_codes.join(", ")}]`
        : "";
      const failure = attempt.failure ? ` failure[${attempt.failure}]` : "";
      const session = attempt.node_session_ref ? " session[recorded]" : "";
      const runtime = attempt.runtime_profile
        ? ` runtime[${attempt.runtime_profile.graph_vm}]`
        : "";
      lines.push(
        `- #${attempt.attempt_number}: ${attempt.status}${runtime}${diagnostics}${failure}${session}`,
      );
    }
  }

  if (trace.artifacts.length > 0) {
    lines.push("");
    lines.push("Artifacts:");
    for (const artifact of trace.artifacts) {
      const port = artifact.port ? ` ${artifact.port}` : "";
      const labels = artifact.policy_labels.length
        ? ` labels[${artifact.policy_labels.join(", ")}]`
        : "";
      lines.push(
        `- ${artifact.direction}${port}: ${artifact.content_type} ${artifact.schema_status}` +
          ` hash[${artifact.content_hash.slice(0, 12)}]${labels}`,
      );
    }
  }

  if (trace.events.length > 0) {
    lines.push("");
    lines.push("Events:");
    for (const event of trace.events) {
      lines.push(`- ${event.at}: ${renderTraceEvent(event)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderTraceEvent(event: TraceEvent): string {
  const details = [
    stringDetail("graph_vm", event.graph_vm),
    modelDetail(event),
    stringDetail("session", event.session_id),
    stringDetail("session_file", event.session_file),
    stringDetail("tool", event.tool_name),
    stringListDetail("outputs", event.output_ports),
    stringDetail("failure", event.failure_class),
    stringDetail("gate", event.gate),
    usageDetail(event),
    stringDetail("message", event.message ?? event.content_preview ?? event.reason),
  ].filter(Boolean);
  return [event.event, ...details].join(" ");
}

function stringDetail(label: string, value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? `${label}[${value}]` : null;
}

function stringListDetail(label: string, value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const values = value.filter((entry): entry is string => typeof entry === "string");
  return values.length > 0 ? `${label}[${values.join(", ")}]` : null;
}

function modelDetail(event: TraceEvent): string | null {
  const modelProvider = typeof event.model_provider === "string" ? event.model_provider : null;
  const model = typeof event.model === "string" ? event.model : null;
  if (!modelProvider && !model) {
    return null;
  }
  return `model[${[modelProvider, model].filter(Boolean).join("/")}]`;
}

function usageDetail(event: TraceEvent): string | null {
  const total = numberDetail(event.total_tokens);
  const prompt = numberDetail(event.prompt_tokens);
  const completion = numberDetail(event.completion_tokens);
  if (total === null && prompt === null && completion === null) {
    return null;
  }
  return `tokens[${[
    prompt !== null ? `in:${prompt}` : null,
    completion !== null ? `out:${completion}` : null,
    total !== null ? `total:${total}` : null,
  ].filter(Boolean).join(", ")}]`;
}

function numberDetail(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function loadNodeRecords(runDir: string): Promise<RunRecord[]> {
  try {
    const files = (await readdir(resolve(runDir, "nodes")))
      .filter((file) => file.endsWith(".run.json"))
      .sort();
    const records: RunRecord[] = [];
    for (const file of files) {
      records.push(
        JSON.parse(await readFile(resolve(runDir, "nodes", file), "utf8")) as RunRecord,
      );
    }
    return records;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function loadTraceAttempts(
  storeRoot: string,
  runId: string,
): Promise<LocalRunAttemptRecord[]> {
  return listRunAttemptRecords(storeRoot, runId);
}

async function loadTraceArtifacts(
  storeRoot: string,
  runId: string,
): Promise<LocalArtifactRecord[]> {
  return listArtifactRecordsForRun(storeRoot, runId);
}

async function findAdjacentStoreRoot(runDir: string): Promise<string | null> {
  const candidates = [
    resolve(runDir, ".prose-store"),
    resolve(dirname(runDir), ".prose-store"),
    resolve(dirname(dirname(runDir)), ".prose-store"),
  ];
  for (const candidate of candidates) {
    if (await readLocalStoreMetadata(candidate)) {
      return candidate;
    }
  }
  return null;
}

function traceAttemptView(attempt: LocalRunAttemptRecord): TraceAttemptView {
  return {
    attempt_id: attempt.attempt_id,
    attempt_number: attempt.attempt_number,
    status: attempt.status,
    runtime_profile: attempt.runtime_profile,
    node_session_ref: attempt.node_session_ref,
    diagnostic_codes: attempt.diagnostics.map((diagnostic) => diagnostic.code).sort(),
    failure: attempt.failure?.message ?? null,
    started_at: attempt.started_at,
    finished_at: attempt.finished_at,
  };
}

function traceArtifactView(artifact: LocalArtifactRecord): TraceArtifactView {
  return {
    artifact_id: artifact.artifact_id,
    direction: artifact.provenance.direction,
    port: artifact.provenance.port,
    node_id: artifact.provenance.node_id,
    content_hash: artifact.content_hash,
    content_type: artifact.content_type,
    schema_status: artifact.schema.status,
    policy_labels: artifact.policy_labels,
    storage_path: artifact.storage.path,
  };
}

async function loadTraceEvents(
  runDir: string,
  traceRef: string,
): Promise<TraceEvent[]> {
  try {
    const source = await readFile(resolve(runDir, traceRef), "utf8");
    return JSON.parse(source) as TraceEvent[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
