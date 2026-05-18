import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	PHASE_1B_REACTOR_SCENARIO_CORPUS,
	PHASE_1B_REACTOR_SCENARIO_FAMILY_IDS,
	getPhase1bScenarioMetadata,
	type Phase1bScenarioFamilyId,
} from "../scenarios/phase-1b-corpus.js";
import type { ModelCatalogClient } from "../costs/model-catalog.js";
import {
	runOpenRouterCostLearningBatch,
	type OpenRouterCostLearningBatchOptions,
	type OpenRouterCostLearningBatchResult,
} from "../costs/cost-learning.js";
import {
	createAdaptiveCronTimelineAdapter,
	type AdaptiveCronTimelineAdapterOptions,
} from "../timeline-adapters/adaptive-cron.js";
import { createDiffcachePlusTimelineAdapter } from "../timeline-adapters/diffcache-plus.js";
import { createDiffcacheTimelineAdapter } from "../timeline-adapters/diffcache.js";
import { createIdealCronTimelineAdapter } from "../timeline-adapters/ideal-cron.js";
import { createTunedTtlTimelineAdapter } from "../timeline-adapters/tuned-ttl.js";
import {
	createCodexTimelineAdapter,
	createDspyRlmTimelineAdapter,
	createHermesTimelineAdapter,
	createOpenClawTimelineAdapter,
	createPiTimelineAdapter,
	type DspyRlmTimelineAdapterOptions,
	type HermesTimelineAdapterOptions,
	type PiTimelineAdapterOptions,
} from "../timeline-adapters/competitors.js";
import { runReactorTimelineCase } from "../timeline-runner.js";
import type {
	CostConfidence,
	EvalCostRecord,
	JsonObject,
	JsonValue,
	ReactorTimelineAdapter,
	ReactorTimelineCase,
	ReactorTimelineEvent,
	ReactorTimelineRunResult,
	ReactorTimelineStepResult,
	ReportUse,
} from "../types.js";
import {
	mcnemarExact,
	pairedPowerPilot,
	wilcoxonSignedRank,
	type McNemarExactResult,
	type PairedPowerPilotResult,
	type WilcoxonSignedRankResult,
} from "./statistics.js";

export type Phase1bDecisionClass = "act" | "compute" | "escalate" | "recheck" | "reuse" | "skip";
export type Phase1bResultStatus = "passed" | "failed" | "not-run";
export type Phase1bEvidenceUse = "deterministic-oracle" | "external-context";
export type Phase1bArmKind = "baseline" | "competitor" | "scaffold";
export type Phase1bCostConfidence = CostConfidence | "none";
export type Phase1bPilotStageName = "n=3-pilot" | "expanded-pilot";

export interface Phase1bBaselineRunOptions {
	adapters?: readonly ReactorTimelineAdapter[];
	env?: Readonly<Record<string, string | undefined>>;
	scenarioLimitPerFamily?: number;
	scenarios?: readonly ReactorTimelineCase[];
	scenarioCacheRoot?: string;
	runId?: string;
	now?: () => Date;
}

export interface Phase1bCompetitorAdapterOptions {
	codexName?: string;
	dspy?: DspyRlmTimelineAdapterOptions;
	hermes?: HermesTimelineAdapterOptions;
	includeFailClosedScaffolds?: boolean;
	openClawName?: string;
	pi?: PiTimelineAdapterOptions;
}

export interface Phase1bReportMinusReactorPilotOptions extends Phase1bBaselineRunOptions {
	budgetMaxUsd?: number;
	costBatchId?: string;
	costClient?: ModelCatalogClient;
	costLearning?: Partial<
		Omit<
			OpenRouterCostLearningBatchOptions,
			"batchId" | "client" | "costRecords" | "runBatch" | "runCount" | "runId" | "scenarioPairCount" | "suiteResults"
		>
	>;
	stageName?: Phase1bPilotStageName;
}

