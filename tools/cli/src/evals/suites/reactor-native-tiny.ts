import { EVAL_SUITE_KIND, EVAL_TASK_KIND, type EvalSuite } from "../types.js";

export const reactorNativeTinySuite: EvalSuite = {
	kind: EVAL_SUITE_KIND,
	id: "reactor-native-tiny",
	title: "Reactor Native Tiny Canary",
	metadata: {
		description:
			"Fast canary tasks for debugging eval plumbing before spending tokens on real Reactor-native timelines.",
		reportUse: "debug-only",
	},
	tasks: [
		{
			kind: EVAL_TASK_KIND,
			id: "quiet-drift-canary",
			title: "Quiet Drift Canary",
			prompt:
				"Canary task: inspect the synthetic receipt state and print exactly `drift detected` if the status changed silently.",
			expected: {
				exitCode: 0,
				stdoutContains: ["drift detected"],
				stderrExcludes: ["API_KEY", "secret"],
				maxKnownCostUsd: 0.05,
			},
			metadata: {
				evalFamily: "quiet-drift",
				reportUse: "debug-only",
			},
			surpriseLabels: ["silent-drift"],
			tags: ["reactor-native", "canary", "cost"],
			timeoutMs: 120_000,
		},
		{
			kind: EVAL_TASK_KIND,
			id: "memoized-verdict-canary",
			title: "Memoized Verdict Canary",
			prompt:
				"Canary task: inspect unchanged evidence and print exactly `reused verdict` if the prior verdict can be reused.",
			expected: {
				exitCode: 0,
				stdoutContains: ["reused verdict"],
				stderrExcludes: ["API_KEY", "secret"],
				maxKnownCostUsd: 0.05,
			},
			metadata: {
				evalFamily: "memoized-verdict",
				reportUse: "debug-only",
			},
			surpriseLabels: ["noop"],
			tags: ["reactor-native", "canary", "memoization"],
			timeoutMs: 120_000,
		},
	],
};
