import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	PHASE_1B_REACTOR_SCENARIO_CORPUS,
	createPhase1bBaselineAdapters,
	mcnemarExact,
	notRunPhase1bCompetitorRows,
	phase1bStatisticalPilot,
	runPhase1bBaselinePilot,
	summarizePhase1bResults,
	wilcoxonSignedRank,
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
			expect(pilot).toEqual(
				expect.objectContaining({
					leftAdapterName: "diffcache",
					rightAdapterName: "ideal-cron",
					n: 4,
				}),
			);
			expect(pilot.wilcoxonModelCalls.n).toBeGreaterThan(0);
			expect(pilot.mcnemarTraceCorrect.method).toBe("mcnemar-exact");
			expect(notRunRows).toHaveLength(6);
			expect(notRunRows.every((row) => row.status === "not-run" && row.modelCalls === 0)).toBe(true);
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});
});
