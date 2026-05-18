import { summarizeCostLedger, type CostLedgerSummary } from "../cost-ledger.js";
import type { EvalCostRecord, EvalSuiteRunResult, JsonObject } from "../types.js";
import {
	DEFAULT_COST_LEARNING_MODEL,
	type ModelCatalogClient,
	type OpenRouterCreditsSnapshot,
	type OpenRouterModelCatalogSnapshot,
	type OpenRouterModelEndpointSnapshot,
	computeOpenRouterCreditDeltaUsd,
} from "./model-catalog.js";

export interface OpenRouterCostLearningBatchOptions {
	batchId: string;
	runId: string;
	client: ModelCatalogClient;
	allowGenerationLookupFailures?: boolean;
	modelIds?: readonly string[];
	runBatch?: () => Promise<OpenRouterCostLearningBatchInput | void>;
	costRecords?: readonly EvalCostRecord[];
	suiteResults?: readonly EvalSuiteRunResult[];
	generationIds?: readonly string[];
	generationLookupAttempts?: number;
	generationLookupDelayMs?: number;
	runCount?: number;
	scenarioPairCount?: number;
	now?: () => Date;
}

export interface OpenRouterCostLearningBatchInput {
	costRecords?: readonly EvalCostRecord[];
	suiteResults?: readonly EvalSuiteRunResult[];
	generationIds?: readonly string[];
}

export interface OpenRouterLearnedCostEstimate {
	confidence: "provider-reconciled" | "response-usage" | "credit-delta-only" | "none";
	dollarsPerRun?: number;
	dollarsPerScenarioPair?: number;
	effectiveSpendUsd: number;
	groundTruthSpendUsd?: number;
	providerReconciledSpendUsd: number;
	runCount: number;
	scenarioPairCount?: number;
	spendBasis: "credit-delta" | "cost-records" | "none";
}

export interface OpenRouterCostLearningBatchResult {
	kind: "openrouter.cost-learning.batch.v1";
	batchId: string;
	runId: string;
	startedAt: string;
	completedAt: string;
	modelCatalog: OpenRouterModelCatalogSnapshot;
	endpoints: readonly OpenRouterModelEndpointSnapshot[];
	creditsBefore: OpenRouterCreditsSnapshot;
	creditsAfter: OpenRouterCreditsSnapshot;
	creditDeltaUsd?: number;
	inputCostRecords: readonly EvalCostRecord[];
	reconciledCostRecords: readonly EvalCostRecord[];
	fallbackCostRecords: readonly EvalCostRecord[];
	lookedUpGenerationIds: readonly string[];
	generationLookupFailures: readonly OpenRouterGenerationLookupFailure[];
	costSummary: CostLedgerSummary;
	learnedCost: OpenRouterLearnedCostEstimate;
	metadata: JsonObject;
}

export interface OpenRouterGenerationLookupFailure extends JsonObject {
	generationId: string;
	message: string;
}

