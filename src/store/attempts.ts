import { join } from "node:path";
import {
  readStoreJsonRecord,
  writeStoreJsonRecord,
} from "./local.js";
import type {
  Diagnostic,
  DeclaredErrorRecord,
  LocalRunAttemptFailure,
  LocalRunAttemptRecord,
  LocalRunAttemptRetry,
  LocalRunResumePoint,
  NodeSessionRef,
  RuntimeProfile,
  RunLifecycleStatus,
} from "../types.js";

export interface WriteRunAttemptOptions {
  runId: string;
  componentRef: string;
  attemptNumber: number;
  status: RunLifecycleStatus;
  runtimeProfile?: RuntimeProfile | null;
  nodeSession?: NodeSessionRef | null;
  startedAt: string;
  finishedAt?: string | null;
  diagnostics?: Diagnostic[];
  failure?: LocalRunAttemptFailure | null;
  declaredError?: DeclaredErrorRecord | null;
  retry?: LocalRunAttemptRetry | null;
  resume?: LocalRunResumePoint | null;
}

export async function writeRunAttemptRecord(
  root: string,
  options: WriteRunAttemptOptions,
): Promise<LocalRunAttemptRecord> {
  const record: LocalRunAttemptRecord = {
    attempt_record_version: "0.1",
    attempt_id: attemptId(options.runId, options.attemptNumber),
    run_id: options.runId,
    component_ref: options.componentRef,
    attempt_number: options.attemptNumber,
    status: options.status,
    runtime_profile: options.runtimeProfile ?? null,
    node_session: options.nodeSession ?? null,
    started_at: options.startedAt,
    finished_at: options.finishedAt ?? null,
    diagnostics: options.diagnostics ?? [],
    failure: options.failure ?? null,
    ...(options.declaredError ? { declared_error: options.declaredError } : {}),
    retry: options.retry ?? null,
    resume: options.resume ?? null,
  };
  const recordRef = attemptRecordRef(options.runId, options.attemptNumber);
  await writeStoreJsonRecord(root, "runs", recordRef, record);
  await upsertAttemptRef(root, options.runId, recordRef);
  return record;
}

export async function readRunAttemptRecord(
  root: string,
  runId: string,
  attemptNumber: number,
): Promise<LocalRunAttemptRecord> {
  return readStoreJsonRecord<LocalRunAttemptRecord>(
    root,
    "runs",
    attemptRecordRef(runId, attemptNumber),
  );
}

export async function listRunAttemptRecords(
  root: string,
  runId: string,
): Promise<LocalRunAttemptRecord[]> {
  const refs = await readAttemptRefs(root, runId);
  const records = await Promise.all(
    refs.map((ref) => readStoreJsonRecord<LocalRunAttemptRecord>(root, "runs", ref)),
  );
  return records.sort((a, b) => a.attempt_number - b.attempt_number);
}

async function upsertAttemptRef(
  root: string,
  runId: string,
  recordRef: string,
): Promise<void> {
  const existing = await readAttemptRefs(root, runId);
  const next = [recordRef, ...existing.filter((ref) => ref !== recordRef)].sort();
  await writeStoreJsonRecord(
    root,
    "indexes",
    join("attempts", "by-run", `${encode(runId)}.json`),
    next,
    { immutable: false },
  );
}

async function readAttemptRefs(root: string, runId: string): Promise<string[]> {
  try {
    return await readStoreJsonRecord<string[]>(
      root,
      "indexes",
      join("attempts", "by-run", `${encode(runId)}.json`),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    return [];
  }
}

function attemptRecordRef(runId: string, attemptNumber: number): string {
  return join(encode(runId), "attempts", `attempt-${attemptNumber}.json`);
}

function attemptId(runId: string, attemptNumber: number): string {
  return `${runId}:attempt-${attemptNumber}`;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}
