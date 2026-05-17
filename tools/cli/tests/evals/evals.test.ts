import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	EVAL_SUITE_KIND,
	EVAL_TASK_KIND,
	EvalSchemaError,
	createFilesystemArtifactStore,
	createMockEvalAdapter,
	createProcessEvalAdapter,
	loadEvalSuite,
	openRouterGenerationToCostRecord,
	reactorNativeTinySuite,
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
});
