import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	REACTOR_ORACLE_SPEC_KIND,
	REACTOR_TIMELINE_CASE_KIND,
	createCodexTimelineAdapter,
	createDspyRlmTimelineAdapter,
	createFilesystemArtifactStore,
	createHermesTimelineAdapter,
	createOpenClawTimelineAdapter,
	createPiTimelineAdapter,
	runReactorTimelineCase,
	type EvalTask,
	type JsonObject,
	type ReactorTimelineCase,
} from "../../src/evals/index.js";

const timelineCase: ReactorTimelineCase = {
	kind: REACTOR_TIMELINE_CASE_KIND,
	version: 1,
	id: "competitor-timeline",
	title: "Competitor timeline",
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
	limits: {
		maxModelCalls: 2,
	},
	metadata: {
		reportUse: "debug",
	},
};

describe("competitor timeline adapters", () => {
	test("maps timeline events into Pi RPC tasks with persistent cache and timeline-scoped artifacts", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-pi-timeline-artifacts-"));
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-pi-timeline-cache-"));
		try {
			const calls: PiCall[] = [];
			const adapter = createPiTimelineAdapter({
				model: "mock/model",
				rpcRunner: async (command, args, options) => {
					calls.push({
						args: [...args],
						attemptArtifactDirectory: options.context.attemptArtifactDirectory,
						command,
						cwd: options.cwd,
						env: options.env,
						prompt: options.prompt,
						task: options.task,
					});

					return {
						exitCode: 0,
						lastAssistantText: `action escalated for ${timelineEventId(options.task)}`,
						records: [{ type: "tool_call" }, { type: "agent_end" }],
						sessionStats: {
							tokens: {
								completion: 3,
								prompt: 11,
							},
						},
						stderr: "",
						stdout: "",
					};
				},
			});

			const result = await runReactorTimelineCase(timelineCase, adapter, {
				artifactStore: createFilesystemArtifactStore({ root }),
				runId: "pi-timeline-run",
				scenarioCacheRoot: cacheRoot,
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});

			const runDirectory = join(cacheRoot, timelineCase.id, "pi", "adapter-run");
			expect(result.status).toBe("passed");
			expect(calls).toHaveLength(2);
			expect(calls.map((call) => call.command)).toEqual(["npx", "npx"]);
			expect(calls[0]?.args).toEqual(expect.arrayContaining(["--mode", "rpc", "--no-session"]));
			expect(calls.map((call) => call.cwd)).toEqual([runDirectory, runDirectory]);
			expect(calls[0]?.env).toEqual(
				expect.objectContaining({
					PI_CODING_AGENT_DIR: join(runDirectory, "pi-agent"),
					PI_CODING_AGENT_SESSION_DIR: join(runDirectory, "pi-sessions"),
					PI_OFFLINE: "1",
				}),
			);
			expect(calls[0]?.attemptArtifactDirectory).toBe(
				join("pi-timeline-run", "timeline", timelineCase.id, "pi", "attempts", "receipt-issued"),
			);
			expect(calls[0]?.task.id).toBe("competitor-timeline-receipt-issued");
			expect(calls[0]?.task.surpriseLabels).toEqual(["relevant-change"]);
			expect(calls[0]?.task.metadata?.timelineEvent).toEqual(
				expect.objectContaining({
					id: "receipt-issued",
					index: 0,
					type: "evidence.receipt",
				}),
			);
			expect(calls[0]?.prompt).toContain('"id": "receipt-issued"');
			expect(calls[0]?.prompt).not.toContain('"id": "forecast-recheck"');
			expect(result.steps[0]?.metrics).toEqual(
				expect.objectContaining({
					acted: 1,
					escalated: 1,
					modelCalls: 1,
					rechecked: 0,
				}),
			);
			expect(result.steps[1]?.metrics).toEqual(
				expect.objectContaining({
					modelCalls: 1,
					rechecked: 1,
				}),
			);
			expect(result.steps[0]?.events?.map((event) => event.type)).toEqual(
				expect.arrayContaining(["competitor.pi.model_call", "tool_call", "competitor.pi.step_completed"]),
			);
			expect(result.costs).toHaveLength(2);
			expect(result.costs[0]).toEqual(
				expect.objectContaining({
					adapterName: "pi",
					completionTokens: 3,
					promptTokens: 11,
					taskId: "competitor-timeline-receipt-issued",
					totalTokens: 14,
				}),
			);
			expect(
				existsSync(
					join(
						root,
						"pi-timeline-run",
						"timeline",
						timelineCase.id,
						"pi",
						"attempts",
						"receipt-issued",
						"rpc-transcript.json",
					),
				),
			).toBe(true);
			expect(result.scenarioCacheDirectory).toBe(join(cacheRoot, timelineCase.id, "pi"));
			expect(existsSync(runDirectory)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});

	test("maps Hermes and DSPy through injected runners with event/case prompts and persistent run directories", async () => {
		const hermesCacheRoot = mkdtempSync(join(tmpdir(), "prose-hermes-timeline-cache-"));
		const dspyCacheRoot = mkdtempSync(join(tmpdir(), "prose-dspy-timeline-cache-"));
		try {
			const hermesCalls: ProcessCall[] = [];
			const hermes = createHermesTimelineAdapter({
				model: "mock/model",
				runner: async (command, args, options) => {
					hermesCalls.push({
						args: [...args],
						command,
						cwd: options.cwd,
						env: options.env,
					});
					options.stdout.write("action completed\n");
					return { exitCode: 0 };
				},
			});
			const hermesResult = await runReactorTimelineCase(timelineCase, hermes, {
				runId: "hermes-timeline-run",
				scenarioCacheRoot: hermesCacheRoot,
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});

			const hermesRunDirectory = join(hermesCacheRoot, timelineCase.id, "hermes", "adapter-run");
			const hermesPrompt = promptArg(hermesCalls[0]?.args ?? [], "-q");
			expect(hermesResult.status).toBe("passed");
			expect(hermesCalls).toHaveLength(2);
			expect(hermesCalls.map((call) => call.cwd)).toEqual([hermesRunDirectory, hermesRunDirectory]);
			expect(hermesCalls[0]?.command).toBe("hermes");
			expect(hermesCalls[0]?.env).toEqual(
				expect.objectContaining({
					HERMES_HOME: join(hermesRunDirectory, "hermes-home"),
					HERMES_SESSION_SOURCE: "prose-eval",
				}),
			);
			expect(hermesPrompt).toContain('"id": "receipt-issued"');
			expect(hermesPrompt).not.toContain('"id": "forecast-recheck"');
			expect(hermesResult.steps[0]?.events?.map((event) => event.type)).toContain("competitor.hermes.model_call");
			expect(hermesResult.steps[0]?.metrics).toEqual(expect.objectContaining({ acted: 1, modelCalls: 1 }));

			const dspyCalls: ProcessCall[] = [];
			const dspy = createDspyRlmTimelineAdapter({
				model: "mock/model",
				runner: async (command, args, options) => {
					dspyCalls.push({
						args: [...args],
						command,
						cwd: options.cwd,
						env: options.env,
					});
					options.stdout.write("recheck completed\n");
					return { exitCode: 0 };
				},
			});
			const dspyResult = await runReactorTimelineCase(timelineCase, dspy, {
				runId: "dspy-timeline-run",
				scenarioCacheRoot: dspyCacheRoot,
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});

			const dspyRunDirectory = join(dspyCacheRoot, timelineCase.id, "dspy-rlm", "adapter-run");
			const firstDspyPayload = parseDspyPayload(dspyCalls[0]?.args ?? []);
			expect(dspyResult.status).toBe("passed");
			expect(dspyCalls).toHaveLength(2);
			expect(dspyCalls.map((call) => call.cwd)).toEqual([dspyRunDirectory, dspyRunDirectory]);
			expect(dspyCalls[0]?.command).toBe("python3");
			expect(dspyCalls[0]?.env).toEqual(
				expect.objectContaining({
					DENO_DIR: join(dspyRunDirectory, "deno-cache"),
					DSPY_CACHEDIR: join(dspyRunDirectory, "dspy-cache"),
					DSPY_DISABLE_LOGGING: "1",
				}),
			);
			expect(firstDspyPayload.model).toBe("mock/model");
			expect(firstDspyPayload.context).toContain('"id": "competitor-timeline"');
			expect(firstDspyPayload.context).toContain('"id": "receipt-issued"');
			expect(firstDspyPayload.context).not.toContain('"id": "forecast-recheck"');
			expect(firstDspyPayload.query).toContain("receipt-issued");
			expect(dspyResult.steps[0]?.events?.map((event) => event.type)).toContain("competitor.dspy-rlm.model_call");
			expect(dspyResult.steps[0]?.metrics).toEqual(expect.objectContaining({ modelCalls: 1, rechecked: 1 }));
		} finally {
			rmSync(hermesCacheRoot, { recursive: true, force: true });
			rmSync(dspyCacheRoot, { recursive: true, force: true });
		}
	});

	test("keeps Codex and OpenClaw scaffolds fail-closed without model calls", async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-unsupported-timeline-cache-"));
		try {
			for (const adapter of [createCodexTimelineAdapter(), createOpenClawTimelineAdapter()]) {
				const result = await runReactorTimelineCase(timelineCase, adapter, {
					runId: `${adapter.name}-timeline-run`,
					scenarioCacheRoot: cacheRoot,
					now: () => new Date("2026-05-17T12:00:00.000Z"),
				});

				expect(result.status).toBe("failed");
				expect(result.steps.map((step) => step.status)).toEqual(["failed", "failed"]);
				expect(result.steps.map((step) => step.metrics?.modelCalls)).toEqual([0, 0]);
				expect(result.steps.map((step) => step.metrics?.acted)).toEqual([0, 0]);
				expect(result.steps[0]?.stderr).toContain("configured runner");
				expect(result.steps[0]?.metadata).toEqual(
					expect.objectContaining({
						configurationRequired: true,
						unsupported: true,
					}),
				);
				expect(result.events.some((event) => event.type.endsWith(".model_call"))).toBe(false);
				expect(result.events.map((event) => event.type)).toEqual(
					expect.arrayContaining([`competitor.${adapter.name}.unsupported`]),
				);
				expect(result.scenarioCacheDirectory).toBe(join(cacheRoot, timelineCase.id, adapter.name));
				expect(existsSync(result.scenarioCacheDirectory)).toBe(true);
			}
		} finally {
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});
});

interface PiCall {
	args: string[];
	attemptArtifactDirectory: string | undefined;
	command: string;
	cwd: string | undefined;
	env: Record<string, string | undefined> | undefined;
	prompt: string;
	task: EvalTask;
}

interface ProcessCall {
	args: string[];
	command: string;
	cwd: string | undefined;
	env: Record<string, string | undefined> | undefined;
}

interface DspyPayload {
	context: string;
	model: string;
	query: string;
}

function promptArg(args: readonly string[], flag: string): string {
	const index = args.indexOf(flag);
	return index === -1 ? "" : args[index + 1] ?? "";
}

function parseDspyPayload(args: readonly string[]): DspyPayload {
	return JSON.parse(args[2] ?? "{}") as DspyPayload;
}

function timelineEventId(task: EvalTask): string {
	const event = task.metadata?.timelineEvent as JsonObject | undefined;
	return typeof event?.id === "string" ? event.id : task.id;
}
