import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	EVAL_SUITE_KIND,
	EVAL_TASK_KIND,
	EvalSchemaError,
	buildDspyRlmCommand,
	buildHermesCommand,
	buildPiCommand,
	createFilesystemArtifactStore,
	createMockEvalAdapter,
	createNamedEvalAdapter,
	createPiEvalAdapter,
	createProcessEvalAdapter,
	loadEvalSuiteByNameOrPath,
	loadEvalSuite,
	openRouterGenerationToCostRecord,
	reactorNativeTinySuite,
	runEvalCli,
	runEvalSuite,
	validateEvalSuite,
	type EvalSuite,
	type EvalTask,
} from "../../src/evals/index.js";

const baseTask: EvalTask = {
	kind: EVAL_TASK_KIND,
	id: "quiet-drift-tiny",
	title: "Quiet drift tiny slice",
	prompt: "Inspect the receipt and report whether the webhook drifted.",
	expected: {
		exitCode: 0,
		stdoutContains: ["drift detected"],
		stderrExcludes: ["secret"],
		eventTypes: ["model.call"],
		maxKnownCostUsd: 0.02,
	},
	surpriseLabels: ["silent-drift"],
};

const baseSuite: EvalSuite = {
	kind: EVAL_SUITE_KIND,
	id: "reactor-native-tiny",
	title: "Reactor native tiny slice",
	tasks: [baseTask],
};

