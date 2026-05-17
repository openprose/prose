import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { summarizeCostLedger } from "./cost-ledger.js";
import { assertSafePathSegment, redactionValuesFromEnv, sanitizeAttemptResult } from "./safety.js";
import { scoreAttempt } from "./scorer.js";
import { validateEvalSuite } from "./schema.js";
import { EVAL_CLAIM_ELIGIBILITY_KIND, normalizeReportUse } from "./types.js";
import type {
	EvalAdapter,
	EvalArtifact,
	EvalArtifactStore,
	EvalAttemptResult,
	EvalClaimEligibilityGate,
	EvalClaimEligibilityReason,
	EvalClaimEligibilityReport,
	EvalCostRecord,
	EvalEvent,
	EvalSuite,
	EvalSuiteRunResult,
	EvalTask,
	EvalTaskContract,
	EvalTaskRunResult,
	JsonObject,
	JsonValue,
	ReportUse,
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
	const redactionValues = dedupeStrings([...redactionValuesFromEnv(process.env), ...redactionValuesFromEnv(options.env)]);

	await writeRunEvidenceStart(options.artifactStore, runId, suite, adapterName, startedAt);

	for (const task of suite.tasks) {
		const taskStartedAt = now().toISOString();
		const attemptIndex = 1;
		const attemptId = `${runId}:${task.id}:${attemptIndex}`;
		const startedMs = Date.now();
		const adapterRunDirectory =
			options.artifactStore === undefined
				? undefined
				: join(options.artifactStore.root, attemptEvidenceRelativePath(runId, task.id, adapterName, attemptIndex));

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
			const attemptWithFilteredCosts = filterCostRecordsForAttempt(
				attemptWithDuration,
				{ adapterName, attemptId, runId, taskId: task.id },
				now().toISOString(),
			);
			const attemptWithCost = ensureCostRecordIfRequired(
				attemptWithFilteredCosts,
				task,
				adapterName,
				runId,
				attemptId,
				now().toISOString(),
			);
			const sanitizedAttempt = sanitizeAttemptResult(attemptWithCost, {
				redactionValues,
				...(options.maxOutputChars === undefined ? {} : { maxTextLength: options.maxOutputChars }),
			});
			const result = buildTaskResult(task, adapterName, attemptId, taskStartedAt, now().toISOString(), sanitizedAttempt);
			const resultWithEvidence = await writeTaskEvidenceArtifacts(
				options.artifactStore,
				runId,
				suite.id,
				task,
				attemptIndex,
				result,
			);
			tasks.push(resultWithEvidence);
			await writeTaskResultArtifacts(options.artifactStore, runId, attemptIndex, resultWithEvidence);

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
	const claimEligibility = buildClaimEligibilityReport(suite, adapterName, runId, completedAt, tasks);
	const result: EvalSuiteRunResult = {
		adapterName,
		claimEligibility,
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
	await options.artifactStore?.writeJson(`${runId}/claim-eligibility.json`, jsonClone(claimEligibility));
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
	attemptIndex: number,
	result: EvalTaskRunResult,
): Promise<EvalTaskRunResult> {
	if (artifactStore === undefined) {
		return result;
	}

	const basePath = attemptEvidenceRelativePath(runId, task.id, result.adapterName, attemptIndex);
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

async function writeTaskResultArtifacts(
	artifactStore: EvalArtifactStore | undefined,
	runId: string,
	attemptIndex: number,
	result: EvalTaskRunResult,
): Promise<void> {
	if (artifactStore === undefined) {
		return;
	}

	const canonicalPath = attemptEvidenceRelativePath(runId, result.taskId, result.adapterName, attemptIndex);
	await artifactStore.writeJson(`${canonicalPath}/result.json`, jsonClone(result));
	await artifactStore.writeJson(`${runId}/${result.taskId}/result.json`, jsonClone(result));
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

function attemptEvidenceRelativePath(runId: string, taskId: string, adapterName: string, attemptIndex: number): string {
	return `${runId}/attempts/${taskId}/${adapterName}/attempt-${attemptIndex}`;
}

interface CostRecordIdentity {
	adapterName: string;
	attemptId: string;
	runId: string;
	taskId: string;
}

function filterCostRecordsForAttempt(
	attempt: EvalAttemptResult,
	expected: CostRecordIdentity,
	at: string,
): EvalAttemptResult {
	if (attempt.costs === undefined) {
		return attempt;
	}

	const costs: EvalCostRecord[] = [];
	const mismatchEvents: EvalEvent[] = [];
	for (const cost of attempt.costs) {
		const mismatchedFields = mismatchedCostIdentityFields(cost, expected);
		if (mismatchedFields.length === 0) {
			costs.push(cost);
			continue;
		}

		mismatchEvents.push({
			type: "eval.cost_record_mismatch",
			at,
			message: "Ignored adapter-emitted cost record because its run identity does not match this attempt.",
			data: {
				actual: costIdentityToJson(cost),
				costRecordId: jsonScalar(cost.id),
				expected: costIdentityToJson(expected),
				mismatchedFields,
			},
		});
	}

	if (mismatchEvents.length === 0) {
		return attempt;
	}

	return {
		...attempt,
		costs,
		events: [...(attempt.events ?? []), ...mismatchEvents],
		metadata: {
			...(attempt.metadata ?? {}),
			costRecordMismatchCount: mismatchEvents.length,
		},
	};
}

function mismatchedCostIdentityFields(cost: EvalCostRecord, expected: CostRecordIdentity): string[] {
	const mismatchedFields: string[] = [];
	for (const field of ["runId", "taskId", "attemptId", "adapterName"] as const) {
		if (cost[field] !== expected[field]) {
			mismatchedFields.push(field);
		}
	}

	return mismatchedFields;
}

function costIdentityToJson(identity: Partial<CostRecordIdentity>): JsonObject {
	return {
		adapterName: jsonScalar(identity.adapterName),
		attemptId: jsonScalar(identity.attemptId),
		runId: jsonScalar(identity.runId),
		taskId: jsonScalar(identity.taskId),
	};
}

function jsonScalar(value: unknown): JsonValue {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
		return value;
	}

	if (value === undefined) {
		return null;
	}

	return String(value);
}

function buildClaimEligibilityReport(
	suite: EvalSuite,
	adapterName: string,
	runId: string,
	generatedAt: string,
	tasks: readonly EvalTaskRunResult[],
): EvalClaimEligibilityReport {
	const gates: EvalClaimEligibilityGate[] = [];
	const reasons: EvalClaimEligibilityReason[] = [];
	const reportUses = collectReportUses(suite, tasks);
	const reportUseValues = [...reportUses].sort();
	const reportUsePassed = reportUses.size === 1 && reportUses.has("report-eligible");
	gates.push({
		name: "reportUse",
		passed: reportUsePassed,
		actual: reportUseValues,
		expected: "report-eligible",
	});
	if (reportUses.size === 0) {
		reasons.push({
			code: "missing_report_use",
			message: "No canonical reportUse metadata was present for this run.",
			scope: "run",
		});
	}
	if (reportUses.has("debug")) {
		reasons.push({
			code: "debug_report_use",
			message: "Debug runs are not eligible for claims reporting.",
			actual: "debug",
			expected: "report-eligible",
			scope: "run",
		});
	}
	if (reportUses.has("adapter-canary")) {
		reasons.push({
			code: "adapter_canary_report_use",
			message: "Adapter canaries are not eligible for claims reporting.",
			actual: "adapter-canary",
			expected: "report-eligible",
			scope: "run",
		});
	}

	const mockAdapter = adapterName === "mock" || tasks.some((task) => task.attempt.metadata?.adapterKind === "mock");
	gates.push({
		name: "adapter",
		passed: !mockAdapter,
		actual: adapterName,
		expected: "non-mock adapter",
	});
	if (mockAdapter) {
		reasons.push({
			code: "mock_adapter",
			message: "Mock adapter output is smoke-test evidence only.",
			actual: adapterName,
			expected: "non-mock adapter",
			scope: "run",
		});
	}

	for (const task of tasks) {
		pushTaskEvidenceGate(gates, reasons, task, "normalizedTrace", "missing_normalized_trace", "normalized trace");
		pushTaskEvidenceGate(gates, reasons, task, "receipts", "missing_receipts", "receipts");
		pushTaskEvidenceGate(gates, reasons, task, "replay", "missing_replay", "replay");
	}

	return {
		adapterName,
		generatedAt,
		gates,
		kind: EVAL_CLAIM_ELIGIBILITY_KIND,
		reasons,
		reportEligible: reasons.length === 0,
		runId,
		suiteId: suite.id,
		version: 1,
	};
}

function collectReportUses(suite: EvalSuite, tasks: readonly EvalTaskRunResult[]): Set<ReportUse> {
	const reportUses = new Set<ReportUse>();
	addReportUseFromMetadata(reportUses, suite.metadata);
	for (const task of suite.tasks) {
		addReportUseFromMetadata(reportUses, task.metadata);
	}
	for (const task of tasks) {
		addReportUseFromMetadata(reportUses, task.attempt.metadata);
	}

	return reportUses;
}

function addReportUseFromMetadata(reportUses: Set<ReportUse>, metadata: JsonObject | undefined): void {
	const reportUse = normalizeReportUse(metadata?.reportUse);
	if (reportUse !== undefined) {
		reportUses.add(reportUse);
	}
	if (metadata?.debugOnly === true) {
		reportUses.add("debug");
	}
}

type TaskEvidenceKind = "normalizedTrace" | "receipts" | "replay";

function pushTaskEvidenceGate(
	gates: EvalClaimEligibilityGate[],
	reasons: EvalClaimEligibilityReason[],
	task: EvalTaskRunResult,
	kind: TaskEvidenceKind,
	code: EvalClaimEligibilityReason["code"],
	label: string,
): void {
	const present = hasTaskEvidence(task, kind);
	gates.push({
		name: `task.${kind}`,
		passed: present,
		actual: present,
		expected: true,
		taskId: task.taskId,
	});
	if (!present) {
		reasons.push({
			code,
			message: `Missing ${label} evidence for claim reporting.`,
			actual: false,
			expected: true,
			scope: "task",
			taskId: task.taskId,
		});
	}
}

function hasTaskEvidence(task: EvalTaskRunResult, kind: TaskEvidenceKind): boolean {
	const metadata = task.attempt.metadata;
	if (metadataFlag(metadata, kind) || metadataFlag(metadata, `has${capitalize(kind)}`)) {
		return true;
	}

	const metadataPathKeys = evidenceMetadataPathKeys(kind);
	for (const key of metadataPathKeys) {
		if (typeof metadata?.[key] === "string" && (metadata[key] as string).trim() !== "") {
			return true;
		}
	}

	const pathPattern = evidencePathPattern(kind);
	for (const artifact of task.attempt.artifacts ?? []) {
		if (pathPattern.test(artifact.path)) {
			return true;
		}
	}

	for (const event of task.attempt.events ?? []) {
		if (pathPattern.test(event.type)) {
			return true;
		}
	}

	return false;
}

function metadataFlag(metadata: JsonObject | undefined, key: string): boolean {
	return metadata?.[key] === true;
}

function evidenceMetadataPathKeys(kind: TaskEvidenceKind): readonly string[] {
	if (kind === "normalizedTrace") {
		return ["normalizedTracePath", "tracePath"];
	}
	if (kind === "receipts") {
		return ["receiptPath", "receiptsPath"];
	}

	return ["replayPath"];
}

function evidencePathPattern(kind: TaskEvidenceKind): RegExp {
	if (kind === "normalizedTrace") {
		return /normalized[-_]?trace|trace[-_]?normalized/i;
	}
	if (kind === "receipts") {
		return /receipts?/i;
	}

	return /replay/i;
}

function capitalize(value: string): string {
	return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
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

function dedupeStrings(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function jsonClone(value: unknown): JsonValue {
	return JSON.parse(JSON.stringify(value)) as JsonValue;
}
