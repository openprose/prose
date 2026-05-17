import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	EVAL_SUITE_KIND,
	EVAL_TASK_KIND,
	EvalSchemaError,
	REACTOR_PROOF_KIND,
	REACTOR_PROOF_MEDIA_TYPE,
	REACTOR_TIMELINE_CASE_KIND,
	REACTOR_TIMELINE_CASE_MEDIA_TYPE,
	buildDspyRlmCommand,
	buildHermesCommand,
	buildPiCommand,
	createFilesystemArtifactStore,
	createMockEvalAdapter,
	createNamedEvalAdapter,
	createPiEvalAdapter,
	createProcessEvalAdapter,
	formatEvalSuiteSummary,
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
	contract: {
		source: {
			path: "tests/evals/fixtures/quiet-drift-canary.prose.md",
			sha256: "939de0bacfc591264a67abf985f13ffa08d822ed96c3e47d0f279766553c7fe8",
		},
	},
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

	test("keeps Reactor-native canaries tied to public Markdown contracts", () => {
		for (const task of reactorNativeTinySuite.tasks) {
			const source = task.contract?.source;
			if (source === undefined) {
				throw new Error(`missing source contract for ${task.id}`);
			}
			expect(source.path.endsWith(".prose.md")).toBe(true);
			expect(readWorkspaceFile(source.path)).toContain("Markdown responsibility");
			expect(sha256Hex(readWorkspaceFile(source.path))).toBe(source.sha256);
		}
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

	test("validates canonical reportUse metadata with legacy debug-only compatibility", () => {
		expect(
			validateEvalSuite({
				...baseSuite,
				metadata: { reportUse: "debug" },
				tasks: [{ ...baseTask, metadata: { reportUse: "report-eligible" } }],
			}),
		).toEqual(
			expect.objectContaining({
				metadata: { reportUse: "debug" },
			}),
		);

		expect(() =>
			validateEvalSuite({
				...baseSuite,
				metadata: { reportUse: "debug-only" },
			}),
		).not.toThrow();

		expect(() =>
			validateEvalSuite({
				...baseSuite,
				metadata: { reportUse: "report-grade" },
			}),
		).toThrow("suite.metadata.reportUse must be one of: debug, adapter-canary, report-eligible");
	});

	test("rejects unsafe source contract provenance", () => {
		expect(() =>
			validateEvalSuite({
				...baseSuite,
				tasks: [
					{
						...baseTask,
						contract: { source: { path: "../outside.prose.md" } },
					},
				],
			}),
		).toThrow("suite.tasks[0].contract.source.path contains unsafe segment");

		expect(() =>
			validateEvalSuite({
				...baseSuite,
				tasks: [
					{
						...baseTask,
						contract: { source: { path: "tests/evals/fixtures/not-markdown.md" } },
					},
				],
			}),
		).toThrow("suite.tasks[0].contract.source.path must point to a *.prose.md Markdown source");

		expect(() =>
			validateEvalSuite({
				...baseSuite,
				tasks: [
					{
						...baseTask,
						contract: {
							source: {
								path: "tests/evals/fixtures/quiet-drift-canary.prose.md",
								sha256: "not-a-sha",
							},
						},
					},
				],
			}),
		).toThrow("suite.tasks[0].contract.source.sha256 must be a 64-character hex sha256");
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
			expect(taskResult).toEqual(
				expect.objectContaining({
					contract: expect.objectContaining({
						source: expect.objectContaining({ path: "tests/evals/fixtures/quiet-drift-canary.prose.md" }),
					}),
				}),
			);

			const attemptPath = join(root, "run-1", "attempts", "quiet-drift-tiny", "mock", "attempt-1");
			const canonicalTaskResult = JSON.parse(readFileSync(join(attemptPath, "result.json"), "utf8")) as {
				taskId: string;
				status: string;
			};
			const suiteSnapshot = JSON.parse(readFileSync(join(root, "run-1", "suite.json"), "utf8")) as EvalSuite;
			expect(suiteSnapshot.tasks[0]?.contract?.source.path).toBe("tests/evals/fixtures/quiet-drift-canary.prose.md");
			expect(canonicalTaskResult).toEqual(expect.objectContaining({ taskId: "quiet-drift-tiny", status: "passed" }));
			expect(JSON.parse(readFileSync(join(attemptPath, "score.json"), "utf8"))).toEqual(expect.objectContaining({ passed: true }));
			expect(readFileSync(join(attemptPath, "stdout.log"), "utf8")).toBe("drift detected\n");
			expect(readFileSync(join(attemptPath, "stderr.log"), "utf8")).toBe("");

			const events = parseJsonl(readFileSync(join(root, "run-1", "events.jsonl"), "utf8"));
			expect(events.map((event) => event.type)).toEqual(
				expect.arrayContaining(["eval.run_started", "eval.task_started", "model.call", "eval.task_completed", "eval.run_completed"]),
			);
			expect(events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "model.call",
						data: expect.objectContaining({
							taskId: "quiet-drift-tiny",
							contract: expect.objectContaining({
								source: expect.objectContaining({ path: "tests/evals/fixtures/quiet-drift-canary.prose.md" }),
							}),
						}),
					}),
				]),
			);

			const costLedger = parseJsonl(readFileSync(join(root, "run-1", "cost-ledger.jsonl"), "utf8"));
			expect(costLedger).toEqual([
				expect.objectContaining({
					id: "cost-1",
					totalCostUsd: 0.01,
				}),
			]);
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

			const eligibility = JSON.parse(readFileSync(join(root, "run-built-in", "claim-eligibility.json"), "utf8")) as {
				kind: string;
				reportEligible: boolean;
				reasons: Array<{ code: string; taskId?: string }>;
				version: number;
			};
			expect(eligibility.kind).toBe("prose.eval.claim-eligibility.v1");
			expect(eligibility.version).toBe(1);
			expect(result.claimEligibility.reportEligible).toBe(false);
			expect(eligibility.reportEligible).toBe(false);
			expect(eligibility.reasons.map((reason) => reason.code)).toEqual(
				expect.arrayContaining([
					"debug_report_use",
					"mock_adapter",
					"missing_reactor_timeline_case",
					"missing_reactor_proof",
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps failed report-eligible-looking tasks ineligible", async () => {
		const reportEligibleTask: EvalTask = {
			...baseTask,
			expected: { exitCode: 0 },
			metadata: { reportUse: "report-eligible" },
		};
		const result = await runEvalSuite(
			{
				...baseSuite,
				metadata: { reportUse: "report-eligible" },
				tasks: [reportEligibleTask],
			},
			{
				name: "pi",
				runTask: async () => ({
					adapterName: "pi",
					artifacts: [
						{
							bytes: 2,
							mediaType: "application/json",
							path: "/tmp/report-eligible-looking-replay.json",
						},
					],
					durationMs: 1,
					events: [{ type: "replay.available", at: "2026-05-17T12:00:00.000Z" }],
					exitCode: 1,
					metadata: {
						hasNormalizedTrace: true,
						normalizedTracePath: "normalized-trace.json",
						receiptPath: "receipts.json",
						replayPath: "replay.json",
						reportUse: "report-eligible",
					},
					stderr: "",
					stdout: "drift detected\n",
				}),
			},
			{
				runId: "failed-report-eligible-run",
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			},
		);

		expect(result.status).toBe("failed");
		expect(result.claimEligibility.reportEligible).toBe(false);
		expect(result.claimEligibility.reasons.map((reason) => reason.code)).toEqual(
			expect.arrayContaining(["task_failed", "missing_reactor_timeline_case", "missing_reactor_proof"]),
		);
	});

	test("keeps passing tasks without source contracts ineligible", async () => {
		const result = await runEvalSuite(
			{
				...baseSuite,
				metadata: { reportUse: "report-eligible" },
				tasks: [
					{
						...withoutContract(baseTask),
						expected: { exitCode: 0, stdoutContains: ["drift detected"] },
						metadata: { reportUse: "report-eligible" },
					},
				],
			},
			{
				name: "pi",
				runTask: async () => ({
					adapterName: "pi",
					durationMs: 1,
					exitCode: 0,
					stderr: "",
					stdout: "drift detected\n",
				}),
			},
			{
				runId: "missing-contract-run",
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			},
		);

		expect(result.status).toBe("passed");
		expect(result.claimEligibility.reportEligible).toBe(false);
		expect(result.claimEligibility.reasons.map((reason) => reason.code)).toEqual(
			expect.arrayContaining(["missing_source_contract_path", "missing_source_contract_sha"]),
		);
	});

	test("keeps thin native Reactor artifacts ineligible until a native validator exists", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-native-reactor-"));
		try {
			const result = await runEvalSuite(
				{
					...baseSuite,
					metadata: { reportUse: "report-eligible" },
					tasks: [
						{
							...baseTask,
							expected: { exitCode: 0, stdoutContains: ["drift detected"] },
							metadata: { reportUse: "report-eligible" },
						},
					],
				},
				{
					name: "native-reactor",
					runTask: async (task, context) => {
						if (context.artifactStore === undefined || context.attemptArtifactDirectory === undefined) {
							throw new Error("missing artifact store");
						}

						const timeline = await context.artifactStore.writeText(
							`${context.attemptArtifactDirectory}/timeline-case.json`,
							`${JSON.stringify({ kind: REACTOR_TIMELINE_CASE_KIND, taskId: task.id })}\n`,
							REACTOR_TIMELINE_CASE_MEDIA_TYPE,
						);
						const proof = await context.artifactStore.writeText(
							`${context.attemptArtifactDirectory}/proof.json`,
							`${JSON.stringify({
								kind: REACTOR_PROOF_KIND,
								oracle: { frozen: true, sha256: "a".repeat(64) },
								taskId: task.id,
							})}\n`,
							REACTOR_PROOF_MEDIA_TYPE,
						);

						return {
							adapterName: "native-reactor",
							artifacts: [timeline, proof],
							durationMs: 1,
							exitCode: 0,
							stderr: "",
							stdout: "drift detected\n",
						};
					},
				},
				{
					artifactStore: createFilesystemArtifactStore({ root }),
					runId: "native-reactor-run",
					now: () => new Date("2026-05-17T12:00:00.000Z"),
				},
			);

			expect(result.status).toBe("passed");
			expect(result.claimEligibility.reportEligible).toBe(false);
			expect(result.claimEligibility.reasons.map((reason) => reason.code)).toContain("missing_native_validator");
			expect(result.claimEligibility.gates).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "task.reactorTimelineCase", passed: true }),
					expect.objectContaining({ name: "task.reactorProof", passed: true }),
					expect.objectContaining({ name: "task.nativeValidator", passed: false }),
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps tasks with mismatched source contract bytes ineligible", async () => {
		const result = await runEvalSuite(
			{
				...baseSuite,
				metadata: { reportUse: "report-eligible" },
				tasks: [
					{
						...baseTask,
						contract: {
							source: {
								path: "tests/evals/fixtures/quiet-drift-canary.prose.md",
								sha256: "0".repeat(64),
							},
						},
						expected: { exitCode: 0, stdoutContains: ["drift detected"] },
						metadata: { reportUse: "report-eligible" },
					},
				],
			},
			{
				name: "pi",
				runTask: async () => ({
					adapterName: "pi",
					durationMs: 1,
					exitCode: 0,
					stderr: "",
					stdout: "drift detected\n",
				}),
			},
			{
				runId: "source-sha-mismatch-run",
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			},
		);

		expect(result.status).toBe("passed");
		expect(result.claimEligibility.reportEligible).toBe(false);
		expect(result.claimEligibility.reasons.map((reason) => reason.code)).toContain("source_contract_sha_mismatch");
		expect(result.claimEligibility.gates).toEqual(
			expect.arrayContaining([expect.objectContaining({ name: "task.sourceContract.bytesSha256", passed: false })]),
		);
	});

	test("keeps tasks with unreadable source contracts ineligible", async () => {
		const result = await runEvalSuite(
			{
				...baseSuite,
				metadata: { reportUse: "report-eligible" },
				tasks: [
					{
						...baseTask,
						contract: {
							source: {
								path: "tests/evals/fixtures/missing-source.prose.md",
								sha256: "0".repeat(64),
							},
						},
						expected: { exitCode: 0, stdoutContains: ["drift detected"] },
						metadata: { reportUse: "report-eligible" },
					},
				],
			},
			{
				name: "pi",
				runTask: async () => ({
					adapterName: "pi",
					durationMs: 1,
					exitCode: 0,
					stderr: "",
					stdout: "drift detected\n",
				}),
			},
			{
				runId: "source-unreadable-run",
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			},
		);

		expect(result.status).toBe("passed");
		expect(result.claimEligibility.reportEligible).toBe(false);
		expect(result.claimEligibility.reasons.map((reason) => reason.code)).toContain("unreadable_source_contract");
		expect(result.claimEligibility.gates).toEqual(
			expect.arrayContaining([expect.objectContaining({ name: "task.sourceContract.bytesSha256", passed: false })]),
		);
	});

	test("keeps tasks with custom cwd ineligible while still running them", async () => {
		const result = await runEvalSuite(
			{
				...baseSuite,
				metadata: { reportUse: "report-eligible" },
				tasks: [
					{
						...baseTask,
						cwd: join(tmpdir(), "custom-eval-cwd"),
						expected: { exitCode: 0, stdoutContains: ["drift detected"] },
						metadata: { reportUse: "report-eligible" },
					},
				],
			},
			{
				name: "pi",
				runTask: async () => ({
					adapterName: "pi",
					durationMs: 1,
					exitCode: 0,
					stderr: "",
					stdout: "drift detected\n",
				}),
			},
			{
				runId: "custom-cwd-run",
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			},
		);

		expect(result.status).toBe("passed");
		expect(result.claimEligibility.reportEligible).toBe(false);
		expect(result.claimEligibility.reasons.map((reason) => reason.code)).toContain("custom_task_cwd");
		expect(result.claimEligibility.gates).toEqual(
			expect.arrayContaining([expect.objectContaining({ name: "task.cwd", passed: false })]),
		);
	});

	test("marks fail-fast skipped tasks ineligible", async () => {
		const result = await runEvalSuite(
			{
				...baseSuite,
				metadata: { reportUse: "report-eligible" },
				tasks: [
					{ ...baseTask, id: "first-task", expected: { exitCode: 0 }, metadata: { reportUse: "report-eligible" } },
					{ ...baseTask, id: "second-task", expected: { exitCode: 0 }, metadata: { reportUse: "report-eligible" } },
				],
			},
			{
				name: "pi",
				runTask: async () => ({
					adapterName: "pi",
					durationMs: 1,
					exitCode: 1,
					stderr: "",
					stdout: "",
				}),
			},
			{ failFast: true, runId: "fail-fast-run" },
		);

		expect(result.tasks).toHaveLength(1);
		expect(result.claimEligibility.reasons).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "task_missing", taskId: "second-task" })]),
		);
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

	test("treats unknown-confidence cost as unknown even when totalCostUsd is numeric", async () => {
		const result = await runEvalSuite(
			baseSuite,
			createMockEvalAdapter({
				stdout: "drift detected\n",
				events: [{ type: "model.call", at: "2026-05-17T12:00:00.000Z" }],
				costs: [
					{
						id: "unknown-numeric",
						runId: "unknown-confidence-run",
						taskId: "quiet-drift-tiny",
						attemptId: "unknown-confidence-run:quiet-drift-tiny:1",
						adapterName: "mock",
						confidence: "unknown",
						occurredAt: "2026-05-17T12:00:00.000Z",
						totalCostUsd: 0.01,
						currency: "USD",
					},
				],
			}),
			{
				runId: "unknown-confidence-run",
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			},
		);

		expect(result.status).toBe("failed");
		expect(result.totals).toEqual(expect.objectContaining({ knownCostUsd: 0, unknownCostRecords: 1 }));
		expect(result.tasks[0]?.score.checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "unknownCostRecords", passed: false, actual: 1 }),
			]),
		);
	});

	test("filters mismatched adapter cost rows before scoring and ledger writes", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-evals-stale-cost-"));
		try {
			const result = await runEvalSuite(
				baseSuite,
				createMockEvalAdapter({
					stdout: "drift detected\n",
					events: [{ type: "model.call", at: "2026-05-17T12:00:00.000Z" }],
					costs: [
						{
							id: "stale-cost",
							runId: "old-run",
							taskId: "quiet-drift-tiny",
							attemptId: "old-run:quiet-drift-tiny:1",
							adapterName: "mock",
							confidence: "provider-reconciled",
							occurredAt: "2026-05-17T12:00:00.000Z",
							totalCostUsd: 0.01,
							currency: "USD",
						},
					],
				}),
				{
					artifactStore: createFilesystemArtifactStore({ root }),
					runId: "current-run",
					now: () => new Date("2026-05-17T12:00:00.000Z"),
				},
			);

			expect(result.status).toBe("failed");
			expect(result.tasks[0]?.attempt.metadata).toEqual(expect.objectContaining({ costRecordMismatchCount: 1 }));
			expect(result.tasks[0]?.attempt.events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "eval.cost_record_mismatch",
						data: expect.objectContaining({
							costRecordId: "stale-cost",
							mismatchedFields: expect.arrayContaining(["runId", "attemptId"]),
						}),
					}),
				]),
			);
			expect(result.tasks[0]?.attempt.costs).toEqual([
				expect.objectContaining({
					id: "unknown:current-run:quiet-drift-tiny:1",
					confidence: "unknown",
					runId: "current-run",
				}),
			]);

			const costLedger = parseJsonl(readFileSync(join(root, "current-run", "cost-ledger.jsonl"), "utf8"));
			expect(costLedger).toEqual([
				expect.objectContaining({
					id: "unknown:current-run:quiet-drift-tiny:1",
					confidence: "unknown",
				}),
			]);
			expect(JSON.stringify(costLedger)).not.toContain("stale-cost");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not let synthetic unknown costs satisfy requiresCost by default", async () => {
		const requiresCostSuite: EvalSuite = {
			...baseSuite,
			tasks: [
				{
					...baseTask,
					id: "requires-cost",
					expected: {
						exitCode: 0,
						requiresCost: true,
					},
				},
			],
		};

		const result = await runEvalSuite(requiresCostSuite, createMockEvalAdapter(), {
			runId: "requires-cost-run",
			now: () => new Date("2026-05-17T12:00:00.000Z"),
		});

		expect(result.status).toBe("failed");
		expect(result.tasks[0]?.attempt.costs?.[0]).toEqual(
			expect.objectContaining({
				confidence: "unknown",
				id: "unknown:requires-cost-run:requires-cost:1",
			}),
		);
		expect(result.tasks[0]?.score.checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "unknownCostRecords", passed: false, actual: 1 }),
			]),
		);
	});

	test("does not let mismatched cost rows satisfy requiresCost", async () => {
		const requiresCostSuite: EvalSuite = {
			...baseSuite,
			tasks: [
				{
					...baseTask,
					id: "requires-cost-mismatch",
					expected: {
						exitCode: 0,
						requiresCost: true,
					},
				},
			],
		};

		const result = await runEvalSuite(
			requiresCostSuite,
			createMockEvalAdapter({
				costs: [
					{
						id: "wrong-task-cost",
						runId: "requires-cost-mismatch-run",
						taskId: "other-task",
						attemptId: "requires-cost-mismatch-run:requires-cost-mismatch:1",
						adapterName: "mock",
						confidence: "response-usage",
						occurredAt: "2026-05-17T12:00:00.000Z",
						promptTokens: 11,
						completionTokens: 3,
						totalTokens: 14,
					},
				],
			}),
			{
				runId: "requires-cost-mismatch-run",
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			},
		);

		expect(result.status).toBe("failed");
		expect(result.tasks[0]?.attempt.events).toEqual(
			expect.arrayContaining([expect.objectContaining({ type: "eval.cost_record_mismatch" })]),
		);
		expect(result.tasks[0]?.score.checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "costEvidencePresent", passed: false }),
				expect.objectContaining({ name: "unknownCostRecords", passed: false, actual: 1 }),
			]),
		);
	});

	test("allows unknown requiresCost only when explicitly requested", async () => {
		const requiresUnknownCostSuite: EvalSuite = {
			...baseSuite,
			tasks: [
				{
					...baseTask,
					id: "requires-unknown-cost",
					expected: {
						allowUnknownCost: true,
						exitCode: 0,
						requiresCost: true,
					},
				},
			],
		};

		const result = await runEvalSuite(requiresUnknownCostSuite, createMockEvalAdapter(), {
			runId: "requires-unknown-cost-run",
			now: () => new Date("2026-05-17T12:00:00.000Z"),
		});

		expect(result.status).toBe("passed");
		expect(result.totals.unknownCostRecords).toBe(1);
		expect(result.tasks[0]?.score.checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "unknownCostRecords", passed: true, actual: 1, expected: "allowed" }),
			]),
		);
	});

	test("accepts token-only known usage for requiresCost", async () => {
		const requiresCostSuite: EvalSuite = {
			...baseSuite,
			tasks: [
				{
					...baseTask,
					id: "requires-token-cost",
					expected: {
						exitCode: 0,
						requiresCost: true,
					},
				},
			],
		};

		const result = await runEvalSuite(
			requiresCostSuite,
			createMockEvalAdapter({
				costs: [
					{
						id: "usage-1",
						runId: "token-cost-run",
						taskId: "requires-token-cost",
						attemptId: "token-cost-run:requires-token-cost:1",
						adapterName: "mock",
						confidence: "response-usage",
						occurredAt: "2026-05-17T12:00:00.000Z",
						promptTokens: 11,
						completionTokens: 3,
						totalTokens: 14,
					},
				],
			}),
			{
				runId: "token-cost-run",
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			},
		);

		expect(result.status).toBe("passed");
		expect(result.tasks[0]?.score.checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "costEvidencePresent", passed: true }),
				expect.objectContaining({ name: "unknownCostRecords", passed: true, actual: 0 }),
			]),
		);
	});

	test("marks mock attempts as debug and surfaces that in summaries", async () => {
		const result = await runEvalSuite(baseSuite, createMockEvalAdapter({ stdout: "drift detected\n" }), {
			runId: "debug-run",
			now: () => new Date("2026-05-17T12:00:00.000Z"),
		});

		expect(result.tasks[0]?.attempt.metadata).toEqual(
			expect.objectContaining({
				adapterKind: "mock",
				debugOnly: true,
				reportUse: "debug",
			}),
		);
		expect(formatEvalSuiteSummary(result)).toContain("report_use: debug");
		expect(formatEvalSuiteSummary(result)).toContain("claim_eligible: false");
		expect(formatEvalSuiteSummary(result)).toContain("claim_reason_codes: debug_report_use");
		expect(formatEvalSuiteSummary(result)).toContain("debug_attempts: 1");
		expect(formatEvalSuiteSummary(result)).toContain("debug_only_attempts: 1");
	});

	test("surfaces task-level reportUse metadata in summaries", async () => {
		const result = await runEvalSuite(
			{
				...baseSuite,
				tasks: [
					{
						...baseTask,
						expected: { exitCode: 0, stdoutContains: ["drift detected"] },
						metadata: { reportUse: "report-eligible" },
					},
				],
			},
			{
				name: "pi",
				runTask: async () => ({
					adapterName: "pi",
					durationMs: 1,
					exitCode: 0,
					stderr: "",
					stdout: "drift detected\n",
				}),
			},
			{
				runId: "task-report-use-summary-run",
				now: () => new Date("2026-05-17T12:00:00.000Z"),
			},
		);

		expect(formatEvalSuiteSummary(result)).toContain("report_use: report-eligible");
		expect(result.claimEligibility.reasons.map((reason) => reason.code)).not.toContain("missing_report_use");
	});

	test("redacts inherited secret-like process env values from runner results", async () => {
		const key = "PROSE_EVAL_RUNNER_SECRET";
		const previous = process.env[key];
		const secret = "runner-secret-value-123456";
		process.env[key] = secret;
		try {
			const result = await runEvalSuite(
				baseSuite,
				createMockEvalAdapter({
					stdout: `drift detected ${secret}\n`,
					stderr: `stderr ${secret}\n`,
					events: [
						{
							type: "model.call",
							at: "2026-05-17T12:00:00.000Z",
							message: `event ${secret}`,
							data: { secret },
						},
					],
					costs: [
						{
							id: "redacted-cost",
							runId: "runner-redaction-run",
							taskId: "quiet-drift-tiny",
							attemptId: "runner-redaction-run:quiet-drift-tiny:1",
							adapterName: "mock",
							confidence: "provider-reconciled",
							occurredAt: "2026-05-17T12:00:00.000Z",
							totalCostUsd: 0.01,
							currency: "USD",
							metadata: { secret },
						},
					],
					metadata: { secret },
				}),
				{
					runId: "runner-redaction-run",
					now: () => new Date("2026-05-17T12:00:00.000Z"),
				},
			);

			const attemptJson = JSON.stringify(result.tasks[0]?.attempt);
			expect(attemptJson).toContain("[REDACTED]");
			expect(attemptJson).not.toContain(secret);
			expect(result.status).toBe("passed");
		} finally {
			if (previous === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = previous;
			}
		}
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

function readWorkspaceFile(relativePath: string): string {
	for (const candidate of [join(process.cwd(), relativePath), join(process.cwd(), "tools/cli", relativePath)]) {
		if (existsSync(candidate)) {
			return readFileSync(candidate, "utf8");
		}
	}

	throw new Error(`could not find workspace file: ${relativePath}`);
}

function sha256Hex(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseJsonl(value: string): Array<Record<string, unknown>> {
	return value
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function withoutContract(task: EvalTask): EvalTask {
	const copy = { ...task };
	delete copy.contract;
	return copy;
}

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
			expect(stdout).toContain("claim_eligible: false");
			expect(stdout).toContain("claim_reason_codes:");
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

	test("writes Pi RPC transcripts into attempt-scoped artifacts", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-pi-transcript-"));
		try {
			const result = await runEvalSuite(
				{
					...baseSuite,
					tasks: [{ ...baseTask, expected: { exitCode: 0, stdoutContains: ["drift detected"] } }],
				},
				createPiEvalAdapter({
					rpcRunner: async () => ({
						exitCode: 0,
						lastAssistantText: "drift detected",
						records: [{ type: "agent_end" }],
						stderr: "",
						stdout: "",
					}),
				}),
				{
					artifactStore: createFilesystemArtifactStore({ root }),
					runId: "pi-transcript-run",
				},
			);

			const transcriptPath = join(
				root,
				"pi-transcript-run",
				"attempts",
				"quiet-drift-tiny",
				"pi",
				"attempt-1",
				"rpc-transcript.json",
			);
			expect(result.tasks[0]?.attempt.artifacts?.map((artifact) => artifact.path)).toContain(transcriptPath);
			expect(existsSync(transcriptPath)).toBe(true);
			expect(existsSync(join(root, "pi-transcript-run", "quiet-drift-tiny", "pi", "rpc-transcript.json"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