export interface Phase1bResultRow {
	adapterName: string;
	armKind: Phase1bArmKind;
	caseId: string;
	costConfidence: Phase1bCostConfidence;
	evidenceUse: Phase1bEvidenceUse;
	familyId: Phase1bScenarioFamilyId;
	notRunReason?: string;
	receiptRecordShape: "openprose.receipt.v0-observable";
	reportUse: ReportUse;
	status: Phase1bResultStatus;
	traceScore: number;
	correctEvents: number;
	totalEvents: number;
	modelCalls: number;
	cacheHits: number;
	acted: number;
	escalated: number;
	rechecked: number;
	costUsd: number;
	steps: readonly Phase1bStepScore[];
}

export interface Phase1bStepScore {
	eventId: string;
	expected: Phase1bDecisionClass;
	observed: Phase1bDecisionClass;
	correct: boolean;
	modelCalls: number;
	receipt: Phase1bOpenProseReceiptV0Observation;
}

export interface Phase1bResultsTableRow {
	adapterName: string;
	armKind: Phase1bArmKind;
	costConfidence: Phase1bCostConfidence;
	evidenceUse: Phase1bEvidenceUse;
	familyId: Phase1bScenarioFamilyId;
	reportUse: ReportUse;
	status: Phase1bResultStatus;
	cases: number;
	meanTraceScore: number;
	totalModelCalls: number;
	totalCostUsd: number;
}

export interface Phase1bStatisticalPilotResult {
	familyId?: Phase1bScenarioFamilyId;
	leftAdapterName: string;
	rightAdapterName: string;
	n: number;
	wilcoxonModelCalls: WilcoxonSignedRankResult;
	mcnemarTraceCorrect: McNemarExactResult;
	powerPilot: PairedPowerPilotResult;
}

export interface Phase1bPilotCostStage {
	budgetMaxUsd: number;
	creditDeltaUsd?: number;
	effectiveSpendUsd: number;
	providerReconciledSpendUsd: number;
	confidence: "provider-reconciled" | "response-usage" | "credit-delta-only" | "none";
	projectedN12Usd: number;
	runCount: number;
	scenarioCount: number;
	stageName: Phase1bPilotStageName;
	withinBudgetForN12: boolean;
}

export interface Phase1bReportMinusReactorPilotResult {
	kind: "prose.eval.phase-1b.report-minus-reactor-pilot.v1";
	budgetMaxUsd: number;
	costLearning?: OpenRouterCostLearningBatchResult;
	costStage: Phase1bPilotCostStage;
	noReactorRow: true;
	rows: readonly Phase1bResultRow[];
	scenarioCount: number;
	stageName: Phase1bPilotStageName;
	statistics: readonly Phase1bStatisticalPilotResult[];
	tables: readonly Phase1bResultsTableRow[];
}

export interface Phase1bOpenProseReceiptV0Observation extends JsonObject {
	kind: "openprose.receipt.v0.observable";
	v: 0;
	core: JsonObject;
	sig: JsonObject;
	verdict: JsonObject;
	freshness: JsonObject;
	composition: JsonObject;
	cost: JsonObject;
}

interface Phase1bRunRowsResult {
	costRecords: readonly EvalCostRecord[];
	rows: readonly Phase1bResultRow[];
	scenarios: readonly ReactorTimelineCase[];
}

export function createPhase1bBaselineAdapters(): readonly ReactorTimelineAdapter[] {
	const adaptiveOptions: AdaptiveCronTimelineAdapterOptions = {
		initialIntervalMs: 60 * 60 * 1000,
		maxIntervalMs: 24 * 60 * 60 * 1000,
	};

	return [
		createDiffcacheTimelineAdapter(),
		createDiffcachePlusTimelineAdapter(),
		createIdealCronTimelineAdapter(),
		createAdaptiveCronTimelineAdapter(adaptiveOptions),
		createTunedTtlTimelineAdapter(),
	];
}

