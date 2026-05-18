import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	PHASE_1B_REACTOR_SCENARIO_CORPUS,
	createPhase1bBaselineAdapters,
	ModelCatalogClient,
	mcnemarExact,
	notRunPhase1bCompetitorRows,
	pairedPowerPilot,
	runPhase1bReportMinusReactorPilot,
	phase1bStatisticalPilot,
	runPhase1bBaselinePilot,
	summarizePhase1bResults,
	wilcoxonSignedRank,
	type EvalCostRecord,
	type ReactorTimelineAdapter,
	type ReactorTimelineCase,
} from "../../src/evals/index.js";

describe("Phase-1b statistics", () => {
	test("computes exact paired Wilcoxon and McNemar gates", () => {
		const wilcoxon = wilcoxonSignedRank([1, 1, 1], [2, 2, 2]);
		expect(wilcoxon).toEqual(
			expect.objectContaining({
				method: "wilcoxon-signed-rank-exact",
				n: 3,
				rankSumNegative: 6,
				rankSumPositive: 0,
				statistic: 0,
				pValue: 0.25,
			}),
		);

		const mcnemar = mcnemarExact([true, true, false, false], [false, false, true, false]);
		expect(mcnemar).toEqual({
			method: "mcnemar-exact",
			b: 2,
			c: 1,
			n: 3,
			pValue: 1,
		});

		const power = pairedPowerPilot([1, 1, 1], [3, 3, 3], [true, true, false], [true, false, false]);
		expect(power).toEqual(
			expect.objectContaining({
				method: "phase-1b-paired-pilot-normal-approximation",
				floorN: 12,
				pilotN: 3,
				recommendedN: expect.any(Number),
			}),
		);
	});
});

describe("Phase-1b non-Reactor baseline pilot", () => {
	test("runs deterministic baselines over an n=1 per-family pilot and produces paired statistics", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-phase-1b-results-test-"));
		try {
			const rows = await runPhase1bBaselinePilot({
				adapters: createPhase1bBaselineAdapters(),
				now: () => new Date("2026-05-17T12:00:00.000Z"),
				runId: "phase-1b-results-test",
				scenarioCacheRoot: cacheRoot,
				scenarioLimitPerFamily: 1,
			});
			const table = summarizePhase1bResults(rows);
			const pilot = phase1bStatisticalPilot(rows, "diffcache", "ideal-cron");
			const notRunRows = notRunPhase1bCompetitorRows(PHASE_1B_REACTOR_SCENARIO_CORPUS.slice(0, 2));

			expect(rows).toHaveLength(20);
			expect(new Set(rows.map((row) => row.adapterName))).toEqual(
				new Set(["diffcache", "diffcache-plus", "ideal-cron", "adaptive-cron", "tuned-ttl"]),
			);
			expect(rows.every((row) => row.status === "passed")).toBe(true);
			expect(rows.every((row) => row.totalEvents > 0)).toBe(true);
			expect(rows.every((row) => row.traceScore >= 0 && row.traceScore <= 1)).toBe(true);
			expect(table).toHaveLength(20);
			expect(table.every((row) => row.cases === 1)).toBe(true);
			expect(table.every((row) => row.reportUse === "adapter-canary")).toBe(true);
			expect(table.every((row) => row.evidenceUse === "deterministic-oracle")).toBe(true);
			expect(pilot).toEqual(
				expect.objectContaining({
					leftAdapterName: "diffcache",
					rightAdapterName: "ideal-cron",
					n: 4,
				}),
			);
			expect(pilot.powerPilot.recommendedN).toBeGreaterThanOrEqual(12);
			expect(pilot.wilcoxonModelCalls.n).toBeGreaterThan(0);
			expect(pilot.mcnemarTraceCorrect.method).toBe("mcnemar-exact");
			expect(notRunRows).toHaveLength(6);
			expect(notRunRows.every((row) => row.status === "not-run" && row.modelCalls === 0)).toBe(true);
			expect(notRunRows.every((row) => row.reportUse === "adapter-canary" && row.evidenceUse === "external-context")).toBe(true);
			expect(rows[0]?.steps[0]?.receipt.kind).toBe("openprose.receipt.v0.observable");
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});

	test("runs report-minus-Reactor pilot rows and reconciles provider costs", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-phase-1b-report-test-"));
		try {
			const scenarios = firstScenarioPerFamily();
			const costAdapter = createCostFixtureTimelineAdapter();
			const costClient = new ModelCatalogClient({
				apiKey: "test-openrouter-key",
				fetch: createCostLearningFetch(0.0032),
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});

			const report = await runPhase1bReportMinusReactorPilot({
				adapters: [costAdapter],
				costClient,
				costLearning: {
					generationLookupAttempts: 1,
				},
				now: () => new Date("2026-05-17T12:00:00.000Z"),
				runId: "phase-1b-report-test",
				scenarioCacheRoot: cacheRoot,
				scenarioLimitPerFamily: 1,
				scenarios,
			});

			expect(report.kind).toBe("prose.eval.phase-1b.report-minus-reactor-pilot.v1");
			expect(report.noReactorRow).toBe(true);
			expect(report.rows).toHaveLength(4);
			expect(report.rows.every((row) => row.reportUse === "adapter-canary")).toBe(true);
			expect(report.rows.every((row) => row.receiptRecordShape === "openprose.receipt.v0-observable")).toBe(true);
			expect(report.rows.every((row) => row.costConfidence === "provider-reconciled")).toBe(true);
			expect(report.costLearning?.generationLookupFailures).toHaveLength(0);
			expect(report.costStage.confidence).toBe("provider-reconciled");
			expect(report.costStage.providerReconciledSpendUsd).toBeGreaterThan(0);
			expect(report.costStage.withinBudgetForN12).toBe(true);
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});
});

