import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { summarizeCostLedger } from "./cost-ledger.js";
import { assertSafePathSegment, redactionValuesFromEnv, sanitizeAttemptResult } from "./safety.js";
import { scoreAttempt } from "./scorer.js";
import { validateEvalSuite } from "./schema.js";
import type {
	EvalAdapter,
	EvalArtifact,
	EvalArtifactStore,
	EvalAttemptResult,
	EvalEvent,
	EvalSuite,
	EvalSuiteRunResult,
	EvalTask,
	EvalTaskContract,
	EvalTaskRunResult,
	JsonObject,
	JsonValue,
} from "./types.js";

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

	await writeRunEvidenceStart(options.artifactStore, runId, suite, adapterName, startedAt);

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
			await appendEvidenceEvent(options.artifactStore, runId, {
				type: "eval.task_started",
				at: taskStartedAt,
				data: taskEvidenceData(suite.id, task, adapterName, attemptId),
			});

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
			const resultWithEvidence = await writeTaskEvidenceArtifacts(options.artifactStore, runId, suite.id, task, result);
			tasks.push(resultWithEvidence);
			await options.artifactStore?.writeJson(`${runId}/${task.id}/result.json`, jsonClone(resultWithEvidence));

			if (options.failFast === true && resultWithEvidence.status === "failed") {
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
		adapterName,
		completedAt,
		...(suite.metadata === undefined ? {} : { metadata: suite.metadata }),
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

	await appendEvidenceEvent(options.artifactStore, runId, {
		type: "eval.run_completed",
		at: completedAt,
		data: {
			adapterName,
			failed,
			status: result.status,
			suiteId: suite.id,
			tasks: tasks.length,
		},
	});
	await options.artifactStore?.writeJson(`${runId}/summary.json`, jsonClone(result));
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
		...(task.contract === undefined ? {} : { contract: task.contract }),
		score,
		startedAt,
		status: score.passed ? "passed" : "failed",
		taskId: task.id,
	};
}

async function writeRunEvidenceStart(
	artifactStore: EvalArtifactStore | undefined,
	runId: string,
	suite: EvalSuite,
	adapterName: string,
	startedAt: string,
): Promise<void> {
	if (artifactStore === undefined) {
		return;
	}

	await artifactStore.writeJson(`${runId}/suite.json`, jsonClone(suite));
	await artifactStore.writeText(`${runId}/cost-ledger.jsonl`, "", "application/jsonl");
	await appendEvidenceEvent(artifactStore, runId, {
		type: "eval.run_started",
		at: startedAt,
		data: {
			adapterName,
			suiteId: suite.id,
		},
	});
}

async function writeTaskEvidenceArtifacts(
	artifactStore: EvalArtifactStore | undefined,
	runId: string,
	suiteId: string,
	task: EvalTask,
	result: EvalTaskRunResult,
): Promise<EvalTaskRunResult> {
	if (artifactStore === undefined) {
		return result;
	}

	const basePath = `${runId}/${task.id}`;
	const artifacts: EvalArtifact[] = [
		await artifactStore.writeJson(`${basePath}/score.json`, jsonClone(result.score)),
		await artifactStore.writeText(`${basePath}/stdout.log`, result.attempt.stdout),
		await artifactStore.writeText(`${basePath}/stderr.log`, result.attempt.stderr),
	];

	for (const event of result.attempt.events ?? []) {
		await appendEvidenceEvent(artifactStore, runId, {
			...event,
			data: {
				...(event.data ?? {}),
				...taskEvidenceData(suiteId, task, result.adapterName, result.attemptId),
			},
		});
	}

	for (const cost of result.attempt.costs ?? []) {
		await artifactStore.appendJsonl(`${runId}/cost-ledger.jsonl`, jsonClone(cost));
	}

	await appendEvidenceEvent(artifactStore, runId, {
		type: "eval.task_completed",
		at: result.completedAt,
		data: {
			...taskEvidenceData(suiteId, task, result.adapterName, result.attemptId),
			points: result.score.points,
			scorePassed: result.score.passed,
			status: result.status,
		},
	});

	return {
		...result,
		attempt: {
			...result.attempt,
			artifacts: [...(result.attempt.artifacts ?? []), ...artifacts],
		},
	};
}

async function appendEvidenceEvent(
	artifactStore: EvalArtifactStore | undefined,
	runId: string,
	event: EvalEvent,
): Promise<void> {
	if (artifactStore === undefined) {
		return;
	}

	await artifactStore.appendJsonl(`${runId}/events.jsonl`, jsonClone(event));
}

function taskEvidenceData(
	suiteId: string,
	task: EvalTask,
	adapterName: string,
	attemptId: string,
): JsonObject {
	return {
		adapterName,
		attemptId,
		...(task.contract === undefined ? {} : { contract: contractToJson(task.contract) }),
		suiteId,
		taskId: task.id,
	};
}

function contractToJson(contract: EvalTaskContract): JsonObject {
	return jsonClone(contract) as JsonObject;
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

function jsonClone(value: unknown): JsonValue {
	return JSON.parse(JSON.stringify(value)) as JsonValue;
}