export function createPhase1bCompetitorAdapters(
	options: Phase1bCompetitorAdapterOptions = {},
): readonly ReactorTimelineAdapter[] {
	const adapters: ReactorTimelineAdapter[] = [
		createPiTimelineAdapter(options.pi),
		createHermesTimelineAdapter(options.hermes),
		createDspyRlmTimelineAdapter(options.dspy),
	];

	if (options.includeFailClosedScaffolds ?? true) {
		adapters.push(
			createCodexTimelineAdapter({ name: options.codexName ?? "codex" }),
			createOpenClawTimelineAdapter({ name: options.openClawName ?? "openclaw" }),
		);
	}

	return adapters;
}

export function createPhase1bReportMinusReactorAdapters(
	options: Phase1bCompetitorAdapterOptions = {},
): readonly ReactorTimelineAdapter[] {
	return [...createPhase1bBaselineAdapters(), ...createPhase1bCompetitorAdapters(options)];
}

export async function runPhase1bBaselinePilot(
	options: Phase1bBaselineRunOptions = {},
): Promise<readonly Phase1bResultRow[]> {
	const adapters = options.adapters ?? createPhase1bBaselineAdapters();
	return (await runPhase1bRows({ ...options, adapters })).rows;
}

export async function runPhase1bReportMinusReactorPilot(
	options: Phase1bReportMinusReactorPilotOptions = {},
): Promise<Phase1bReportMinusReactorPilotResult> {
	const budgetMaxUsd = options.budgetMaxUsd ?? 500;
	const stageName = options.stageName ?? "n=3-pilot";
	const adapters = options.adapters ?? createPhase1bReportMinusReactorAdapters();
	let runRowsResult: Phase1bRunRowsResult | undefined;
	const runId = options.runId ?? "phase-1b-report-minus-reactor-pilot";

	const runRows = async (): Promise<Phase1bRunRowsResult> => {
		runRowsResult = await runPhase1bRows({
			...options,
			adapters,
			runId,
			scenarioLimitPerFamily: options.scenarioLimitPerFamily ?? 3,
		});
		return runRowsResult;
	};

	let costLearning: OpenRouterCostLearningBatchResult | undefined;
	if (options.costClient === undefined) {
		runRowsResult = await runRows();
	} else {
		costLearning = await runOpenRouterCostLearningBatch({
			...(options.costLearning ?? {}),
			batchId: options.costBatchId ?? `${runId}-${stageName}`,
			client: options.costClient,
			runBatch: async () => {
				const result = await runRows();
				return {
					costRecords: result.costRecords,
				};
			},
			runCount: adapters.length * selectedScenarioCount(runRowsResult?.scenarios, options),
			runId,
			scenarioPairCount: selectedScenarioCount(runRowsResult?.scenarios, options),
		});
	}

	if (runRowsResult === undefined) {
		throw new Error("Phase-1b pilot did not produce rows");
	}

	const rows =
		costLearning === undefined
			? runRowsResult.rows
			: applyProviderReconciledCosts(runRowsResult.rows, costLearning.reconciledCostRecords, costLearning.fallbackCostRecords);
	const tables = summarizePhase1bResults(rows);
	const statistics = phase1bFamilyStatisticalPilots(rows);
	const costStage = phase1bPilotCostStage({
		budgetMaxUsd,
		costLearning,
		rows,
		scenarioCount: runRowsResult.scenarios.length,
		stageName,
	});

	return {
		kind: "prose.eval.phase-1b.report-minus-reactor-pilot.v1",
		budgetMaxUsd,
		...(costLearning === undefined ? {} : { costLearning }),
		costStage,
		noReactorRow: true,
		rows,
		scenarioCount: runRowsResult.scenarios.length,
		stageName,
		statistics,
		tables,
	};
}

