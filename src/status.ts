import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { readLocalStoreMetadata, readRunIndex } from "./store/local.js";
import { listRunAttemptRecords } from "./store/attempts.js";
import type {
  LocalStoreRunIndexEntry,
  RunRecord,
  RunStatusEntry,
  RunStatusView,
} from "./types";

export interface StatusOptions {
  limit?: number;
  path: string;
}

export async function statusPath(
  path: string,
  options: Omit<StatusOptions, "path"> = {},
): Promise<RunStatusView> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  const limit = normalizeLimit(options.limit);

  if (info.isDirectory() && (await readLocalStoreMetadata(resolved))) {
    const entries = await Promise.all(
      (await readRunIndex(resolved)).map((entry) =>
        statusEntryFromStoreIndex(resolved, entry),
      ),
    );
    return buildStatusView(resolved, limit ? entries.slice(0, limit) : entries);
  }

  if (!info.isDirectory()) {
    const entry = await loadRunEntry(dirname(resolved));
    return buildStatusView(dirname(resolved), entry ? [entry] : []);
  }

  const runJsonPath = resolve(resolved, "run.json");
  if (await exists(runJsonPath)) {
    const entry = await loadRunEntry(resolved);
    return buildStatusView(resolved, entry ? [entry] : []);
  }

  const directories = (await readdir(resolved, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(resolved, entry.name))
    .sort((a, b) => basename(b).localeCompare(basename(a)));

  const runs: RunStatusEntry[] = [];
  for (const directory of directories) {
    const run = await loadRunEntry(directory);
    if (run) {
      runs.push(run);
    }
  }

  runs.sort(compareRuns);
  return buildStatusView(resolved, limit ? runs.slice(0, limit) : runs);
}

export function renderStatusText(view: RunStatusView): string {
  const lines: string[] = [];
  lines.push(`Runs: ${view.total}`);
  lines.push(`Root: ${view.root}`);

  if (view.runs.length === 0) {
    lines.push("");
    lines.push("No runs found.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("");
  for (const run of view.runs) {
    const outputs = run.outputs.length > 0 ? ` outputs[${run.outputs.join(", ")}]` : "";
    const declaredError = run.declared_error
      ? ` declared_error[${run.declared_error.code}]`
      : "";
    const finallyEvidence = run.finally_evidence ? " finally[recorded]" : "";
    const nodes = run.node_count > 0 ? ` nodes=${run.node_count}` : "";
    const attempts =
      run.attempt_count > 0
        ? ` attempts=${run.attempt_count}${
            run.latest_attempt_status ? ` latest_attempt=${run.latest_attempt_status}` : ""
          }`
        : "";
    lines.push(
      `- ${run.run_id}: ${run.component_ref} [${run.kind}] ${run.status} (${run.acceptance})${outputs}${declaredError}${finallyEvidence}${nodes}${attempts}`,
    );
    if (run.acceptance_reason) {
      lines.push(`  reason ${run.acceptance_reason}`);
    }
    lines.push(`  created ${run.created_at}`);
    if (run.completed_at) {
      lines.push(`  completed ${run.completed_at}`);
    }
    lines.push(`  path ${run.run_dir}`);
  }

  return `${lines.join("\n")}\n`;
}

async function loadRunEntry(runDir: string): Promise<RunStatusEntry | null> {
  const runPath = resolve(runDir, "run.json");
  if (!(await exists(runPath))) {
    return null;
  }

  const record = JSON.parse(await readFile(runPath, "utf8")) as RunRecord;
  return {
    run_id: record.run_id,
    component_ref: record.component_ref,
    kind: record.kind,
    status: record.status,
    acceptance: record.acceptance.status,
    acceptance_reason: record.acceptance.reason,
    created_at: record.created_at,
    completed_at: record.completed_at,
    outputs: record.outputs.map((output) => output.port).sort(),
    ...(record.error ? { declared_error: record.error } : {}),
    ...(record.finally_evidence ? { finally_evidence: record.finally_evidence } : {}),
    node_count: await countNodeRuns(runDir),
    attempt_count: 0,
    latest_attempt_status: null,
    run_dir: runDir.replace(/\\/g, "/"),
  };
}

async function countNodeRuns(runDir: string): Promise<number> {
  try {
    const files = await readdir(resolve(runDir, "nodes"));
    return files.filter((file) => file.endsWith(".run.json")).length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function buildStatusView(root: string, runs: RunStatusEntry[]): RunStatusView {
  return {
    status_version: "0.1",
    root: root.replace(/\\/g, "/"),
    total: runs.length,
    runs,
  };
}

async function statusEntryFromStoreIndex(
  root: string,
  entry: LocalStoreRunIndexEntry,
): Promise<RunStatusEntry> {
  const attempts = await listRunAttemptRecords(root, entry.run_id);
  const latestAttempt = attempts[attempts.length - 1] ?? null;
  return {
    run_id: entry.run_id,
    component_ref: entry.component_ref,
    kind: entry.kind,
    status: entry.status,
    acceptance: entry.acceptance,
    acceptance_reason: null,
    created_at: entry.created_at,
    completed_at: entry.completed_at,
    outputs: [],
    ...(latestAttempt?.declared_error
      ? { declared_error: latestAttempt.declared_error }
      : {}),
    ...(latestAttempt?.finally_evidence
      ? { finally_evidence: latestAttempt.finally_evidence }
      : {}),
    node_count: 0,
    attempt_count: attempts.length,
    latest_attempt_status: latestAttempt?.status ?? null,
    run_dir: join(root, entry.record_ref).replace(/\\/g, "/"),
  };
}

function compareRuns(a: RunStatusEntry, b: RunStatusEntry): number {
  const created = b.created_at.localeCompare(a.created_at);
  if (created !== 0) {
    return created;
  }
  return b.run_id.localeCompare(a.run_id);
}

function normalizeLimit(value: number | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}
