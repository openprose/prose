import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	REACTOR_ORACLE_SPEC_KIND,
	REACTOR_TIMELINE_CASE_KIND,
	runReactorTimelineCase,
	type ReactorTimelineCase,
} from "../../src/evals/index.js";
import type { BaselineJudgeInput } from "../../src/evals/timeline-adapters/baseline-utils.js";
import { createIdealCronTimelineAdapter } from "../../src/evals/timeline-adapters/ideal-cron.js";

const timelineCase: ReactorTimelineCase = {
	kind: REACTOR_TIMELINE_CASE_KIND,
	version: 1,
	id: "ideal-cron-timeline",
	title: "Ideal cron timeline",
	contract: {
		source: {
			path: "tests/evals/fixtures/quiet-drift-canary.prose.md",
			responsibilityId: "ideal-cron-canary",
			revision: "fixture-v1",
			sha256: "939de0bacfc591264a67abf985f13ffa08d822ed96c3e47d0f279766553c7fe8",
			signerTrustContext: "fixture-null-signer",
		},
	},
	oracle: {
		kind: REACTOR_ORACLE_SPEC_KIND,
		cid: "a".repeat(64),
		policyCid: "b".repeat(64),
		forecastModelId: "fixture-forecast-v1",
		recheckSchedule: ["2026-05-17T13:00:00.000Z", "2026-05-17T14:00:00.000Z"],
		recheckTolerance: 60_000,
		preconditionSet: ["c".repeat(64)],
	},
	events: [
		{
			id: "before-first-tick",
			at: "2026-05-17T12:59:59.000Z",
			label: "noop",
			trigger: "input",
			type: "evidence.receipt",
			payload: { status: "unchanged" },
			payloadCid: "d".repeat(64),
		},
		{
			id: "at-first-tick",
			at: "2026-05-17T13:00:00.000Z",
			label: "silent-drift",
			trigger: "scheduled",
			type: "forecast.recheck",
			payload: { status: "expired" },
			payloadCid: "e".repeat(64),
		},
		{
			id: "after-first-before-second",
			at: "2026-05-17T13:30:00.000Z",
			label: "relevant-change",
			trigger: "input",
			type: "evidence.receipt",
			payload: { status: "still-expired" },
			payloadCid: "f".repeat(64),
		},
	],
	claims: ["C2", "C5"],
	limits: {
		maxCostUsd: 0.05,
		maxModelCalls: 2,
		maxWallTimeMs: 120_000,
	},
	metadata: {
		reportUse: "debug",
	},
};

describe("createIdealCronTimelineAdapter", () => {
	test("skips before the oracle tick, rechecks on the tick, and advances state", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-ideal-cron-cache-"));
		const judgeCalls: BaselineJudgeInput[] = [];

		try {
			const adapter = createIdealCronTimelineAdapter({
				judge(input) {
					judgeCalls.push(input);
					return {
						eventId: input.event.id,
						eventKey: input.eventKey,
						priorVerdict: input.priorVerdict ?? null,
					};
				},
			});

			const result = await runReactorTimelineCase(timelineCase, adapter, {
				runId: "ideal-cron-run-1",
				scenarioCacheRoot: cacheRoot,
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});

			expect(result.status).toBe("passed");
			expect(result.steps.map((step) => step.metadata?.decision)).toEqual(["skip", "recheck", "skip"]);
			expect(result.steps.map((step) => step.metrics?.modelCalls)).toEqual([0, 1, 0]);
			expect(result.steps.map((step) => step.stdout)).toEqual([
				"ideal-cron:skip:before-first-tick\n",
				"ideal-cron:recheck:at-first-tick\n",
				"ideal-cron:skip:after-first-before-second\n",
			]);
			expect(judgeCalls).toHaveLength(1);
			expect(judgeCalls[0]?.event.id).toBe("at-first-tick");
			expect(judgeCalls[0]?.priorVerdict).toBeUndefined();
			expect(result.steps[2]?.metadata).toMatchObject({
				nextScheduleIndex: 1,
				nextScheduleTick: "2026-05-17T14:00:00.000Z",
			});

			const persisted = JSON.parse(
				await readFile(join(result.scenarioCacheDirectory, "ideal-cron.json"), "utf8"),
			) as {
				kind: string;
				state: {
					lastEventKey: string | null;
					nextScheduleIndex: number;
					recheckSchedule: string[];
					rechecks: Array<{ eventId: string; scheduleIndex: number; scheduleTick: string }>;
				};
			};

			expect(persisted.kind).toBe("prose.eval.timeline-baseline-cache.v1");
			expect(persisted.state.recheckSchedule).toEqual(timelineCase.oracle.recheckSchedule);
			expect(persisted.state.nextScheduleIndex).toBe(1);
			expect(persisted.state.lastEventKey).toBe(judgeCalls[0]?.eventKey);
			expect(persisted.state.rechecks).toEqual([
				expect.objectContaining({
					eventId: "at-first-tick",
					scheduleIndex: 0,
					scheduleTick: "2026-05-17T13:00:00.000Z",
				}),
			]);
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});
});
