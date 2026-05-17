import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { summarizeCostLedger } from "./cost-ledger.js";
import { assertSafePathSegment, redactionValuesFromEnv, sanitizeAttemptResult } from "./safety.js";
import { scoreAttempt } from "./scorer.js";
import { validateEvalSuite } from "./schema.js";
import type { EvalAdapter, EvalArtifactStore, EvalAttemptResult, EvalSuite, EvalSuiteRunResult, EvalTask, EvalTaskRunResult } from "./types.js";

export interface EvalRunnerOptions {
	artifactStore?: EvalArtifactStore;
	env?: Record<string, string | undefined>;
	failFast?: boolean;
	maxOutputChars?: number;
	now?: () => Date;
	runId?: string;
	signal?: AbortSignal;
}

export async function runEvalSuite(
	suiteInput: EvalSuite,
	adapter: EvalAdapter,
	options: EvalRunnerOptions = {},
): Promise<EvalSuiteRunResult> {
	const suite = validateEvalSuite(suiteInput);
	const now = options.now ?? (() => new Date());
	const runId = assertSafePathSegment(options.runId ?? randomUUID(), "runId");
	const adapterName = assertSafePathSegment(adapter.name, "adapter.name");
	const startedAt = now().toISOString();
	const tasks: EvalTaskRunResult[] = [];
	const redactionValues = redactionValuesFromEnv(options.env);

	for (const task of suite.tasks) {
		const taskStartedAt = now().toISOString();
		const attemptId = `${runId}:${task.id}:1`;
		const startedMs = Date.now();
		const adapterRunDirectory =
			options.artifactStore === undefined ? undefined : join(options.artifactStore.root, runId, task.id, adapterName);

		if (adapterRunDirectory !== undefined) {
			await mkdir(adapterRunDirectory, { recursive: true });
		}

		const signal = composeSignals(options.signal, task.timeoutMs);
		try {
			let attempt: EvalAttemptResult;
			try {
				attempt = await adapter.runTask(task, {
					...(adapterRunDirectory === undefined ? {} : { adapterRunDirectory }),
					...(options.artifactStore === undefined ? {} : { artifactStore: options.artifactStore }),
					...(options.env === undefined ? {} : { env: options.env }),
					attemptId,
					runId,
					...(signal === undefined ? {} : { signal: signal.signal }),
					startedAt: taskStartedAt,
				});
			} catch (error) {
				attempt = failedAttemptFromError(error, adapterName, Date.now() - startedMs, now().toISOString());
			}

			const attemptWithDuration = attempt.durationMs === 0 ? { ...attempt, durationMs: Date.now() - startedMs } : attempt;
			const attemptWithCost = ensureCostRecordIfRequired(attemptWithDuration, task, adapterName, runId, attemptId, now().toISOString());
			const sanitizedAttempt = sanitizeAttemptResult(attemptWithCost, {
				redactionValues,
				...(options.maxOutputChars === undefined ? {} : { maxTextLength: options.maxOutputChars }),
			});
			const result = buildTaskResult(task, adapterName, attemptId, taskStartedAt, now().toISOString(), sanitizedAttempt);
			tasks.push(result);
			await options.artifactStore?.writeJson(`${runId}/${task.id}/result.json`, resultToJson(result));

			if (options.failFast === true && result.status === "failed") {
				break;
			}
		} finally {
			signal?.dispose();
		}
	}

	const completedAt = now().toISOString();
	const failed = tasks.filter((task) => task.status === "failed").length;
	const costs = tasks.flatMap((task) => task.attempt.costs ?? []);
	const costSummary = summarizeCostLedger(costs);
	const result: EvalSuiteRunResult = {
		adapterName: adapter.name,
		completedAt,
		runId,
		startedAt,
		status: failed === 0 ? "passed" : "failed",
		suiteId: suite.id,
		tasks,
		totals: {
			failed,
			knownCostUsd: costSummary.knownCostUsd,
			passed: tasks.length - failed,
			tasks: tasks.length,
			unknownCostRecords: costSummary.unknownCostRecords,
		},
	};

	await options.artifactStore?.writeJson(`${runId}/summary.json`, resultToJson(result));
	return result;
}

function buildTaskResult(
	task: EvalTask,
	adapterName: string,
	attemptId: string,
	startedAt: string,
	completedAt: string,
	attempt: EvalAttemptResult,
): EvalTaskRunResult {
	const score = scoreAttempt(attempt, task.expected);
	return {
		adapterName,
		attempt,
		attemptId,
		completedAt,
		score,
		startedAt,
		status: score.passed ? "passed" : "failed",
		taskId: task.id,
	};
}

function failedAttemptFromError(error: unknown, adapterName: string, durationMs: number, at: string): EvalAttemptResult {
	const message = error instanceof Error ? error.message : String(error);
	return {
		adapterName,
		durationMs,
		exitCode: 1,
		stdout: "",
		stderr: `${message}\n`,
		events: [
			{
				type: "eval.adapter_error",
				at,
				message,
			},
		],
		metadata: {
			errorName: error instanceof Error ? error.name : "Error",
		},
	};
}

function ensureCostRecordIfRequired(
	attempt: EvalAttemptResult,
	task: EvalTask,
	adapterName: string,
	runId: string,
	attemptId: string,
	occurredAt: string,
): EvalAttemptResult {
	if (task.expected.maxKnownCostUsd === undefined && task.expected.requiresCost !== true) {
		return attempt;
	}

	if ((attempt.costs ?? []).length > 0) {
		return attempt;
	}

	return {
		...attempt,
		costs: [
			{
				id: `unknown:${attemptId}`,
				runId,
				taskId: task.id,
				attemptId,
				adapterName,
				confidence: "unknown",
				occurredAt,
				...(task.surpriseLabels?.[0] === undefined ? {} : { surpriseLabel: task.surpriseLabels[0] }),
			},
		],
	};
}

interface DisposableAbortSignal {
	readonly signal: AbortSignal;
	dispose(): void;
}

function composeSignals(signal: AbortSignal | undefined, timeoutMs: number | undefined): DisposableAbortSignal | undefined {
	if (signal === undefined && timeoutMs === undefined) {
		return undefined;
	}

	const controller = new AbortController();
	let timeout: NodeJS.Timeout | undefined;
	const abort = () => controller.abort(signal?.reason);

	if (signal?.aborted) {
		abort();
	} else {
		signal?.addEventListener("abort", abort, { once: true });
	}

	if (timeoutMs !== undefined) {
		timeout = setTimeout(() => controller.abort(new Error(`Eval task timed out after ${timeoutMs}ms`)), timeoutMs);
	}

	return {
		signal: controller.signal,
		dispose() {
			if (timeout !== undefined) {
				clearTimeout(timeout);
			}
			signal?.removeEventListener("abort", abort);
		},
	};
}

function resultToJson(value: EvalSuiteRunResult | EvalTaskRunResult) {
	return JSON.parse(JSON.stringify(value));
}
