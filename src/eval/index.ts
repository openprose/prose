import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { compilePackagePath } from "../ir/package.js";
import { loadCurrentRunSet } from "../plan.js";
import { runSource, type RunOptions } from "../run.js";
import { slugify } from "../text.js";
import type {
  Diagnostic,
  LocalEvalResultRecord,
  RunEvalRecord,
  RunOutputRecord,
  RunRecord,
} from "../types.js";

export interface PackageEvalDescriptor {
  eval_ref: string;
  path: string;
  component_ids: string[];
}

export interface ExecuteEvalOptions extends RunOptions {
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  required?: boolean;
  scoreThreshold?: number;
  createdAt?: string;
}

export interface ExecuteEvalResult {
  eval_record: LocalEvalResultRecord;
  eval_run: Awaited<ReturnType<typeof runSource>>;
  record_path: string;
}

export async function discoverPackageEvals(
  packagePath: string,
): Promise<PackageEvalDescriptor[]> {
  const ir = await compilePackagePath(packagePath);
  return ir.resources
    .filter((resource) => resource.kind === "eval" && resource.exists)
    .map((resource) => ({
      eval_ref: resource.path,
      path: join(ir.root, resource.path),
      component_ids: resource.component_ids,
    }));
}

export async function executeEvalFile(
  evalPath: string,
  subjectRunPath: string,
  options: ExecuteEvalOptions = {},
): Promise<ExecuteEvalResult> {
  const source = await readFile(resolve(evalPath), "utf8");
  return executeEvalSource(source, {
    ...options,
    path: evalPath,
    evalRef: normalizePath(evalPath),
    subjectRunPath,
  });
}

export async function executeEvalSource(
  source: string,
  options: ExecuteEvalOptions & {
    path: string;
    evalRef?: string;
    subjectRunPath: string;
  },
): Promise<ExecuteEvalResult> {
  const subjectDir = await subjectRunDir(options.subjectRunPath);
  const subject = await loadSubjectRun(options.subjectRunPath);
  const evalRef = options.evalRef ?? options.path;
  const evalRunId =
    options.runId ?? `${subject.run_id}:eval:${slugify(basename(evalRef))}`;
  const evalRun = await runSource(source, {
    ...options,
    path: options.path,
    runRoot: options.runRoot ?? join(subjectDir, "eval-runs"),
    runId: evalRunId,
    trigger: options.trigger ?? "test",
    inputs: {
      ...(options.inputs ?? {}),
      subject: subjectPayload(subject, subjectDir),
    },
  });
  const outcome = await inferEvalOutcome(evalRun.record, evalRun.run_dir, {
    required: options.required ?? true,
    scoreThreshold: options.scoreThreshold ?? 0.7,
  });
  const record: LocalEvalResultRecord = {
    eval_record_version: "0.1",
    eval_id: `${subject.run_id}:${slugify(basename(evalRef))}:${evalRun.run_id}`,
    eval_ref: evalRef,
    subject_run_id: subject.run_id,
    eval_run_id: evalRun.run_id,
    required: options.required ?? true,
    status: outcome.status,
    score: outcome.score,
    verdict: outcome.verdict,
    output_refs: evalRun.record.outputs,
    diagnostics: [
      ...evalRun.diagnostics,
      ...outcome.diagnostics,
    ],
    created_at: evalRun.record.completed_at ?? evalRun.record.created_at,
  };
  const recordPath = await writeEvalResultRecord(subjectDir, record);
  return {
    eval_record: record,
    eval_run: evalRun,
    record_path: recordPath,
  };
}

export async function readEvalResultRecords(
  runDir: string,
): Promise<LocalEvalResultRecord[]> {
  const evalDir = join(runDir, "evals");
  let files: string[];
  try {
    files = (await Array.fromAsync(new Bun.Glob("*.json").scan(evalDir))).sort();
  } catch {
    return [];
  }

  const records: LocalEvalResultRecord[] = [];
  for (const file of files) {
    records.push(
      JSON.parse(await readFile(join(evalDir, file), "utf8")) as LocalEvalResultRecord,
    );
  }
  return records;
}

