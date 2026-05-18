import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	PHASE_1B_REACTOR_SCENARIO_CORPUS,
	REACTOR_ORACLE_SPEC_KIND,
	REACTOR_TIMELINE_CASE_KIND,
	appendProxyModelCallRecord,
	createCodexTimelineAdapter,
	createDspyRlmTimelineAdapter,
	createFilesystemArtifactStore,
	createHermesTimelineAdapter,
	createOpenClawTimelineAdapter,
	createPiTimelineAdapter,
	notRunPhase1bCompetitorRows,
	runReactorTimelineCase,
	scorePhase1bTimelineRun,
	type DockerComposeRunOptions,
	type EvalTask,
	type JsonObject,
	type ProxyModelCallRecord,
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
			expect(calls[0]?.task.metadata).toEqual(
				expect.objectContaining({
					evidenceUse: "external-context",
					reportUse: "adapter-canary",
				}),
			);
			expect(calls[0]?.task.tags).toEqual(expect.arrayContaining(["adapter-canary", "external-context"]));
			expect(calls[0]?.prompt).toContain('"id": "receipt-issued"');
			expect(calls[0]?.prompt).not.toContain('"id": "forecast-recheck"');
			expect(result.steps[0]?.metadata).toEqual(
				expect.objectContaining({
					evidenceUse: "external-context",
					reportUse: "adapter-canary",
				}),
			);
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

	test("plans Pi, Hermes, and DSPy container runs with pinned packages, proxy auth, and corrected commands", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-container-timeline-artifacts-"));
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-container-timeline-cache-"));
		try {
			const piArtifacts = join(root, "pi");
			const hermesArtifacts = join(root, "hermes");
			const dspyArtifacts = join(root, "dspy");
			const piRunner = new FakeComposeRunner(piArtifacts, "pi says action completed\n");
			const hermesRunner = new FakeComposeRunner(hermesArtifacts, "hermes says action completed\n");
			const dspyRunner = new FakeComposeRunner(dspyArtifacts, "dspy says recheck completed\n");

			const pi = createPiTimelineAdapter({
				isolation: {
					artifactHostPath: piArtifacts,
					composeRunner: piRunner,
					egressProxyToken: "test-proxy-token",
					harnessImage: "eval-pi-harness:0.75.0",
				},
			});
			const piResult = await runReactorTimelineCase({ ...timelineCase, events: [timelineCase.events[0]!] }, pi, {
				env: {
					OPENROUTER_API_KEY: "test-openrouter-key",
				},
				runId: "pi-container-run",
				scenarioCacheRoot: cacheRoot,
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});
			const piCommand = isolationCommand(piResult.steps[0]?.metadata);
			const piHarness = service(piRunner.composePlan(), "harness");

			expect(piResult.status).toBe("passed");
			expect(piCommand.join("\0")).toContain("prose-pi-openrouter-proxy-extension.mjs");
			expect(piCommand).toEqual(expect.arrayContaining(["pi", "--provider", "prose-egress-proxy"]));
			expect(piCommand).toEqual(
				expect.arrayContaining(["--model", "google/gemini-3.1-flash-lite-preview", "--mode", "json"]),
			);
			expect(piHarness.environment).toEqual(
				expect.objectContaining({
					OPENAI_BASE_URL: "http://egress-proxy:3128/api/v1",
					OPENROUTER_API_KEY: "test-proxy-token",
					PROSE_EVAL_DECISION_CID: expect.stringMatching(/^[a-f0-9]{64}$/),
					PROSE_EVAL_EGRESS_PROXY_AUTHORIZATION: "Bearer test-proxy-token",
				}),
			);
			expect(JSON.stringify(piHarness.environment)).not.toContain("test-openrouter-key");

			const hermes = createHermesTimelineAdapter({
				isolation: {
					artifactHostPath: hermesArtifacts,
					composeRunner: hermesRunner,
					egressProxyToken: "test-proxy-token",
					harnessImage: "python:3.12-slim",
				},
			});
			const hermesResult = await runReactorTimelineCase({ ...timelineCase, events: [timelineCase.events[0]!] }, hermes, {
				env: {
					OPENROUTER_API_KEY: "test-openrouter-key",
				},
				runId: "hermes-container-run",
				scenarioCacheRoot: cacheRoot,
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});
			const hermesCommand = isolationCommand(hermesResult.steps[0]?.metadata);
			const hermesCompose = hermesRunner.composePlan();
			const hermesHarness = service(hermesCompose, "harness");

			expect(hermesResult.status).toBe("passed");
			expect(hermesCommand.join("\0")).toContain("hermes-agent==0.13.0");
			expect(hermesCommand.join("\0")).toContain("$$HERMES_HOME/config.yaml");
			expect(hermesCommand.join("\0")).not.toContain("${OPENAI_API_KEY}");
			expect(hermesCommand.join("\0")).not.toContain("api_key:");
			expect(hermesCommand).toEqual(expect.arrayContaining(["hermes", "chat", "-q", "-Q", "--source", "tool"]));
			expect(hermesCommand).not.toContain("--ignore-user-config");
			expect(hermesCommand).not.toEqual(expect.arrayContaining(["-z", "--oneshot"]));
			expect(hermesCommand).toEqual(
				expect.arrayContaining([
					"--provider",
					"prose-egress-proxy",
					"--model",
					"google/gemini-3.1-flash-lite-preview",
				]),
			);
			expect(hermesHarness.environment).toEqual(
				expect.objectContaining({
					HTTPS_PROXY: "http://egress-proxy:3128",
					OPENAI_BASE_URL: "http://egress-proxy:3128/api/v1",
					OPENROUTER_API_KEY: "test-proxy-token",
					PROSE_EVAL_DECISION_CID: expect.stringMatching(/^[a-f0-9]{64}$/),
					PROSE_EVAL_EGRESS_PROXY_AUTHORIZATION: "Bearer test-proxy-token",
					PROSE_EVAL_EGRESS_PROXY_TOKEN: "test-proxy-token",
				}),
			);
			expect(JSON.stringify(hermesHarness.environment)).not.toContain("test-openrouter-key");
			expect(hermesResult.steps[0]?.metrics).toEqual(
				expect.objectContaining({
					acted: 1,
					modelCalls: 1,
					unreconciledEffects: 0,
				}),
			);
			expect(hermesResult.steps[0]?.metadata).toEqual(
				expect.objectContaining({
					evidenceUse: "external-context",
					reportUse: "adapter-canary",
				}),
			);

			const dspy = createDspyRlmTimelineAdapter({
				isolation: {
					artifactHostPath: dspyArtifacts,
					composeRunner: dspyRunner,
					egressProxyToken: "test-proxy-token",
					harnessImage: "python:3.12-slim",
				},
			});
			const dspyResult = await runReactorTimelineCase({ ...timelineCase, events: [timelineCase.events[1]!] }, dspy, {
				env: {
					OPENROUTER_API_KEY: "test-openrouter-key",
				},
				runId: "dspy-container-run",
				scenarioCacheRoot: cacheRoot,
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});
			const dspyCommand = isolationCommand(dspyResult.steps[0]?.metadata);
			const dspyPayload = parseDspyPayload(dspyCommand);
			const dspyHarness = service(dspyRunner.composePlan(), "harness");

			expect(dspyResult.status).toBe("passed");
			expect(dspyCommand.join("\0")).toContain("dspy==3.2.1");
			expect(dspyCommand).toEqual(expect.arrayContaining(["python3", "-c"]));
			expect(dspyPayload.model).toBe("openai/google/gemini-3.1-flash-lite-preview");
			expect(dspyHarness.command.join("\0")).toContain("dspy==3.2.1");
			expect(dspyHarness.environment).toEqual(
				expect.objectContaining({
					HTTP_PROXY: "http://egress-proxy:3128",
					LITELLM_LOCAL_MODEL_COST_MAP: "True",
					OPENAI_BASE_URL: "http://egress-proxy:3128/api/v1",
					OPENROUTER_API_KEY: "test-proxy-token",
					PROSE_EVAL_DECISION_CID: expect.stringMatching(/^[a-f0-9]{64}$/),
					PROSE_EVAL_EGRESS_PROXY_AUTHORIZATION: "Bearer test-proxy-token",
				}),
			);
			expect(JSON.stringify(dspyHarness.environment)).not.toContain("test-openrouter-key");
			expect(dspyResult.steps[0]?.metrics).toEqual(
				expect.objectContaining({
					modelCalls: 1,
					rechecked: 1,
					unreconciledEffects: 0,
				}),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(cacheRoot, { recursive: true, force: true });
		}
	});

	test("containerized competitor success can replace prior Phase-1b not-run rows with observable metrics", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-container-phase1b-artifacts-"));
		const cacheRoot = mkdtempSync(join(tmpdir(), "prose-container-phase1b-cache-"));
		try {
			const scenario = PHASE_1B_REACTOR_SCENARIO_CORPUS[0]!;
			const notRun = notRunPhase1bCompetitorRows([scenario], ["hermes"])[0]!;
			const runner = new FakeComposeRunner(root, "action completed\n");
			const adapter = createHermesTimelineAdapter({
				isolation: {
					artifactHostPath: root,
					composeRunner: runner,
					egressProxyToken: "test-proxy-token",
					harnessImage: "python:3.12-slim",
				},
			});

			const result = await runReactorTimelineCase(scenario, adapter, {
				env: {
					OPENROUTER_API_KEY: "test-openrouter-key",
				},
				runId: "phase-1b-hermes-container",
				scenarioCacheRoot: cacheRoot,
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});
			const row = scorePhase1bTimelineRun(scenario, result);

			expect(notRun).toEqual(expect.objectContaining({ status: "not-run", modelCalls: 0 }));
			expect(row).toEqual(
				expect.objectContaining({
					adapterName: "hermes",
					status: "passed",
				}),
			);
			expect(row.modelCalls).toBeGreaterThan(0);
			expect(result.costs[0]?.generationId).toBe("gen-fixture-model-call");
			expect(row.acted).toBeGreaterThan(0);
			expect(row.steps.length).toBe(scenario.events.length);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(cacheRoot, { recursive: true, force: true });
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

interface ComposePlan {
	services: Record<string, ComposeService>;
}

interface ComposeService {
	command: string[];
	environment: Record<string, string>;
}

interface ComposeCall {
	args: string[];
	options: DockerComposeRunOptions;
}

class FakeComposeRunner {
	readonly calls: ComposeCall[] = [];

	constructor(
		private readonly artifactHostPath: string,
		private readonly output: string,
	) {}

	async run(args: readonly string[], options: DockerComposeRunOptions): Promise<{ exitCode: number }> {
		this.calls.push({ args: [...args], options });
		if (args.includes("up")) {
			options.stdout?.write(this.output);
			appendProxyModelCallRecord(join(this.artifactHostPath, "model-calls.jsonl"), modelCallRecord());
		}
		return { exitCode: 0 };
	}

	composePlan(): ComposePlan {
		const composePath = this.calls[0]?.args[this.calls[0].args.indexOf("-f") + 1];
		if (composePath === undefined) {
			throw new Error("missing compose file path");
		}

		const command = commandFromCompose(readFile(composePath));
		return {
			services: {
				harness: {
					command,
					environment: environmentFromCompose(readFile(composePath), "harness"),
				},
			},
		};
	}
}

function promptArg(args: readonly string[], flag: string): string {
	const index = args.indexOf(flag);
	return index === -1 ? "" : args[index + 1] ?? "";
}

function parseDspyPayload(args: readonly string[]): DspyPayload {
	const inlineIndex = args.indexOf("-c");
	return JSON.parse(args[inlineIndex + 2] ?? "{}") as DspyPayload;
}

function timelineEventId(task: EvalTask): string {
	const event = task.metadata?.timelineEvent as JsonObject | undefined;
	return typeof event?.id === "string" ? event.id : task.id;
}

function isolationCommand(metadata: JsonObject | undefined): string[] {
	const attemptMetadata = metadata?.attemptMetadata as JsonObject | undefined;
	const isolation = attemptMetadata?.isolation as JsonObject | undefined;
	return Array.isArray(isolation?.command) ? isolation.command.map(String) : [];
}

function service(compose: ComposePlan, name: string): ComposeService {
	const found = compose.services[name];
	if (found === undefined) {
		throw new Error(`missing compose service: ${name}`);
	}

	return found;
}

function readFile(path: string): string {
	return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function commandFromCompose(contents: string): string[] {
	const lines = contents.split(/\r?\n/);
	const commandIndex = lines.findIndex((line) => line.trim() === "command:");
	if (commandIndex === -1) {
		return [];
	}
	const command: string[] = [];
	for (const line of lines.slice(commandIndex + 1)) {
		const match = /^\s+- (.*)$/.exec(line);
		if (match === null) {
			break;
		}
		command.push(JSON.parse(match[1] ?? "\"\"") as string);
	}
	return command;
}

function environmentFromCompose(contents: string, serviceName: string): Record<string, string> {
	const lines = contents.split(/\r?\n/);
	const serviceIndex = lines.findIndex((line) => line.trim() === `${serviceName}:`);
	const environmentIndex = lines.findIndex((line, index) => index > serviceIndex && line.trim() === "environment:");
	const environment: Record<string, string> = {};
	for (const line of lines.slice(environmentIndex + 1)) {
		const match = /^\s{6}([A-Za-z0-9_]+): (.*)$/.exec(line);
		if (match === null) {
			break;
		}
		environment[match[1]!] = JSON.parse(match[2] ?? "\"\"") as string;
	}
	return environment;
}

function modelCallRecord(): ProxyModelCallRecord {
	return {
		cid: "1".repeat(64),
		completion_tokens: 7,
		decision_cid: "2".repeat(64),
		metadata: {
			request: {
				body_bytes: 42,
				headers: {
					authorization: "[REDACTED]",
					"content-type": "application/json",
				},
				method: "POST",
				url: "https://openrouter.ai/api/v1/chat/completions",
			},
			response: {
				body_bytes: 84,
				generation_id: "gen-fixture-model-call",
				headers: {
					"content-type": "application/json",
				},
				status: 200,
				status_text: "OK",
				usage_cost_usd: 0.00001,
			},
		},
		model_version: "google/gemini-3.1-flash-lite-preview",
		prompt_tokens: 12,
		provider: "openrouter",
		request_cid: "3".repeat(64),
		response_cid: "4".repeat(64),
		type: "ModelCall",
	};
}