async function runPhase1bRows(options: Phase1bBaselineRunOptions): Promise<Phase1bRunRowsResult> {
	const adapters = options.adapters ?? createPhase1bBaselineAdapters();
	const scenarios = selectPilotScenarios(options.scenarios ?? PHASE_1B_REACTOR_SCENARIO_CORPUS, options.scenarioLimitPerFamily ?? 3);
	const scenarioCacheRoot =
		options.scenarioCacheRoot ?? (await mkdtemp(join(tmpdir(), "prose-phase-1b-results-cache-")));
	const runId = options.runId ?? "phase-1b-non-reactor-pilot";
	const rows: Phase1bResultRow[] = [];
	const costRecords: EvalCostRecord[] = [];

	for (const adapter of adapters) {
		for (const scenario of scenarios) {
			const result = await runReactorTimelineCase(scenario, adapter, {
				...(options.env === undefined ? {} : { env: options.env }),
				runId: `${runId}-${adapter.name}-${scenario.id}`,
				scenarioCacheRoot,
				...(options.now === undefined ? {} : { now: options.now }),
			});
			costRecords.push(...result.costs);
			rows.push(scorePhase1bTimelineRun(scenario, result));
		}
	}

	return { costRecords, rows, scenarios };
}

export function scorePhase1bTimelineRun(
	timelineCase: ReactorTimelineCase,
	result: ReactorTimelineRunResult,
): Phase1bResultRow {
	const metadata = getPhase1bScenarioMetadata(timelineCase);
	const goldByEventId = new Map(metadata.goldTrace.map((entry) => [entry.eventId, entry]));
	const steps = timelineCase.events.map((event, index) => {
		const step = result.steps[index];
		const expected = expectedDecisionClass(event, goldByEventId.get(event.id)?.expected ?? "");
		const receipt = phase1bOpenProseReceiptV0Observation({
			event,
			expected,
			result,
			step,
			timelineCase,
		});
		const observed = observedDecisionClassFromReceipt(receipt);
		const modelCalls = finiteMetric(step?.metrics?.modelCalls);
		return {
			eventId: event.id,
			expected,
			observed,
			correct: decisionMatches(expected, observed),
			modelCalls,
			receipt,
		};
	});
	const correctEvents = steps.filter((step) => step.correct).length;
	const totalEvents = timelineCase.events.length;
	const armKind = armKindForAdapter(result.adapterName);
	const reportUse: ReportUse = "adapter-canary";
	const evidenceUse: Phase1bEvidenceUse = armKind === "competitor" ? "external-context" : "deterministic-oracle";
	const costConfidence = summarizeRowCostConfidence(result.costs, sumStepMetric(result.steps, "modelCalls"));

	return {
		adapterName: result.adapterName,
		armKind,
		caseId: timelineCase.id,
		costConfidence,
		evidenceUse,
		familyId: metadata.familyId,
		receiptRecordShape: "openprose.receipt.v0-observable",
		reportUse,
		status: result.status,
		traceScore: totalEvents === 0 ? 0 : correctEvents / totalEvents,
		correctEvents,
		totalEvents,
		modelCalls: sumStepMetric(result.steps, "modelCalls"),
		cacheHits: sumStepMetric(result.steps, "cacheHit"),
		acted: sumStepMetric(result.steps, "acted"),
		escalated: sumStepMetric(result.steps, "escalated"),
		rechecked: sumStepMetric(result.steps, "rechecked"),
		costUsd: result.costs.reduce((sum, record) => sum + (record.totalCostUsd ?? 0), 0),
		steps,
	};
}

export function summarizePhase1bResults(rows: readonly Phase1bResultRow[]): readonly Phase1bResultsTableRow[] {
	const groups = new Map<string, Phase1bResultRow[]>();
	for (const row of rows) {
		const key = `${row.adapterName}\0${row.familyId}\0${row.status}\0${row.reportUse}\0${row.evidenceUse}\0${row.costConfidence}`;
		groups.set(key, [...(groups.get(key) ?? []), row]);
	}

	return [...groups.values()]
		.map((group) => {
			const first = group[0];
			if (first === undefined) {
				throw new Error("empty Phase-1b result group");
			}
			return {
				adapterName: first.adapterName,
				armKind: first.armKind,
				costConfidence: first.costConfidence,
				evidenceUse: first.evidenceUse,
				familyId: first.familyId,
				reportUse: first.reportUse,
				status: first.status,
				cases: group.length,
				meanTraceScore: mean(group.map((row) => row.traceScore)),
				totalModelCalls: group.reduce((sum, row) => sum + row.modelCalls, 0),
				totalCostUsd: group.reduce((sum, row) => sum + row.costUsd, 0),
			};
		})
		.sort((left, right) => left.adapterName.localeCompare(right.adapterName) || left.familyId.localeCompare(right.familyId));
}