async function writeEvalResultRecord(
  subjectDir: string,
  record: LocalEvalResultRecord,
): Promise<string> {
  const evalDir = join(subjectDir, "evals");
  await mkdir(evalDir, { recursive: true });
  const recordPath = join(evalDir, `${slugify(record.eval_id)}.json`);
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return recordPath;
}

async function loadSubjectRun(path: string): Promise<RunRecord> {
  const current = await loadCurrentRunSet(path);
  const record = current.graph ?? current.nodes[0] ?? null;
  if (!record) {
    throw new Error(`No subject run record found at '${path}'.`);
  }
  return record;
}

async function subjectRunDir(path: string): Promise<string> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  return info.isDirectory() ? resolved : dirname(resolved);
}

function subjectPayload(record: RunRecord, runDir: string): string {
  return `${JSON.stringify({
    run_id: record.run_id,
    run_dir: normalizePath(runDir),
    kind: record.kind,
    component_ref: record.component_ref,
    status: record.status,
    acceptance: record.acceptance,
    outputs: record.outputs,
    policy: record.policy ?? null,
  }, null, 2)}\n`;
}

async function inferEvalOutcome(
  record: RunRecord,
  runDir: string,
  options: { required: boolean; scoreThreshold: number },
): Promise<{
  status: RunEvalRecord["status"];
  score: number | null;
  verdict: string | null;
  diagnostics: Diagnostic[];
}> {
  const diagnostics: Diagnostic[] = [];
  const parsed = await firstParsedOutput(record.outputs, runDir);
  const score = normalizeScore(numberField(parsed, ["score", "quality_score", "overall_score"]));
  const verdict = stringField(parsed, ["verdict", "status", "overall_verdict"]);
  const passed = booleanField(parsed, ["passed", "pass", "ok", "accepted"]);

  if (record.status !== "succeeded") {
    diagnostics.push({
      severity: "error",
      code: "eval_run_not_succeeded",
      message: `Eval run '${record.run_id}' ended with ${record.status}.`,
    });
    return {
      status: options.required ? "failed" : "skipped",
      score,
      verdict,
      diagnostics,
    };
  }

  if (typeof passed === "boolean") {
    return {
      status: passed ? "passed" : "failed",
      score,
      verdict,
      diagnostics,
    };
  }

  if (verdict) {
    return {
      status: passingVerdict(verdict) ? "passed" : "failed",
      score,
      verdict,
      diagnostics,
    };
  }

  if (score !== null) {
    return {
      status: score >= options.scoreThreshold ? "passed" : "failed",
      score,
      verdict,
      diagnostics,
    };
  }

  return {
    status: "passed",
    score,
    verdict,
    diagnostics,
  };
}

async function firstParsedOutput(
  outputs: RunOutputRecord[],
  runDir: string,
): Promise<unknown> {
  for (const output of outputs) {
    const content = await readFile(join(runDir, output.artifact_ref), "utf8");
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
  return null;
}

function booleanField(value: unknown, keys: string[]): boolean | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const key of keys) {
    const field = (value as Record<string, unknown>)[key];
    if (typeof field === "boolean") {
      return field;
    }
  }
  return null;
}

function numberField(value: unknown, keys: string[]): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const key of keys) {
    const field = (value as Record<string, unknown>)[key];
    if (typeof field === "number" && Number.isFinite(field)) {
      return field;
    }
  }
  return null;
}

function stringField(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const key of keys) {
    const field = (value as Record<string, unknown>)[key];
    if (typeof field === "string" && field.trim()) {
      return field.trim();
    }
  }
  return null;
}

function normalizeScore(score: number | null): number | null {
  if (score === null) {
    return null;
  }
  return score > 1 ? score / 100 : score;
}

function passingVerdict(verdict: string): boolean {
  return /^(pass|passed|satisfied|accepted|ok|success)$/i.test(verdict);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export type {
  LocalEvalResultRecord,
  RunEvalRecord,
} from "../types.js";