function firstScenarioPerFamily(): ReactorTimelineCase[] {
	const seen = new Set<string>();
	const scenarios: ReactorTimelineCase[] = [];
	for (const scenario of PHASE_1B_REACTOR_SCENARIO_CORPUS) {
		const familyId = String(scenario.metadata?.familyId ?? "");
		if (!seen.has(familyId)) {
			seen.add(familyId);
			scenarios.push(scenario);
		}
	}
	return scenarios;
}

function createCostFixtureTimelineAdapter(): ReactorTimelineAdapter {
	return {
		name: "cost-fixture",
		async onEvent(event, context) {
			const costRecord: EvalCostRecord = {
				id: `${context.attemptId}:${event.id}`,
				adapterName: "cost-fixture",
				attemptId: context.attemptId,
				confidence: "response-usage",
				generationId: `gen-${context.caseId}-${event.id}`,
				occurredAt: context.startedAt,
				runId: context.runId,
				taskId: `${context.caseId}-${event.id}`,
				totalCostUsd: 0.0001,
				totalTokens: 2,
			};

			return {
				eventId: event.id,
				status: "passed",
				costs: [costRecord],
				metrics: {
					modelCalls: 1,
				},
			};
		},
	};
}

function createCostLearningFetch(creditDeltaUsd: number): typeof fetch {
	let creditsReads = 0;
	return (async (input: string | URL | Request) => {
		const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
		if (url.pathname === "/api/v1/models") {
			return jsonResponse({ data: [{ id: "google/gemini-3.1-flash-lite-preview" }] });
		}
		if (url.pathname.endsWith("/endpoints")) {
			return jsonResponse({ data: { endpoints: [{ provider_name: "Google AI Studio" }] } });
		}
		if (url.pathname === "/api/v1/credits") {
			creditsReads += 1;
			return jsonResponse({ data: { total_usage: creditsReads === 1 ? 0 : creditDeltaUsd } });
		}
		if (url.pathname === "/api/v1/generation") {
			return jsonResponse({
				data: {
					id: url.searchParams.get("id"),
					total_cost: 0.0002,
					tokens_prompt: 1,
					tokens_completion: 1,
					model: "google/gemini-3.1-flash-lite-preview",
					provider_name: "Google AI Studio",
				},
			});
		}
		return new Response("not found", { status: 404 });
	}) as typeof fetch;
}

function jsonResponse(value: unknown): Response {
	return new Response(JSON.stringify(value), {
		headers: {
			"content-type": "application/json",
		},
		status: 200,
	});
}