export function phase1bStatisticalPilot(
	rows: readonly Phase1bResultRow[],
	leftAdapterName: string,
	rightAdapterName: string,
): Phase1bStatisticalPilotResult {
	const pairs = pairedRows(rows, leftAdapterName, rightAdapterName);
	const left = pairs.map((pair) => pair.left);
	const right = pairs.map((pair) => pair.right);
	return {
		leftAdapterName,
		rightAdapterName,
		n: pairs.length,
		wilcoxonModelCalls: wilcoxonSignedRank(
			left.map((row) => row.modelCalls),
			right.map((row) => row.modelCalls),
		),
		mcnemarTraceCorrect: mcnemarExact(
			left.map((row) => row.traceScore === 1),
			right.map((row) => row.traceScore === 1),
		),
		powerPilot: pairedPowerPilot(
			left.map((row) => row.modelCalls),
			right.map((row) => row.modelCalls),
			left.map((row) => row.traceScore === 1),
			right.map((row) => row.traceScore === 1),
		),
	};
}

export function phase1bFamilyStatisticalPilots(
	rows: readonly Phase1bResultRow[],
	comparisons: readonly [string, string][] = [
		["diffcache", "ideal-cron"],
		["adaptive-cron", "tuned-ttl"],
	],
): readonly Phase1bStatisticalPilotResult[] {
	const results: Phase1bStatisticalPilotResult[] = [];
	for (const familyId of PHASE_1B_REACTOR_SCENARIO_FAMILY_IDS) {
		const familyRows = rows.filter((row) => row.familyId === familyId && row.status !== "not-run");
		for (const [leftAdapterName, rightAdapterName] of comparisons) {
			const pairs = pairedRows(familyRows, leftAdapterName, rightAdapterName);
			if (pairs.length > 0) {
				results.push({
					...phase1bStatisticalPilot(familyRows, leftAdapterName, rightAdapterName),
					familyId,
				});
			}
		}
	}
	return results;
}

export function notRunPhase1bCompetitorRows(
	scenarios: readonly ReactorTimelineCase[],
	adapterNames: readonly string[] = ["pi", "hermes", "dspy-rlm"],
): readonly Phase1bResultRow[] {
	return adapterNames.flatMap((adapterName) =>
		scenarios.map((scenario) => {
			const metadata = getPhase1bScenarioMetadata(scenario);
			return {
				adapterName,
				armKind: armKindForAdapter(adapterName),
				caseId: scenario.id,
				costConfidence: "none" as const,
				evidenceUse: "external-context" as const,
				familyId: metadata.familyId,
				notRunReason: "competitor execution was not run for this Phase-1b slice",
				receiptRecordShape: "openprose.receipt.v0-observable" as const,
				reportUse: "adapter-canary" as const,
				status: "not-run" as const,
				traceScore: 0,
				correctEvents: 0,
				totalEvents: scenario.events.length,
				modelCalls: 0,
				cacheHits: 0,
				acted: 0,
				escalated: 0,
				rechecked: 0,
				costUsd: 0,
				steps: [],
			};
		}),
	);
}

function selectedScenarioCount(
	alreadySelected: readonly ReactorTimelineCase[] | undefined,
	options: Phase1bBaselineRunOptions,
): number {
	if (alreadySelected !== undefined) {
		return alreadySelected.length;
	}
	return selectPilotScenarios(
		options.scenarios ?? PHASE_1B_REACTOR_SCENARIO_CORPUS,
		options.scenarioLimitPerFamily ?? 3,
	).length;
}

