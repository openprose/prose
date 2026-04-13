/**
 * Run context — creates and manages .prose/runs/{id}/ directories.
 */

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";

export interface RunContext {
  runId: string;
  runDir: string;
  programPath: string;
  programContent: string;
  format: "md" | "prose";
  startedAt: string;
  source: string;
}

export function generateRunId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${date}-${time}-${rand}`;
}

export async function createRunDirectory(
  workspaceDir: string,
  runId: string,
): Promise<string> {
  const runDir = join(workspaceDir, ".prose", "runs", runId);
  await mkdir(join(runDir, "workspace"), { recursive: true });
  await mkdir(join(runDir, "bindings"), { recursive: true });
  await mkdir(join(runDir, "services"), { recursive: true });
  await mkdir(join(runDir, "agents"), { recursive: true });
  return runDir;
}

export async function writeRunMetadata(ctx: RunContext): Promise<void> {
  const metadata = `# run:${ctx.runId}

| Field | Value |
|-------|-------|
| Run ID | ${ctx.runId} |
| Started | ${ctx.startedAt} |
| Source | ${ctx.source} |
| Format | ${ctx.format} |
| Status | running |
`;
  await writeFile(join(ctx.runDir, "metadata.md"), metadata);
}

export async function writeStateMarker(
  runDir: string,
  runId: string,
  programName: string,
  marker: string,
): Promise<void> {
  const statePath = join(runDir, "state.md");
  let existing = "";
  try {
    existing = await readFile(statePath, "utf-8");
  } catch {
    existing = `# run:${runId} ${programName}\n\n`;
  }
  await writeFile(statePath, existing + marker + "\n");
}

export async function finalizeRun(
  ctx: RunContext,
  status: "completed" | "failed",
  error?: string,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const marker =
    status === "completed"
      ? `---end ${timestamp}`
      : `---error ${timestamp} ${error ?? "unknown"}`;
  await writeStateMarker(ctx.runDir, ctx.runId, ctx.source, marker);

  // Update metadata
  const metaPath = join(ctx.runDir, "metadata.md");
  try {
    let meta = await readFile(metaPath, "utf-8");
    meta = meta.replace("| Status | running |", `| Status | ${status} |`);
    meta += `| Finished | ${timestamp} |\n`;
    if (error) {
      meta += `| Error | ${error} |\n`;
    }
    await writeFile(metaPath, meta);
  } catch {
    // metadata write is best-effort
  }
}
