import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	REACTOR_ORACLE_SPEC_KIND,
	REACTOR_TIMELINE_CASE_KIND,
	runReactorTimelineCase,
	type JsonValue,
	type ReactorTimelineCase,
	type ReactorTimelineEvent,
} from "../../src/evals/index.js";
import { createDiffcachePlusTimelineAdapter } from "../../src/evals/timeline-adapters/diffcache-plus.js";

describe("diffcache-plus timeline adapter", () => {
	test("does not require a local model and falls back to exact canonical cache reuse", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-diffcache-plus-cache-"));
		const judgeCalls: string[] = [];
		const adapter = createDiffcachePlusTimelineAdapter({
			baselineJudge: async ({ event, eventKey }) => {
				judgeCalls.push(event.id);
				return { eventId: event.id, eventKey, status: "computed" };
			},
		});

		try {
			const result = await runReactorTimelineCase(
				timelineCase([
					event("exact-1", { status: "same" }),
					event("exact-2", { status: "same" }),
				]),
				adapter,
				{
					runId: "diffcache-plus-no-local",
					scenarioCacheRoot: cacheRoot,
					now: fixedNow,
				},
			);

			expect(result.status).toBe("passed");
			expect(judgeCalls).toEqual(["exact-1"]);
			expect(result.steps.map((step) => step.metadata?.decision)).toEqual(["compute", "reuse"]);
			expect(result.steps[1]?.metadata).toEqual(
				expect.objectContaining({
					cacheMode: "exact",
					embeddingProvider: "fixture-or-injected",
					noLocalModel: true,
					threshold: 0.985,
				}),
			);

			const cache = JSON.parse(
				await readFile(join(result.scenarioCacheDirectory, "diffcache-plus.json"), "utf8"),
			) as DiffcachePlusCacheFile;
			expect(cache.kind).toBe("prose.eval.timeline-baseline-cache.v1");
			expect(Object.keys(cache.state.verdicts)).toHaveLength(1);
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});

	test("reuses semantically close fixture embeddings without computing again", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-diffcache-plus-cache-"));
		const judgeCalls: string[] = [];
		const adapter = createDiffcachePlusTimelineAdapter({
			baselineJudge: async ({ event, eventKey }) => {
				judgeCalls.push(event.id);
				return { eventId: event.id, eventKey, status: "computed" };
			},
		});

		try {
			const result = await runReactorTimelineCase(
				timelineCase([
					event("close-1", { text: "The account balance increased by five dollars." }, [1, 0, 0]),
					event("close-2", { text: "Balance went up $5." }, [0.9999, 0.01, 0]),
				]),
				adapter,
				{
					runId: "diffcache-plus-close-fixtures",
					scenarioCacheRoot: cacheRoot,
					now: fixedNow,
				},
			);

			expect(result.status).toBe("passed");
			expect(judgeCalls).toEqual(["close-1"]);
			expect(result.steps.map((step) => step.metadata?.decision)).toEqual(["compute", "reuse"]);
			expect(result.steps[1]?.metrics).toEqual(expect.objectContaining({ cacheHit: 1, modelCalls: 0 }));
			expect(result.steps[1]?.metadata).toEqual(
				expect.objectContaining({
					cacheMode: "semantic",
					embeddingProvider: "fixture-or-injected",
					noLocalModel: true,
					threshold: 0.985,
				}),
			);
			const similarity = result.steps[1]?.metadata?.cosineSimilarity;
			expect(typeof similarity).toBe("number");
			if (typeof similarity === "number") {
				expect(similarity).toBeGreaterThan(0.985);
			}
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});

	test("computes distant injected embeddings instead of semantic reuse", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-diffcache-plus-cache-"));
		const judgeCalls: string[] = [];
		const providerCalls: string[] = [];
		const vectors: Record<string, readonly number[]> = {
			"distant-1": [1, 0],
			"distant-2": [0, 1],
		};
		const adapter = createDiffcachePlusTimelineAdapter({
			embeddingProvider: (event) => {
				providerCalls.push(event.id);
				return vectors[event.id];
			},
			baselineJudge: async ({ event, eventKey }) => {
				judgeCalls.push(event.id);
				return { eventId: event.id, eventKey, status: "computed" };
			},
		});

		try {
			const result = await runReactorTimelineCase(
				timelineCase([
					event("distant-1", { text: "Open the account." }),
					event("distant-2", { text: "Archive the account." }),
				]),
				adapter,
				{
					runId: "diffcache-plus-distant-injected",
					scenarioCacheRoot: cacheRoot,
					now: fixedNow,
				},
			);

			expect(result.status).toBe("passed");
			expect(providerCalls).toEqual(["distant-1", "distant-2"]);
			expect(judgeCalls).toEqual(["distant-1", "distant-2"]);
			expect(result.steps.map((step) => step.metadata?.decision)).toEqual(["compute", "compute"]);
			expect(result.steps.map((step) => step.metrics?.modelCalls)).toEqual([1, 1]);
			expect(result.steps[1]?.metadata).toEqual(
				expect.objectContaining({
					cacheMode: "miss",
					cosineSimilarity: 0,
					embeddingProvider: "fixture-or-injected",
					noLocalModel: true,
				}),
			);
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});
});

interface DiffcachePlusCacheFile {
	kind: string;
	state: {
		verdicts: Record<string, JsonValue>;
	};
}

function fixedNow(): Date {
	return new Date("2026-05-17T12:00:00.000Z");
}

function timelineCase(events: readonly ReactorTimelineEvent[]): ReactorTimelineCase {
	return {
		kind: REACTOR_TIMELINE_CASE_KIND,
		version: 1,
		id: "diffcache-plus-fixture",
		title: "Diffcache plus fixture",
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
}

function event(id: string, payload: JsonValue, embedding?: readonly number[]): ReactorTimelineEvent {
	return {
		id,
		at: "2026-05-17T12:00:00.000Z",
		label: "relevant-change",
		trigger: "input",
		type: "evidence.receipt",
		payload,
		payloadCid: "d".repeat(64),
		...(embedding === undefined ? {} : { metadata: { embedding: [...embedding] } }),
	};
}