export async function runOpenRouterCostLearningBatch(
	options: OpenRouterCostLearningBatchOptions,
): Promise<OpenRouterCostLearningBatchResult> {
	const now = options.now ?? (() => new Date());
	const startedAt = now().toISOString();
	const modelIds = options.modelIds ?? [DEFAULT_COST_LEARNING_MODEL];
	const modelCatalog = await options.client.snapshotModels();
	const endpoints = await options.client.snapshotCandidateEndpoints(modelIds);
	const creditsBefore = await options.client.readCredits();
	const runBatchInput = (await options.runBatch?.()) ?? {};
	const inputCostRecords = [
		...(options.costRecords ?? []),
		...(runBatchInput.costRecords ?? []),
		...costRecordsFromSuiteResults(options.suiteResults ?? []),
		...costRecordsFromSuiteResults(runBatchInput.suiteResults ?? []),
	];
	const lookedUpGenerationIds = uniqueGenerationIds([
		...(options.generationIds ?? []),
		...(runBatchInput.generationIds ?? []),
		...generationIdsFromCostRecords(inputCostRecords),
	]);
	const reconciledCostRecords: EvalCostRecord[] = [];
	const generationLookupAttempts = positiveInteger(options.generationLookupAttempts ?? 1, "generationLookupAttempts");
	const generationLookupDelayMs = nonNegativeInteger(options.generationLookupDelayMs ?? 0, "generationLookupDelayMs");
	const fallbackCostRecords: EvalCostRecord[] = [];
	const generationLookupFailures: OpenRouterGenerationLookupFailure[] = [];
	for (const generationId of lookedUpGenerationIds) {
		const role = roleForGeneration(inputCostRecords, generationId);
		const surpriseLabel = surpriseLabelForGeneration(inputCostRecords, generationId);
		try {
			reconciledCostRecords.push(await fetchGenerationCostWithRetry({
				attempts: generationLookupAttempts,
				client: options.client,
				delayMs: generationLookupDelayMs,
				generationId,
				recordOptions: {
					adapterName: adapterNameForGeneration(inputCostRecords, generationId),
					attemptId: attemptIdForGeneration(inputCostRecords, generationId),
					runId: options.runId,
					taskId: taskIdForGeneration(inputCostRecords, generationId),
					...(role === undefined ? {} : { role }),
					...(surpriseLabel === undefined ? {} : { surpriseLabel }),
				},
			}));
		} catch (error) {
			if (options.allowGenerationLookupFailures !== true) {
				throw error;
			}
			generationLookupFailures.push({
				generationId,
				message: error instanceof Error ? error.message : String(error),
			});
			const fallback = recordForGeneration(inputCostRecords, generationId);
			if (fallback !== undefined) {
				fallbackCostRecords.push(fallback);
			}
		}
	}
	const creditsAfter = await options.client.readCredits();
	const creditDeltaUsd = computeOpenRouterCreditDeltaUsd(creditsBefore, creditsAfter);
	const summaryCostRecords = [...reconciledCostRecords, ...fallbackCostRecords];
	const costSummary = summarizeCostLedger(summaryCostRecords);
	const runCount = options.runCount ?? inferRunCount(inputCostRecords, options.runId);
	const scenarioPairCount = options.scenarioPairCount;
	const learnedCost = learnedCostEstimate({
		creditDeltaUsd,
		costSummary,
		costRecords: summaryCostRecords,
		runCount,
		scenarioPairCount,
	});

	return {
		kind: "openrouter.cost-learning.batch.v1",
		batchId: options.batchId,
		runId: options.runId,
		startedAt,
		completedAt: now().toISOString(),
		modelCatalog,
		endpoints,
		creditsBefore,
		creditsAfter,
		...(creditDeltaUsd === undefined ? {} : { creditDeltaUsd }),
		inputCostRecords,
		reconciledCostRecords,
		fallbackCostRecords,
		lookedUpGenerationIds,
		generationLookupFailures,
		costSummary,
		learnedCost,
		metadata: {
			modelIds: [...modelIds],
			generationLookups: lookedUpGenerationIds.length,
			generationLookupAttempts,
			generationLookupDelayMs,
			generationLookupFailures: generationLookupFailures.length,
			inputCostRecords: inputCostRecords.length,
			creditDeltaSource:
				creditsBefore.totalUsage !== undefined && creditsAfter.totalUsage !== undefined
					? "total_usage"
					: creditsBefore.remainingCredits !== undefined && creditsAfter.remainingCredits !== undefined
						? "remaining_credits"
						: "unavailable",
		},
	};
}

