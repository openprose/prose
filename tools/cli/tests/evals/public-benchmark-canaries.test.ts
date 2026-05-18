import { describe, expect, test } from "vitest";

import {
	PUBLIC_BENCHMARK_CANARY_SPECS,
	PUBLIC_BENCHMARK_COMPETITORS,
	PUBLIC_BENCHMARK_STACK_ORDER,
	createPublicBenchmarkCanarySuite,
	generatePublicBenchmarkCanaryTasks,
	validateEvalSuite,
	type EvalTask,
} from "../../src/evals/index.js";

describe("public benchmark adapter canaries", () => {
	test("keeps the preregistered public benchmark stack order", () => {
		expect(PUBLIC_BENCHMARK_STACK_ORDER).toEqual([
			"miniwob",
			"toolsandbox",
			"tau-bench",
			"appworld",
			"swe-bench",
			"terminal-bench",
			"trail",
		]);
		expect(PUBLIC_BENCHMARK_CANARY_SPECS.map((spec) => spec.id)).toEqual(PUBLIC_BENCHMARK_STACK_ORDER);
		expect(PUBLIC_BENCHMARK_CANARY_SPECS.map((spec) => spec.stackOrder)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	test("generates adapter-canary tasks across Pi, Hermes, and DSPy without Reactor claims", () => {
		const tasks = generatePublicBenchmarkCanaryTasks();
		const ids = new Set<string>();

		expect(tasks).toHaveLength(PUBLIC_BENCHMARK_CANARY_SPECS.length * PUBLIC_BENCHMARK_COMPETITORS.length);
		for (const task of tasks) {
			expect(ids.has(task.id)).toBe(false);
			ids.add(task.id);
			expect(task.metadata).toEqual(
				expect.objectContaining({
					evidenceUse: "external-context",
					executionMode: "fixture-only",
					reportUse: "adapter-canary",
				}),
			);
			expect(task.expected.stdoutContains?.length).toBeGreaterThan(0);
			expect(task.expected.stdoutContains).toEqual(
				expect.arrayContaining(["report_use=adapter-canary", "evidence_use=external-context"]),
			);
			expect(JSON.stringify(task)).not.toContain("ReactorProofGraphV1");
			expect(JSON.stringify(task.metadata)).not.toContain("\"claim\"");
			expect(task.tags).toEqual(expect.arrayContaining(["public-benchmark", "adapter-canary", "external-context"]));
			expect(task.tags).not.toContain("reactor-native");
		}
	});

	test("builds a valid EvalSuite with non-vacuous expected outcomes", () => {
		const suite = createPublicBenchmarkCanarySuite({
			benchmarks: ["miniwob", "trail"],
			competitors: ["pi", "dspy-rlm"],
		});

		expect(validateEvalSuite(suite)).toBe(suite);
		expect(suite.metadata).toEqual(
			expect.objectContaining({
				evidenceUse: "external-context",
				reportUse: "adapter-canary",
			}),
		);
		expect(suite.tasks).toHaveLength(4);
		for (const task of suite.tasks) {
			assertNonVacuousCanaryTask(task);
		}
	});
});

function assertNonVacuousCanaryTask(task: EvalTask): void {
	expect(task.expected.exitCode).toBe(0);
	expect(task.expected.stdoutContains).toEqual(
		expect.arrayContaining([
			"report_use=adapter-canary",
			"evidence_use=external-context",
			`competitor_id=${task.metadata?.competitorId}`,
			`benchmark_id=${task.metadata?.benchmarkId}`,
		]),
	);
	expect(task.prompt).toContain("Do not install packages");
	expect(task.prompt).toContain(`benchmark_id=${task.metadata?.benchmarkId}`);
	expect(task.prompt).toContain(`competitor_id=${task.metadata?.competitorId}`);
}