describe("eval schema", () => {
	test("accepts a valid suite", () => {
		expect(validateEvalSuite(baseSuite)).toBe(baseSuite);
		expect(validateEvalSuite(reactorNativeTinySuite)).toBe(reactorNativeTinySuite);
	});

	test("rejects duplicate task ids and invalid surprise labels", () => {
		expect(() =>
			validateEvalSuite({
				...baseSuite,
				tasks: [baseTask, { ...baseTask, title: "duplicate" }],
			}),
		).toThrow("suite.tasks contains duplicate id: quiet-drift-tiny");

		expect(() =>
			validateEvalSuite({
				...baseSuite,
				tasks: [{ ...baseTask, surpriseLabels: ["after-the-fact"] }],
			}),
		).toThrow(EvalSchemaError);
	});

	test("rejects unsafe ids and vacuous expectations", () => {
		expect(() =>
			validateEvalSuite({
				...baseSuite,
				id: "../outside",
			}),
		).toThrow("suite.id must be a safe path segment");

		expect(() =>
			validateEvalSuite({
				...baseSuite,
				tasks: [{ ...baseTask, id: "../../outside" }],
			}),
		).toThrow("suite.tasks[0].id must be a safe path segment");

		expect(() =>
			validateEvalSuite({
				...baseSuite,
				tasks: [{ ...baseTask, expected: {} }],
			}),
		).toThrow("suite.tasks[0].expected must define at least one assertion");
	});

	test("loads suite JSON from disk", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-eval-suite-"));
		try {
			const path = join(root, "suite.json");
			writeFileSync(path, JSON.stringify(baseSuite), "utf8");
			await expect(loadEvalSuite(path)).resolves.toEqual(baseSuite);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("OpenRouter cost mapping", () => {
	test("maps generation accounting into an auditable cost ledger record", () => {
		const record = openRouterGenerationToCostRecord(
			{
				created_at: "2026-05-17T12:00:00.000Z",
				model: "openai/gpt-4.1-mini",
				provider_name: "OpenAI",
				tokens_completion: 7,
				tokens_prompt: "13",
				total_cost: "0.000123",
			},
			{
				adapterName: "pi",
				attemptId: "run-1:quiet-drift-tiny:1",
				generationId: "gen-1",
				role: "agent",
				runId: "run-1",
				surpriseLabel: "silent-drift",
				taskId: "quiet-drift-tiny",
			},
		);

		expect(record).toEqual(
			expect.objectContaining({
				adapterName: "pi",
				confidence: "provider-reconciled",
				generationId: "gen-1",
				model: "openai/gpt-4.1-mini",
				provider: "OpenAI",
				promptTokens: 13,
				completionTokens: 7,
				totalTokens: 20,
				totalCostUsd: 0.000123,
				surpriseLabel: "silent-drift",
			}),
		);
	});
});

describe("eval runner", () => {
	test("runs a suite, scores expectations, summarizes cost, and writes artifacts", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-evals-"));
		try {
			const store = createFilesystemArtifactStore({ root });
			const adapter = createMockEvalAdapter({
				stdout: "drift detected\n",
				stderr: "",
				events: [
					{
						type: "model.call",
						at: "2026-05-17T12:00:00.000Z",
						surpriseLabel: "silent-drift",
					},
				],
				costs: [
					{
						id: "cost-1",
						runId: "run-1",
						taskId: "quiet-drift-tiny",
						attemptId: "run-1:quiet-drift-tiny:1",
						adapterName: "mock",
						confidence: "provider-reconciled",
						occurredAt: "2026-05-17T12:00:00.000Z",
						totalCostUsd: 0.01,
						currency: "USD",
						surpriseLabel: "silent-drift",
					},
				],
			});

			const result = await runEvalSuite(baseSuite, adapter, {
				artifactStore: store,
				runId: "run-1",
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			});

			expect(result.status).toBe("passed");
			expect(result.totals).toEqual({
				failed: 0,
				knownCostUsd: 0.01,
				passed: 1,
				tasks: 1,
				unknownCostRecords: 0,
			});
			expect(result.tasks[0]?.score.checks.every((check) => check.passed)).toBe(true);

			const summary = JSON.parse(readFileSync(join(root, "run-1", "summary.json"), "utf8")) as {
				runId: string;
				status: string;
			};
			const taskResult = JSON.parse(
				readFileSync(join(root, "run-1", "quiet-drift-tiny", "result.json"), "utf8"),
			) as { taskId: string; status: string };

			expect(summary).toEqual(expect.objectContaining({ runId: "run-1", status: "passed" }));
			expect(taskResult).toEqual(expect.objectContaining({ taskId: "quiet-drift-tiny", status: "passed" }));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runs the built-in Reactor-native tiny suite through the named mock adapter", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-evals-built-in-"));
		try {
			const result = await runEvalSuite(reactorNativeTinySuite, createNamedEvalAdapter("mock"), {
				artifactStore: createFilesystemArtifactStore({ root }),
				runId: "run-built-in",
			});

			expect(result.status).toBe("passed");
			expect(result.totals).toEqual({
				failed: 0,
				knownCostUsd: 0,
				passed: 2,
				tasks: 2,
				unknownCostRecords: 0,
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails cost-limited tasks when no trustworthy cost record is present", async () => {
		const result = await runEvalSuite(baseSuite, createMockEvalAdapter({ stdout: "drift detected\n" }), {
			runId: "missing-cost-run",
			now: () => new Date("2026-05-17T12:00:00.000Z"),
		});

		expect(result.status).toBe("failed");
		expect(result.tasks[0]?.attempt.costs?.[0]).toEqual(
			expect.objectContaining({
				confidence: "unknown",
				id: "unknown:missing-cost-run:quiet-drift-tiny:1",
			}),
		);
		expect(result.tasks[0]?.score.checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "unknownCostRecords", passed: false, actual: 1 }),
			]),
		);
	});

	test("records adapter exceptions as failed task artifacts instead of aborting the suite", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-evals-error-"));
		try {
			const result = await runEvalSuite(
				baseSuite,
				{
					name: "mock",
					runTask: async () => {
						throw new Error("adapter exploded");
					},
				},
				{
					artifactStore: createFilesystemArtifactStore({ root }),
					runId: "error-run",
				},
			);

			expect(result.status).toBe("failed");
			expect(result.tasks[0]?.attempt.stderr).toBe("adapter exploded\n");
			expect(result.tasks[0]?.attempt.events?.[0]).toEqual(
				expect.objectContaining({ type: "eval.adapter_error", message: "adapter exploded" }),
			);
			expect(readFileSync(join(root, "error-run", "quiet-drift-tiny", "result.json"), "utf8")).toContain(
				"adapter exploded",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects unsafe run ids before creating artifact directories", async () => {
		await expect(runEvalSuite(baseSuite, createMockEvalAdapter(), { runId: "../outside" })).rejects.toThrow(
			"runId must be a safe path segment",
		);
	});

	test("keeps process adapters injectable for harness-specific packaging smoke tests", async () => {
		const calls: unknown[] = [];
		const adapter = createProcessEvalAdapter({
			name: "process-smoke",
			command: "agent-cli",
			args: ["--json"],
			runner: async (command, args, options) => {
				calls.push({ command, args, env: options.env });
				options.stdout.write("drift detected\n");
				return { exitCode: 0 };
			},
		});

		const result = await adapter.runTask(baseTask, {
			attemptId: "run-1:quiet-drift-tiny:1",
			env: { OPENROUTER_API_KEY: "redacted-test-value" },
			runId: "run-1",
			startedAt: "2026-05-17T12:00:00.000Z",
		});

		expect(result).toEqual(
			expect.objectContaining({
				adapterName: "process-smoke",
				exitCode: 0,
				stdout: "drift detected\n",
			}),
		);
		expect(calls).toEqual([
			{
				command: "agent-cli",
				args: ["--json", baseTask.prompt],
				env: { OPENROUTER_API_KEY: "redacted-test-value" },
			},
		]);
	});

	test("redacts secret-like process output before scoring and artifacts", async () => {
		const secret = "sk-test-secret-1234567890";
		const adapter = createProcessEvalAdapter({
			name: "process-smoke",
			command: "agent-cli",
			runner: async (_command, _args, options) => {
				options.stdout.write(`drift detected ${secret}\n`);
				return { exitCode: 0 };
			},
		});

		const result = await adapter.runTask(baseTask, {
			attemptId: "run-1:quiet-drift-tiny:1",
			env: { OPENROUTER_API_KEY: secret },
			runId: "run-1",
			startedAt: "2026-05-17T12:00:00.000Z",
		});

		expect(result.stdout).toContain("drift detected [REDACTED]");
		expect(result.stdout).not.toContain(secret);
	});
});

describe("eval suite and CLI registry", () => {
	test("loads a built-in suite by name", async () => {
		await expect(loadEvalSuiteByNameOrPath("reactor-native-tiny")).resolves.toBe(reactorNativeTinySuite);
	});

	test("runs the CLI helper with mock adapter and writes artifacts", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-eval-cli-"));
		let stdout = "";
		let stderr = "";
		try {
			const exitCode = await runEvalCli(
				["--suite", "reactor-native-tiny", "--adapter", "mock", "--artifacts", root],
				{
					stdout: { write: (chunk: string) => void (stdout += chunk) },
					stderr: { write: (chunk: string) => void (stderr += chunk) },
				},
				{ runId: "cli-run-1" },
			);

			expect(exitCode).toBe(0);
			expect(stderr).toBe("");
			expect(stdout).toContain("status: passed");
			expect(stdout).toContain("tasks: 2/2 passed");
			expect(readFileSync(join(root, "cli-run-1", "summary.json"), "utf8")).toContain("reactor-native-tiny");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("requires explicit network and spend opt-in for non-mock CLI adapters", async () => {
		let stdout = "";
		let stderr = "";
		const exitCode = await runEvalCli(
			["--suite", "reactor-native-tiny", "--adapter", "pi"],
			{
				stdout: { write: (chunk: string) => void (stdout += chunk) },
				stderr: { write: (chunk: string) => void (stderr += chunk) },
			},
			{ runId: "blocked-run" },
		);

		expect(exitCode).toBe(1);
		expect(stdout).toBe("");
		expect(stderr).toContain("requires explicit --allow-network and --allow-spend");
	});
});

describe("public harness adapter command builders", () => {
	test("builds a small isolated Pi print-mode command", () => {
		expect(
			buildPiCommand(baseTask, {
				mode: "print",
				model: "openrouter/openai/gpt-4.1-mini",
				provider: "openrouter",
				tools: ["read", "grep"],
			}),
		).toEqual({
			command: "npx",
			args: [
				"-y",
				"@earendil-works/pi-coding-agent@0.75.0",
				"--provider",
				"openrouter",
				"--model",
				"openrouter/openai/gpt-4.1-mini",
				"--tools",
				"read,grep",
				"--no-session",
				"--no-context-files",
				"--no-extensions",
				"--no-skills",
				"--no-prompt-templates",
				"--no-themes",
				"-p",
				baseTask.prompt,
			],
		});
	});

	test("builds an isolated Hermes oneshot command", () => {
		expect(
			buildHermesCommand(baseTask, {
				model: "openrouter/openai/gpt-4.1-mini",
				provider: "openrouter",
				toolsets: ["filesystem"],
			}),
		).toEqual({
			command: "hermes",
			args: [
				"chat",
				"-q",
				baseTask.prompt,
				"-Q",
				"--source",
				"tool",
				"--max-turns",
				"10",
				"--ignore-user-config",
				"--ignore-rules",
				"--accept-hooks",
				"--provider",
				"openrouter",
				"--model",
				"openrouter/openai/gpt-4.1-mini",
				"--toolsets",
				"filesystem",
			],
		});
	});

	test("builds a bounded DSPy.RLM worker command without embedding secrets", () => {
		const command = buildDspyRlmCommand(baseTask, {
			maxIterations: 3,
			maxLlmCalls: 5,
			maxTokens: 500,
			model: "openrouter/openai/gpt-4.1-mini",
		});

		expect(command.command).toBe("python3");
		expect(command.args[0]).toBe("-c");
		expect(command.args[1]).toContain("dspy.RLM");
		expect(command.args[1]).not.toContain("OPENROUTER_API_KEY=");
		expect(JSON.parse(command.args[2] ?? "{}")).toEqual(
			expect.objectContaining({
				max_iterations: 3,
				max_llm_calls: 5,
				max_tokens: 500,
				model: "openrouter/openai/gpt-4.1-mini",
				query: baseTask.prompt,
			}),
		);
	});

	test("runs Pi RPC adapter through an injectable runner and maps session stats", async () => {
		const adapter = createPiEvalAdapter({
			model: "anthropic/claude-3-5-sonnet-20241022",
			rpcRunner: async (command, args, options) => {
				expect(command).toBe("npx");
				expect(args).toEqual(
					expect.arrayContaining([
						"@earendil-works/pi-coding-agent@0.75.0",
						"--mode",
						"rpc",
						"--no-session",
						"--no-context-files",
					]),
				);
				expect(options.env?.PI_CODING_AGENT_DIR).toContain("pi-agent");
				return {
					exitCode: 0,
					stdout: "",
					stderr: "",
					lastAssistantText: "drift detected",
					sessionStats: {
						cost: 0.012,
						tokens: {
							prompt: 100,
							completion: 20,
						},
					},
					records: [
						{ id: "run-1:quiet-drift-tiny:1:prompt", type: "response", success: true },
						{ type: "agent_end" },
					],
				};
			},
			writeTranscript: false,
		});

		const result = await adapter.runTask(baseTask, {
			adapterRunDirectory: "/tmp/prose-pi-run",
			attemptId: "run-1:quiet-drift-tiny:1",
			runId: "run-1",
			startedAt: "2026-05-17T12:00:00.000Z",
		});

		expect(result).toEqual(
			expect.objectContaining({
				adapterName: "pi",
				exitCode: 0,
				stdout: "drift detected",
			}),
		);
		expect(result.costs?.[0]).toEqual(
			expect.objectContaining({
				adapterName: "pi",
				completionTokens: 20,
				confidence: "response-usage",
				promptTokens: 100,
				totalCostUsd: 0.012,
				totalTokens: 120,
			}),
		);
	});
});