async function fetchGenerationCostWithRetry(options: {
	attempts: number;
	client: ModelCatalogClient;
	delayMs: number;
	generationId: string;
	recordOptions: Parameters<ModelCatalogClient["fetchGenerationCost"]>[1];
}): Promise<EvalCostRecord> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
		try {
			return await options.client.fetchGenerationCost(options.generationId, options.recordOptions);
		} catch (error) {
			lastError = error;
			if (attempt < options.attempts && options.delayMs > 0) {
				await delay(options.delayMs);
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function generationIdsFromCostRecords(records: readonly EvalCostRecord[]): readonly string[] {
	return uniqueGenerationIds(records.map((record) => record.generationId).filter((id): id is string => id !== undefined));
}

function costRecordsFromSuiteResults(results: readonly EvalSuiteRunResult[]): EvalCostRecord[] {
	return results.flatMap((result) => result.tasks.flatMap((task) => task.attempt.costs ?? []));
}

function uniqueGenerationIds(ids: readonly string[]): string[] {
	const seen = new Set<string>();
	const output: string[] = [];
	for (const id of ids) {
		const trimmed = id.trim();
		if (trimmed !== "" && !seen.has(trimmed)) {
			seen.add(trimmed);
			output.push(trimmed);
		}
	}
	return output;
}

function positiveInteger(value: number, path: string): number {
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${path} must be a positive integer`);
	}
	return value;
}

function nonNegativeInteger(value: number, path: string): number {
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${path} must be a non-negative integer`);
	}
	return value;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function recordForGeneration(records: readonly EvalCostRecord[], generationId: string): EvalCostRecord | undefined {
	return records.find((record) => record.generationId === generationId);
}

function adapterNameForGeneration(records: readonly EvalCostRecord[], generationId: string): string {
	return recordForGeneration(records, generationId)?.adapterName ?? "unknown";
}

function attemptIdForGeneration(records: readonly EvalCostRecord[], generationId: string): string {
	return recordForGeneration(records, generationId)?.attemptId ?? `openrouter:${generationId}`;
}

function taskIdForGeneration(records: readonly EvalCostRecord[], generationId: string): string {
	return recordForGeneration(records, generationId)?.taskId ?? "unknown";
}

function roleForGeneration(records: readonly EvalCostRecord[], generationId: string): string | undefined {
	return recordForGeneration(records, generationId)?.role;
}

function surpriseLabelForGeneration(
	records: readonly EvalCostRecord[],
	generationId: string,
): EvalCostRecord["surpriseLabel"] {
	return recordForGeneration(records, generationId)?.surpriseLabel;
}

function inferRunCount(records: readonly EvalCostRecord[], fallbackRunId: string): number {
	const runIds = new Set(records.map((record) => record.runId).filter((id) => id.trim() !== ""));
	return Math.max(1, runIds.size || (fallbackRunId.trim() === "" ? 0 : 1));
}

function learnedCostEstimate(options: {
	creditDeltaUsd: number | undefined;
	costSummary: CostLedgerSummary;
	costRecords: readonly EvalCostRecord[];
	runCount: number;
	scenarioPairCount: number | undefined;
}): OpenRouterLearnedCostEstimate {
	const providerReconciledSpendUsd = options.costSummary.knownCostUsd;
	const spendBasis =
		options.creditDeltaUsd !== undefined && options.creditDeltaUsd > 0
			? "credit-delta"
			: providerReconciledSpendUsd > 0
				? "cost-records"
				: options.creditDeltaUsd !== undefined
					? "credit-delta"
					: "none";
	const effectiveSpendUsd =
		spendBasis === "credit-delta"
			? (options.creditDeltaUsd ?? 0)
			: spendBasis === "cost-records"
				? providerReconciledSpendUsd
				: 0;
	const confidence =
		options.creditDeltaUsd !== undefined && options.costRecords.some((record) => record.confidence === "provider-reconciled")
			? "provider-reconciled"
			: options.costRecords.length > 0
				? "response-usage"
				: options.creditDeltaUsd !== undefined
				? "credit-delta-only"
				: "none";
	const dollarsPerRun = options.runCount > 0 ? effectiveSpendUsd / options.runCount : undefined;
	const dollarsPerScenarioPair =
		options.scenarioPairCount !== undefined && options.scenarioPairCount > 0
			? effectiveSpendUsd / options.scenarioPairCount
			: undefined;

	return {
		confidence,
		...(dollarsPerRun === undefined ? {} : { dollarsPerRun }),
		...(dollarsPerScenarioPair === undefined ? {} : { dollarsPerScenarioPair }),
		effectiveSpendUsd,
		...(options.creditDeltaUsd === undefined ? {} : { groundTruthSpendUsd: options.creditDeltaUsd }),
		providerReconciledSpendUsd,
		runCount: options.runCount,
		...(options.scenarioPairCount === undefined ? {} : { scenarioPairCount: options.scenarioPairCount }),
		spendBasis,
	};
}
