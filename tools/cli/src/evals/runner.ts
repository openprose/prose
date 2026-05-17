import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { summarizeCostLedger } from "./cost-ledger.js";
import { scoreAttempt } from "./scorer.js";
import { validateEvalSuite } from "./schema.js";
import type { EvalAdapter, EvalArtifactStore, EvalSuite, EvalSuiteRunResult, EvalTaskRunResult } from "./types.js";

export interface EvalRunnerOptions {
	artifactStore?: EvalArtifactStore;
	env?: Record<string, string | undefined>;
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
	const runId = options.runId ?? randomUUID();
	const startedAt = now().toISOString();
	const tasks: EvalTaskRunResult[] = [];

	for (const task of suite.tasks) {
		const taskStartedAt = now().toISOString();
		const attemptId = `${runId}:${task.id}:1`;
		const startedMs = Date.now();
		const adapterRunDirectory =
			options.artifactStore === undefined ? undefined : join(options.artifactStore.root, runId, task.id, adapter.name);

		if (adapterRunDirectory !== undefined) {
			await mkdir(adapterRunDirectory, { recursive: true });
		}

		const signal = composeSignals(options.signal, task.timeoutMs);
		try {
			const attempt = await adapter.runTask(task, {
				...(adapterRunDirectory === undefined ? {} : { adapterRunDirectory }),
				...(options.artifactStore === undefined ? {} : { artifactStore: options.artifactStore }),
				...(options.env === undefined ? {} : { env: options.env }),
				attemptId,
				runId,
				...(signal === undefined ? {} : { signal: signal.signal }),
				startedAt: taskStartedAt,
			});
			const attemptWithDuration =
				attempt.durationMs === 0 ? { ...attempt, durationMs: Date.now() - startedMs } : attempt;
			const score = scoreAttempt(attemptWithDuration, task.expected);
			const completedAt = now().toISOString();
			const result: EvalTaskRunResult = {
				adapterName: adapter.name,
				attempt: attemptWithDuration,
				attemptId,
				completedAt,
				score,
				startedAt: taskStartedAt,
				status: score.passed ? "passed" : "failed",
				taskId: task.id,
			};
			tasks.push(result);
			await options.artifactStore?.writeJson(`${runId}/${task.id}/result.json`, resultToJson(result));
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