function phase1bPilotCostStage(options: {
	budgetMaxUsd: number;
	costLearning: OpenRouterCostLearningBatchResult | undefined;
	rows: readonly Phase1bResultRow[];
	scenarioCount: number;
	stageName: Phase1bPilotStageName;
}): Phase1bPilotCostStage {
	const runCount = options.rows.length;
	const providerReconciledSpendUsd =
		options.costLearning?.learnedCost.providerReconciledSpendUsd ??
		options.rows.reduce((sum, row) => sum + (row.costConfidence === "provider-reconciled" ? row.costUsd : 0), 0);
	const effectiveSpendUsd =
		options.costLearning?.learnedCost.effectiveSpendUsd ??
		options.rows.reduce((sum, row) => sum + row.costUsd, 0);
	const pilotScenarioPerFamily = Math.max(1, Math.floor(options.scenarioCount / PHASE_1B_REACTOR_SCENARIO_FAMILY_IDS.length));
	const projectedN12Usd = (effectiveSpendUsd / pilotScenarioPerFamily) * 12;

	return {
		budgetMaxUsd: options.budgetMaxUsd,
		...(options.costLearning?.creditDeltaUsd === undefined ? {} : { creditDeltaUsd: options.costLearning.creditDeltaUsd }),
		effectiveSpendUsd,
		providerReconciledSpendUsd,
		confidence: options.costLearning?.learnedCost.confidence ?? bestRowsCostConfidence(options.rows),
		projectedN12Usd,
		runCount,
		scenarioCount: options.scenarioCount,
		stageName: options.stageName,
		withinBudgetForN12: projectedN12Usd <= options.budgetMaxUsd,
	};
}

function applyProviderReconciledCosts(
	rows: readonly Phase1bResultRow[],
	reconciledRecords: readonly EvalCostRecord[],
	fallbackRecords: readonly EvalCostRecord[],
): readonly Phase1bResultRow[] {
	const allKnownRecords = [...reconciledRecords, ...fallbackRecords];
	return rows.map((row) => {
		const records = allKnownRecords.filter((record) => costRecordBelongsToRow(record, row));
		if (records.length === 0) {
			return row;
		}
		const costUsd = records.reduce((sum, record) => sum + (record.totalCostUsd ?? 0), 0);
		return {
			...row,
			costConfidence: summarizeRowCostConfidence(records, row.modelCalls),
			costUsd,
		};
	});
}

function costRecordBelongsToRow(record: EvalCostRecord, row: Phase1bResultRow): boolean {
	if (record.adapterName !== row.adapterName) {
		return false;
	}
	const taskIds = new Set(row.steps.map((step) => `${row.caseId}-${step.eventId}`));
	return taskIds.has(record.taskId);
}

function phase1bOpenProseReceiptV0Observation(options: {
	event: ReactorTimelineEvent;
	expected: Phase1bDecisionClass;
	result: ReactorTimelineRunResult;
	step: ReactorTimelineStepResult | undefined;
	timelineCase: ReactorTimelineCase;
}): Phase1bOpenProseReceiptV0Observation {
	const observed = observedDecisionClass(options.step);
	const modelCalls = finiteMetric(options.step?.metrics?.modelCalls);
	const cacheHits = finiteMetric(options.step?.metrics?.cacheHit);
	const totalTokens = sumCostMetric(options.step?.costs, "totalTokens");
	const freshTokens = modelCalls > 0 ? totalTokens : 0;
	const reusedTokens = cacheHits > 0 ? totalTokens : 0;
	return {
		kind: "openprose.receipt.v0.observable",
		v: 0,
		core: {
			as_of: options.event.at,
			event_cause: eventCause(options.event, observed),
			evidence_input_ids: [options.event.payloadCid ?? options.event.id],
			memo_key: options.event.payloadCid ?? options.event.id,
			recheck_kind: options.event.trigger === "scheduled" ? "evidence-age" : "plan-age",
			responsibility_id: options.timelineCase.contract.source.responsibilityId,
			role: "eval-observer",
		},
		sig: {
			null_reason: "Phase-1b observable behavior row; not a Reactor attestation.",
			scheme: "none",
		},
		verdict: {
			blocked_reason: observed === "escalate" ? options.event.label : null,
			confidence: 1,
			derivation: modelCalls > 0 ? "authored" : cacheHits > 0 ? "accrued" : "none",
			expected_trace_decision: options.expected,
			status: observed,
			trace_decision: observed,
		},
		freshness: {
			as_of: options.event.at,
			consumed_freshness_evaluated: options.event.trigger === "scheduled",
			next_forecast_recheck: null,
			transitive_freshness_policy_ref: options.timelineCase.oracle.policyCid,
		},
		composition: {
			consumed_receipts: [],
			cycle_checked: true,
		},
		cost: {
			provider_norm: {
				confidence: summarizeRowCostConfidence(options.step?.costs ?? [], modelCalls),
			},
			surprise_cause: options.event.label,
			tokens: {
				fresh: freshTokens,
				reused: reusedTokens,
				total: totalTokens,
			},
		},
	};
}

