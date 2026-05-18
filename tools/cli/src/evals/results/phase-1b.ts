import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	PHASE_1B_REACTOR_SCENARIO_CORPUS,
	PHASE_1B_REACTOR_SCENARIO_FAMILY_IDS,
	getPhase1bScenarioMetadata,
	type Phase1bScenarioFamilyId,
} from "../scenarios/phase-1b-corpus.js";
import {
	createAdaptiveCronTimelineAdapter,
	type AdaptiveCronTimelineAdapterOptions,
} from "../timeline-adapters/adaptive-cron.js";
import { createDiffcachePlusTimelineAdapter } from "../timeline-adapters/diffcache-plus.js";
import { createDiffcacheTimelineAdapter } from "../timeline-adapters/diffcache.js";
import { createIdealCronTimelineAdapter } from "../timeline-adapters/ideal-cron.js";
import { createTunedTtlTimelineAdapter } from "../timeline-adapters/tuned-ttl.js";
import { runReactorTimelineCase } from "../timeline-runner.js";
import type {
	JsonObject,
	ReactorTimelineAdapter,
	ReactorTimelineCase,
	ReactorTimelineEvent,
	ReactorTimelineRunResult,
	ReactorTimelineStepResult,
} from "../types.js";
import { mcnemarExact, wilcoxonSignedRank, type McNemarExactResult, type WilcoxonSignedRankResult } from "./statistics.js";

export type Phase1bDecisionClass = "act" | "compute" | "escalate" | "recheck" | "reuse" | "skip";
export type Phase1bResultStatus = "passed" | "failed" | "not-run";

export interface Phase1bBaselineRunOptions {
	adapters?: readonly ReactorTimelineAdapter[];
	scenarioLimitPerFamily?: number;
	scenarios?: readonly ReactorTimelineCase[];
	scenarioCacheRoot?: string;
	runId?: string;
	now?: () => Date;
}

export interface Phase1bResultRow {
	adapterName: string;
	caseId: string;
	familyId: Phase1bScenarioFamilyId;
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
}

export interface Phase1bResultsTableRow {
	adapterName: string;
	familyId: Phase1bScenarioFamilyId;
	status: Phase1bResultStatus;
	cases: number;
	meanTraceScore: number;
	totalModelCalls: number;
	totalCostUsd: number;
}

export interface Phase1bStatisticalPilotResult {
	leftAdapterName: string;
	rightAdapterName: string;
	n: number;
	wilcoxonModelCalls: WilcoxonSignedRankResult;
	mcnemarTraceCorrect: McNemarExactResult;
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

export async function runPhase1bBaselinePilot(
	options: Phase1bBaselineRunOptions = {},
): Promise<readonly Phase1bResultRow[]> {
	const adapters = options.adapters ?? createPhase1bBaselineAdapters();
	const scenarios = selectPilotScenarios(options.scenarios ?? PHASE_1B_REACTOR_SCENARIO_CORPUS, options.scenarioLimitPerFamily ?? 3);
	const scenarioCacheRoot =
		options.scenarioCacheRoot ?? (await mkdtemp(join(tmpdir(), "prose-phase-1b-results-cache-")));
	const runId = options.runId ?? "phase-1b-non-reactor-pilot";
	const rows: Phase1bResultRow[] = [];

	for (const adapter of adapters) {
			for (const scenario of scenarios) {
				const result = await runReactorTimelineCase(scenario, adapter, {
					runId: `${runId}-${adapter.name}-${scenario.id}`,
					scenarioCacheRoot,
					...(options.now === undefined ? {} : { now: options.now }),
				});
				rows.push(scorePhase1bTimelineRun(scenario, result));
			}
	}

	return rows;
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
		const observed = observedDecisionClass(step);
		const modelCalls = finiteMetric(step?.metrics?.modelCalls);
		return {
			eventId: event.id,
			expected,
			observed,
			correct: decisionMatches(expected, observed),
			modelCalls,
		};
	});
	const correctEvents = steps.filter((step) => step.correct).length;
	const totalEvents = timelineCase.events.length;

	return {
		adapterName: result.adapterName,
		caseId: timelineCase.id,
		familyId: metadata.familyId,
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
		const key = `${row.adapterName}\0${row.familyId}\0${row.status}`;
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
				familyId: first.familyId,
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
	};
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
				caseId: scenario.id,
				familyId: metadata.familyId,
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
