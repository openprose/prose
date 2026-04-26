import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { loadCurrentRunSet } from "./plan.js";
import { runFile, runSource, type OpenProseRunResult, type RunOptions } from "./run.js";
import { listRunAttemptRecords, writeRunAttemptRecord } from "./store/attempts.js";
import { upsertRunIndexEntry } from "./store/local.js";
import type { RunRecord } from "./types.js";

export interface RetryRunOptions extends RunOptions {
  currentRunPath: string;
}

export interface ResumeRunOptions extends RunOptions {
  currentRunPath: string;
}

export interface CancelRunOptions {
  storeRoot?: string;
  cancelledAt?: string;
  reason?: string | null;
  principalId?: string;
}

export interface RuntimeControlRecord {
  control_record_version: "0.1";
  control_id: string;
  run_id: string;
  action: "cancel";
  principal_id: string;
  reason: string | null;
  created_at: string;
  attempt_number: number;
}

export async function retryRunFile(
  path: string,
  options: RetryRunOptions,
): Promise<OpenProseRunResult> {
  return runFile(path, {
    ...options,
    trigger: options.trigger ?? "graph_recompute",
  });
}

export async function retryRunSource(
  source: string,
  options: RetryRunOptions & { path: string },
): Promise<OpenProseRunResult> {
  return runSource(source, {
    ...options,
    trigger: options.trigger ?? "graph_recompute",
  });
}

export async function resumeRunFile(
  path: string,
  options: ResumeRunOptions,
): Promise<OpenProseRunResult> {
  return runFile(path, {
    ...options,
    trigger: options.trigger ?? "human_gate",
  });
}

export async function resumeRunSource(
  source: string,
  options: ResumeRunOptions & { path: string },
): Promise<OpenProseRunResult> {
  return runSource(source, {
    ...options,
    trigger: options.trigger ?? "human_gate",
  });
}

export async function cancelRunPath(
  runDir: string,
  options: CancelRunOptions = {},
): Promise<RuntimeControlRecord> {
  const resolvedRunDir = resolve(runDir);
  const record = JSON.parse(
    await readFile(join(resolvedRunDir, "run.json"), "utf8"),
  ) as RunRecord;
  const storeRoot = options.storeRoot ?? inferStoreRoot(dirname(resolvedRunDir));
  const cancelledAt = options.cancelledAt ?? new Date().toISOString();
  const attempts = await listRunAttemptRecords(storeRoot, record.run_id);
  const attemptNumber =
    attempts.reduce((max, attempt) => Math.max(max, attempt.attempt_number), 0) + 1;
  const reason = options.reason ?? "Run cancelled.";

  await writeRunAttemptRecord(storeRoot, {
    runId: record.run_id,
    componentRef: record.component_ref,
    attemptNumber,
    status: "cancelled",
    runtimeProfile: record.runtime.profile,
    nodeSessionRef: null,
    startedAt: cancelledAt,
    finishedAt: cancelledAt,
    diagnostics: [],
    failure: {
      code: "run_cancelled",
      message: reason,
      retryable: false,
    },
  });
  await upsertRunIndexEntry(storeRoot, {
    run_id: record.run_id,
    kind: record.kind,
    component_ref: record.component_ref,
    status: "cancelled",
    acceptance: record.acceptance.status,
    created_at: record.created_at,
    completed_at: cancelledAt,
    record_ref: normalizePath(relative(storeRoot, join(resolvedRunDir, "run.json"))),
  });

  const control: RuntimeControlRecord = {
    control_record_version: "0.1",
    control_id: `${record.run_id}:cancel:${attemptNumber}`,
    run_id: record.run_id,
    action: "cancel",
    principal_id: options.principalId ?? "local",
    reason,
    created_at: cancelledAt,
    attempt_number: attemptNumber,
  };
  await mkdir(join(resolvedRunDir, "controls"), { recursive: true });
  await writeFile(
    join(resolvedRunDir, "controls", `cancel-${attemptNumber}.json`),
    `${JSON.stringify(control, null, 2)}\n`,
  );
  return control;
}

export async function currentRunSetForRetry(path: string) {
  return loadCurrentRunSet(path);
}

function inferStoreRoot(runRoot: string): string {
  return basename(normalizePath(runRoot)) === "runs"
    ? dirname(runRoot)
    : join(runRoot, ".prose-store");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
