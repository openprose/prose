import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { createTunedTtlTimelineAdapter } from "../../src/evals/timeline-adapters/tuned-ttl.js";
import {
	REACTOR_ORACLE_SPEC_KIND,
	REACTOR_TIMELINE_CASE_KIND,
	runReactorTimelineCase,
	type JsonValue,
	type ReactorTimelineCase,
	type ReactorTimelineEvent,
} from "../../src/evals/index.js";

describe("createTunedTtlTimelineAdapter", () => {
	test("computes the first event, reuses inside the TTL, and rechecks after expiry", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-tuned-ttl-cache-"));
		const judgeCalls: JudgeCall[] = [];
		const adapter = createTunedTtlTimelineAdapter({
			ttlMs: 60 * 60 * 1000,
			judge: async (input) => {
				const verdict = { eventId: input.event.id, sequence: judgeCalls.length + 1 };
				judgeCalls.push({
					eventId: input.event.id,
					priorVerdict: input.priorVerdict,
				});
				return verdict;
			},
		});

		try {
			const result = await runReactorTimelineCase(
				timelineCase([
					event("first", "2026-05-17T12:00:00.000Z", "noop"),
					event("within-ttl", "2026-05-17T12:30:00.000Z", "silent-drift"),
					event("after-ttl", "2026-05-17T13:00:00.000Z", "silent-drift"),
				]),
				adapter,
				{
					runId: "tuned-ttl-run",
					scenarioCacheRoot: cacheRoot,
					now: () => new Date("2026-05-17T12:00:00.000Z"),
				},
			);

			expect(result.status).toBe("passed");
			expect(result.steps.map((step) => step.metadata?.decision)).toEqual(["compute", "reuse", "recheck"]);
			expect(result.steps.map((step) => step.metrics?.modelCalls)).toEqual([1, 0, 1]);
			expect(result.steps.map((step) => step.metrics?.cacheHit)).toEqual([0, 1, 0]);
			expect(judgeCalls.map((call) => call.eventId)).toEqual(["first", "after-ttl"]);
			expect(judgeCalls[1]?.priorVerdict).toEqual({ eventId: "first", sequence: 1 });

			const cache = JSON.parse(await readFile(join(result.scenarioCacheDirectory, "tuned-ttl.json"), "utf8"));
			expect(cache.state.lastComputedAt).toBe("2026-05-17T13:00:00.000Z");
			expect(cache.state.lastEventId).toBe("after-ttl");
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});

	test("computes relevant changes immediately and resets the TTL window", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-tuned-ttl-cache-"));
		const judgeCalls: JudgeCall[] = [];
		const adapter = createTunedTtlTimelineAdapter({
			ttlMs: 60 * 60 * 1000,
			judge: (input) => {
				const verdict = { eventId: input.event.id, sequence: judgeCalls.length + 1 };
				judgeCalls.push({
					eventId: input.event.id,
					priorVerdict: input.priorVerdict,
				});
				return verdict;
			},
		});

		try {
			const result = await runReactorTimelineCase(
				timelineCase([
					event("seed", "2026-05-17T12:00:00.000Z", "noop"),
					event("relevant", "2026-05-17T12:05:00.000Z", "relevant-change"),
					event("after-original-ttl", "2026-05-17T13:01:00.000Z", "silent-drift"),
				]),
				adapter,
				{
					runId: "tuned-ttl-reset-run",
					scenarioCacheRoot: cacheRoot,
					now: () => new Date("2026-05-17T12:00:00.000Z"),
				},
			);

			expect(result.status).toBe("passed");
			expect(result.steps.map((step) => step.metadata?.decision)).toEqual(["compute", "compute", "reuse"]);
			expect(result.steps.map((step) => step.metrics?.modelCalls)).toEqual([1, 1, 0]);
			expect(judgeCalls.map((call) => call.eventId)).toEqual(["seed", "relevant"]);
			expect(judgeCalls[1]?.priorVerdict).toEqual({ eventId: "seed", sequence: 1 });

			const cache = JSON.parse(await readFile(join(result.scenarioCacheDirectory, "tuned-ttl.json"), "utf8"));
			expect(cache.state.lastComputedAt).toBe("2026-05-17T12:05:00.000Z");
			expect(cache.state.lastEventId).toBe("relevant");
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});
});

interface JudgeCall {
	eventId: string;
	priorVerdict: JsonValue | undefined;
}

function timelineCase(events: readonly ReactorTimelineEvent[]): ReactorTimelineCase {
	return {
		kind: REACTOR_TIMELINE_CASE_KIND,
		version: 1,
		id: "tuned-ttl-timeline",
		title: "Tuned TTL timeline",
		contract: {
			source: {
				path: "tests/evals/fixtures/quiet-drift-canary.prose.md",
				responsibilityId: "quiet-drift-canary",
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
			recheckSchedule: ["2026-05-17T13:00:00.000Z"],
			recheckTolerance: 60_000,
			preconditionSet: ["c".repeat(64)],
		},
		events,
	};
}

function event(id: string, at: string, label: ReactorTimelineEvent["label"]): ReactorTimelineEvent {
	return {
		id,
		at,
		label,
		trigger: label === "relevant-change" ? "input" : "scheduled",
		type: label === "relevant-change" ? "evidence.receipt" : "forecast.recheck",
		payload: { id },
		payloadCid: "d".repeat(64),
	};
}
