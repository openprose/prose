import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { RunRecord, RunStatusEntry, RunStatusView } from "./types";

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
    const nodes = run.node_count > 0 ? ` nodes=${run.node_count}` : "";
    lines.push(
      `- ${run.run_id}: ${run.component_ref} [${run.kind}] ${run.status} (${run.acceptance})${outputs}${nodes}`,
    );
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
    created_at: record.created_at,
    completed_at: record.completed_at,
    outputs: record.outputs.map((output) => output.port).sort(),
    node_count: await countNodeRuns(runDir),
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