function observedDecisionClassFromReceipt(receipt: Phase1bOpenProseReceiptV0Observation): Phase1bDecisionClass {
	const verdict = receipt.verdict;
	const decision = typeof verdict.trace_decision === "string" ? verdict.trace_decision : undefined;
	return isDecisionClass(decision) ? decision : "skip";
}

function selectPilotScenarios(
	scenarios: readonly ReactorTimelineCase[],
	limitPerFamily: number,
): ReactorTimelineCase[] {
	if (!Number.isInteger(limitPerFamily) || limitPerFamily < 1) {
		throw new Error(`scenarioLimitPerFamily must be a positive integer: ${limitPerFamily}`);
	}
	const counts = new Map<Phase1bScenarioFamilyId, number>();
	const selected: ReactorTimelineCase[] = [];
	for (const scenario of scenarios) {
		const metadata = getPhase1bScenarioMetadata(scenario);
		const count = counts.get(metadata.familyId) ?? 0;
		if (count < limitPerFamily) {
			selected.push(scenario);
			counts.set(metadata.familyId, count + 1);
		}
	}
	for (const familyId of PHASE_1B_REACTOR_SCENARIO_FAMILY_IDS) {
		if ((counts.get(familyId) ?? 0) < limitPerFamily) {
			throw new Error(`not enough scenarios for ${familyId}: wanted ${limitPerFamily}`);
		}
	}
	return selected;
}

function expectedDecisionClass(event: ReactorTimelineEvent, expectedText: string): Phase1bDecisionClass {
	const expected = expectedText.toLowerCase();
	const type = event.type.toLowerCase();
	if (event.label === "escalation" || expected.includes("escalate") || expected.includes("interrupt")) {
		return "escalate";
	}
	if (event.trigger === "scheduled" || type.includes("recheck")) {
		return "recheck";
	}
	if (event.label === "noop") {
		return "skip";
	}
	if (type.includes("external_action") || expected.includes("action")) {
		return "act";
	}
	return "compute";
}

function observedDecisionClass(step: ReactorTimelineStepResult | undefined): Phase1bDecisionClass {
	const decision = stringMetadata(step?.metadata, "decision");
	if (isDecisionClass(decision)) {
		return decision;
	}
	const observable = objectMetadata(step?.metadata, "observable");
	if (numberMetric(step?.metrics?.escalated) > 0 || observable?.escalated === true) {
		return "escalate";
	}
	if (numberMetric(step?.metrics?.rechecked) > 0 || observable?.rechecked === true) {
		return "recheck";
	}
	if (numberMetric(step?.metrics?.acted) > 0 || observable?.acted === true) {
		return "act";
	}
	if (numberMetric(step?.metrics?.cacheHit) > 0) {
		return "reuse";
	}
	return numberMetric(step?.metrics?.modelCalls) > 0 ? "compute" : "skip";
}

