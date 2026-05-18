import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	REACTOR_ORACLE_SPEC_KIND,
	REACTOR_TIMELINE_CASE_KIND,
	REACTOR_TIMELINE_CASE_MEDIA_TYPE,
	createFilesystemArtifactStore,
	runReactorTimelineCase,
	validateReactorTimelineCase,
	type ReactorTimelineAdapter,
	type ReactorTimelineCase,
} from "../../src/evals/index.js";

const timelineCase: ReactorTimelineCase = {
	kind: REACTOR_TIMELINE_CASE_KIND,
	version: 1,
	id: "quiet-drift-timeline",
	title: "Quiet drift timeline",
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
			id: "receipt-issued",
			at: "2026-05-17T12:00:00.000Z",
			label: "relevant-change",
			trigger: "input",
			type: "evidence.receipt",
			payload: { status: "valid" },
			payloadCid: "d".repeat(64),
		},
		{
			id: "forecast-recheck",
			at: "2026-05-17T13:00:00.000Z",
			label: "silent-drift",
			trigger: "scheduled",
			type: "forecast.recheck",
			payload: { status: "expired" },
			payloadCid: "e".repeat(64),
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

describe("ReactorTimelineCase schema", () => {
	test("accepts a Markdown-first timeline with a frozen OracleSpec", () => {
		expect(validateReactorTimelineCase(timelineCase)).toBe(timelineCase);
	});

	test("does not inherit the single-shot EvalTask prompt shape", () => {
		expect(() =>
			validateReactorTimelineCase({
				...timelineCase,
				prompt: "This would be EvalTask smoke plumbing.",
			}),
		).toThrow("timelineCase.prompt is not supported");
	});

	test("rejects duplicate events and invalid claims", () => {
		expect(() =>
			validateReactorTimelineCase({
				...timelineCase,
				events: [timelineCase.events[0]!, { ...timelineCase.events[1]!, id: timelineCase.events[0]!.id }],
			}),
		).toThrow("timelineCase.events contains duplicate id: receipt-issued");

		expect(() =>
			validateReactorTimelineCase({
				...timelineCase,
				claims: ["C2", "safe_silence"],
			}),
		).toThrow("timelineCase.claims[1] must be one of: C1, C2, C3, C4, C5, C6");
	});
});

describe("Reactor timeline adapter contract", () => {
	test("steps events through one persistent per-scenario cache directory", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-timeline-artifacts-"));
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-timeline-cache-"));
		try {
			const observedCacheDirs: string[] = [];
			const adapter: ReactorTimelineAdapter = {
				name: "timeline-mock",
				async prepare(_case, context) {
					observedCacheDirs.push(context.scenarioCacheDirectory);
					await writeFile(join(context.scenarioCacheDirectory, "prepared.txt"), "prepared", "utf8");
					return {
						metadata: { prepared: true },
					};
				},
				async onEvent(event, context) {
					observedCacheDirs.push(context.scenarioCacheDirectory);
					const prepared = await readFile(join(context.scenarioCacheDirectory, "prepared.txt"), "utf8");
					return {
						eventId: event.id,
						status: "passed",
						stdout: `${prepared}:${context.eventIndex}:${event.id}`,
					};
				},
				async teardown(_case, context) {
					observedCacheDirs.push(context.scenarioCacheDirectory);
					return {
						metadata: { tornDown: true },
					};
				},
			};

			const result = await runReactorTimelineCase(timelineCase, adapter, {
				artifactStore: createFilesystemArtifactStore({ root }),
				runId: "timeline-run-1",
				scenarioCacheRoot: cacheRoot,
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});

			expect(result.status).toBe("passed");
			expect(result.steps.map((step) => step.stdout)).toEqual([
				"prepared:0:receipt-issued",
				"prepared:1:forecast-recheck",
			]);
			expect(new Set(observedCacheDirs)).toEqual(new Set([join(cacheRoot, timelineCase.id, "timeline-mock")]));
			expect(existsSync(join(result.scenarioCacheDirectory, "prepared.txt"))).toBe(true);
			expect(result.artifacts).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						mediaType: REACTOR_TIMELINE_CASE_MEDIA_TYPE,
						path: join(root, "timeline-run-1", "timeline", timelineCase.id, "timeline-mock", "timeline-case.json"),
					}),
				]),
			);
			expect(result.metadata).toEqual({ prepared: true, tornDown: true });
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});
});
