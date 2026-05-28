import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	ADAPTIVE_CRON_CACHE_FILE,
	createAdaptiveCronTimelineAdapter,
} from "../../src/evals/timeline-adapters/adaptive-cron.js";
import type {
	JsonObject,
	JsonValue,
	ReactorTimelineAdapterEventContext,
	ReactorTimelineEvent,
	SurpriseLabel,
} from "../../src/evals/index.js";
import type { BaselineJudgeInput } from "../../src/evals/timeline-adapters/baseline-utils.js";

describe("createAdaptiveCronTimelineAdapter", () => {
	test("resets the schedule on relevant changes", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-adaptive-cron-"));
		try {
			const calls: BaselineJudgeInput[] = [];
			const adapter = createAdaptiveCronTimelineAdapter({
				baselineJudge: (input) => {
					calls.push(input);
					return { eventId: input.event.id, ordinal: calls.length };
				},
			});
			const context = adapterContext(cacheRoot, adapter.name);

			await adapter.onEvent(event("receipt-issued", "2026-05-17T12:00:00.000Z", "relevant-change"), context);
			await adapter.onEvent(event("due-recheck", "2026-05-17T13:00:00.000Z", "silent-drift"), context);
			const reset = await adapter.onEvent(
				event("fresh-receipt", "2026-05-17T13:30:00.000Z", "relevant-change"),
				context,
			);

			expect(reset.metadata).toEqual(
				expect.objectContaining({
					decision: "compute",
					intervalMs: 60 * 60 * 1000,
					nextDueAt: "2026-05-17T14:30:00.000Z",
					resetInterval: true,
				}),
			);
			expect(calls).toHaveLength(3);
			expect(cacheState(cacheRoot).intervalMs).toBe(60 * 60 * 1000);
			expect(cacheState(cacheRoot).nextDueAt).toBe("2026-05-17T14:30:00.000Z");
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});

	test("skips noop events before the next due time", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-adaptive-cron-"));
		try {
			const calls: BaselineJudgeInput[] = [];
			const adapter = createAdaptiveCronTimelineAdapter({
				baselineJudge: (input) => {
					calls.push(input);
					return { eventId: input.event.id };
				},
			});
			const context = adapterContext(cacheRoot, adapter.name);

			await adapter.onEvent(event("receipt-issued", "2026-05-17T12:00:00.000Z", "relevant-change"), context);
			const skipped = await adapter.onEvent(event("quiet-tick", "2026-05-17T12:30:00.000Z", "noop"), context);

			expect(skipped.metadata).toEqual(
				expect.objectContaining({
					decision: "skip",
					intervalMs: 60 * 60 * 1000,
					nextDueAt: "2026-05-17T13:00:00.000Z",
				}),
			);
			expect(skipped.metrics).toEqual({ cacheHit: 0, modelCalls: 0 });
			expect(calls).toHaveLength(1);
			expect(cacheState(cacheRoot).nextDueAt).toBe("2026-05-17T13:00:00.000Z");
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});

	test("rechecks and backs off at the next due time", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-adaptive-cron-"));
		try {
			const calls: BaselineJudgeInput[] = [];
			const adapter = createAdaptiveCronTimelineAdapter({
				baselineJudge: (input) => {
					calls.push(input);
					return input.priorVerdict === undefined
						? { eventId: input.event.id }
						: { eventId: input.event.id, prior: input.priorVerdict };
				},
			});
			const context = adapterContext(cacheRoot, adapter.name);

			await adapter.onEvent(event("receipt-issued", "2026-05-17T12:00:00.000Z", "relevant-change"), context);
			const recheck = await adapter.onEvent(
				event("due-recheck", "2026-05-17T13:00:00.000Z", "silent-drift"),
				context,
			);

			expect(recheck.metadata).toEqual(
				expect.objectContaining({
					decision: "recheck",
					intervalMs: 2 * 60 * 60 * 1000,
					nextDueAt: "2026-05-17T15:00:00.000Z",
				}),
			);
			expect(recheck.metrics).toEqual({ cacheHit: 0, modelCalls: 1 });
			expect(calls).toHaveLength(2);
			expect(calls[1]?.priorVerdict).toEqual({ eventId: "receipt-issued" });
			expect(cacheState(cacheRoot).intervalMs).toBe(2 * 60 * 60 * 1000);
			expect(cacheState(cacheRoot).lastVerdict).toEqual({
				eventId: "due-recheck",
				prior: { eventId: "receipt-issued" },
			});
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});
});

function event(id: string, at: string, label: SurpriseLabel): ReactorTimelineEvent {
	return {
		id,
		at,
		label,
		trigger: "input",
		type: `fixture.${id}`,
	};
}

function adapterContext(scenarioCacheDirectory: string, adapterName: string): ReactorTimelineAdapterEventContext {
	return {
		adapterName,
		attemptId: "attempt-1",
		caseId: "adaptive-cron-case",
		eventIndex: 0,
		runId: "run-1",
		scenarioCacheDirectory,
		startedAt: "2026-05-17T12:00:00.000Z",
	};
}

function cacheState(cacheRoot: string): AdaptiveCronTestState {
	return JSON.parse(readFileSync(join(cacheRoot, ADAPTIVE_CRON_CACHE_FILE), "utf8")).state as AdaptiveCronTestState;
}

interface AdaptiveCronTestState extends JsonObject {
	intervalMs: number;
	lastVerdict: JsonValue;
	nextDueAt: string;
}
