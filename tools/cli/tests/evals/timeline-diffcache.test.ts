import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	REACTOR_ORACLE_SPEC_KIND,
	REACTOR_TIMELINE_CASE_KIND,
	runReactorTimelineCase,
	type JsonObject,
	type ReactorTimelineCase,
} from "../../src/evals/index.js";
import { createDiffcacheTimelineAdapter } from "../../src/evals/timeline-adapters/diffcache.js";
import { eventCanonicalKey } from "../../src/evals/timeline-adapters/baseline-utils.js";

const timelineCase: ReactorTimelineCase = {
	kind: REACTOR_TIMELINE_CASE_KIND,
	version: 1,
	id: "diffcache-timeline",
	title: "Diffcache timeline",
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
	events: [
		{
			id: "first-payload",
			at: "2026-05-17T12:00:00.000Z",
			label: "relevant-change",
			trigger: "input",
			type: "evidence.receipt",
			payload: { amount: 42, status: "valid" },
			payloadCid: "d".repeat(64),
		},
		{
			id: "duplicate-payload",
			at: "2026-05-17T12:01:00.000Z",
			label: "relevant-change",
			trigger: "input",
			type: "evidence.receipt",
			payload: { amount: 42, status: "valid" },
			payloadCid: "d".repeat(64),
		},
		{
			id: "new-payload",
			at: "2026-05-17T12:02:00.000Z",
			label: "relevant-change",
			trigger: "input",
			type: "evidence.receipt",
			payload: { amount: 43, status: "valid" },
			payloadCid: "e".repeat(64),
		},
	],
};

describe("diffcache timeline adapter", () => {
	test("computes the first event, reuses duplicate payloads, and computes new payloads in one persistent cache", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-diffcache-timeline-"));
		try {
			const judgeCalls: string[] = [];
			const adapter = createDiffcacheTimelineAdapter({
				baselineJudge: ({ event, eventKey }) => {
					judgeCalls.push(event.id);
					return {
						eventId: event.id,
						eventKey,
						call: judgeCalls.length,
					};
				},
			});

			const result = await runReactorTimelineCase(timelineCase, adapter, {
				runId: "diffcache-run-1",
				scenarioCacheRoot: cacheRoot,
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});

			expect(result.status).toBe("passed");
			expect(result.scenarioCacheDirectory).toBe(join(cacheRoot, timelineCase.id, "diffcache"));
			expect(judgeCalls).toEqual(["first-payload", "new-payload"]);
			expect(result.steps.map((step) => step.metadata?.decision)).toEqual(["compute", "reuse", "compute"]);
			expect(result.steps.map((step) => step.metrics)).toEqual([
				{ cacheHit: 0, modelCalls: 1 },
				{ cacheHit: 1, modelCalls: 0 },
				{ cacheHit: 0, modelCalls: 1 },
			]);
			expect(result.steps.map((step) => step.events?.[0]?.type)).toEqual([
				"baseline.diffcache.compute",
				"baseline.diffcache.reuse",
				"baseline.diffcache.compute",
			]);

			const cacheFile = JSON.parse(await readFile(join(result.scenarioCacheDirectory, "diffcache.json"), "utf8")) as {
				state: {
					lastKey: string;
					verdicts: JsonObject;
				};
			};
			const firstKey = eventCanonicalKey(timelineCase.events[0]!);
			const duplicateKey = eventCanonicalKey(timelineCase.events[1]!);
			const newKey = eventCanonicalKey(timelineCase.events[2]!);

			expect(duplicateKey).toBe(firstKey);
			expect(newKey).not.toBe(firstKey);
			expect(cacheFile.state.lastKey).toBe(newKey);
			expect(Object.keys(cacheFile.state.verdicts).sort()).toEqual([firstKey, newKey].sort());
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});
});