function decisionMatches(expected: Phase1bDecisionClass, observed: Phase1bDecisionClass): boolean {
	if (expected === observed) {
		return true;
	}
	if (expected === "skip" && observed === "reuse") {
		return true;
	}
	if (expected === "act" && observed === "compute") {
		return true;
	}
	return false;
}

function sumStepMetric(steps: readonly ReactorTimelineStepResult[], key: string): number {
	return steps.reduce((sum, step) => sum + finiteMetric(step.metrics?.[key]), 0);
}

function finiteMetric(value: number | undefined): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberMetric(value: number | undefined): number {
	return finiteMetric(value);
}

function stringMetadata(metadata: JsonObject | undefined, key: string): string | undefined {
	const value = metadata?.[key];
	return typeof value === "string" ? value : undefined;
}

function objectMetadata(metadata: JsonObject | undefined, key: string): JsonObject | undefined {
	const value = metadata?.[key];
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function isDecisionClass(value: string | undefined): value is Phase1bDecisionClass {
	return value === "act" || value === "compute" || value === "escalate" || value === "recheck" || value === "reuse" || value === "skip";
}

function mean(values: readonly number[]): number {
	return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pairedRows(
	rows: readonly Phase1bResultRow[],
	leftAdapterName: string,
	rightAdapterName: string,
): Array<{ left: Phase1bResultRow; right: Phase1bResultRow }> {
	const byAdapterAndCase = new Map<string, Phase1bResultRow>();
	for (const row of rows) {
		byAdapterAndCase.set(`${row.adapterName}\0${row.caseId}`, row);
	}
	return rows
		.filter((row) => row.adapterName === leftAdapterName)
		.flatMap((left) => {
			const right = byAdapterAndCase.get(`${rightAdapterName}\0${left.caseId}`);
			return right === undefined ? [] : [{ left, right }];
		});
}

function armKindForAdapter(adapterName: string): Phase1bArmKind {
	if (adapterName === "codex" || adapterName === "openclaw") {
		return "scaffold";
	}
	if (adapterName === "pi" || adapterName === "hermes" || adapterName === "dspy-rlm") {
		return "competitor";
	}
	return "baseline";
}

function eventCause(event: ReactorTimelineEvent, observed: Phase1bDecisionClass): "real-input" | "forecast-recheck" | "escalation" {
	if (observed === "escalate" || event.label === "escalation" || event.label === "ambiguity") {
		return "escalation";
	}
	if (event.trigger === "scheduled" || event.label === "silent-drift") {
		return "forecast-recheck";
	}
	return "real-input";
}

function sumCostMetric(records: readonly EvalCostRecord[] | undefined, key: "totalTokens"): number {
	return records?.reduce((sum, record) => sum + finiteMetric(record[key]), 0) ?? 0;
}

function summarizeRowCostConfidence(
	records: readonly Pick<EvalCostRecord, "confidence" | "totalCostUsd">[],
	modelCalls: number,
): Phase1bCostConfidence {
	if (records.length === 0) {
		return modelCalls > 0 ? "unknown" : "none";
	}
	if (records.every((record) => record.confidence === "provider-reconciled" && record.totalCostUsd !== undefined)) {
		return "provider-reconciled";
	}
	return records.reduce<CostConfidence>(
		(best, record) => (confidenceRank(record.confidence) > confidenceRank(best) ? record.confidence : best),
		"unknown",
	);
}

function bestRowsCostConfidence(
	rows: readonly Phase1bResultRow[],
): "provider-reconciled" | "response-usage" | "credit-delta-only" | "none" {
	const confidences = new Set(rows.map((row) => row.costConfidence));
	if (confidences.has("provider-reconciled")) {
		return "provider-reconciled";
	}
	if (confidences.has("response-usage")) {
		return "response-usage";
	}
	return "none";
}

function confidenceRank(confidence: CostConfidence): number {
	switch (confidence) {
		case "provider-reconciled":
			return 4;
		case "response-usage":
			return 3;
		case "price-projected":
			return 2;
		case "local-token-estimate":
			return 1;
		case "unknown":
			return 0;
	}
}
