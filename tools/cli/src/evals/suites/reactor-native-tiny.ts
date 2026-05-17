import { EVAL_SUITE_KIND, EVAL_TASK_KIND, type EvalSuite } from "../types.js";

export const reactorNativeTinySuite: EvalSuite = {
	kind: EVAL_SUITE_KIND,
	id: "reactor-native-tiny",
	title: "Reactor Native Tiny Canary",
	metadata: {
		description:
			"Fast canary tasks for debugging eval plumbing before spending tokens on real Reactor-native timelines.",
		reportUse: "debug",
	},
	tasks: [
		{
			kind: EVAL_TASK_KIND,
			id: "quiet-drift-canary",
			title: "Quiet Drift Canary",
			contract: {
				source: {
					path: "tests/evals/fixtures/quiet-drift-canary.prose.md",
					sha256: "939de0bacfc591264a67abf985f13ffa08d822ed96c3e47d0f279766553c7fe8",
				},
			},
			prompt:
				"Canary task: inspect the synthetic receipt state and print exactly `drift detected` if the status changed silently.",
			expected: {
				exitCode: 0,
				stdoutContains: ["drift detected"],
				stderrExcludes: ["API_KEY", "secret"],
			},
			metadata: {
				evalFamily: "quiet-drift",
				reportUse: "debug",
			},
			surpriseLabels: ["silent-drift"],
			tags: ["reactor-native", "canary", "cost"],
			timeoutMs: 120_000,
		},
		{
			kind: EVAL_TASK_KIND,
			id: "memoized-verdict-canary",
			title: "Memoized Verdict Canary",
			contract: {
				source: {
					path: "tests/evals/fixtures/memoized-verdict-canary.prose.md",
					sha256: "3ca0c937086591687301c7cee3b4dfdca7fe8ddbf56d7882c66e1318b9d0ed0e",
				},
			},
			prompt:
				"Canary task: inspect unchanged evidence and print exactly `reused verdict` if the prior verdict can be reused.",
			expected: {
				exitCode: 0,
				stdoutContains: ["reused verdict"],
				stderrExcludes: ["API_KEY", "secret"],
			},
			metadata: {
				evalFamily: "memoized-verdict",
				reportUse: "debug",
			},
			surpriseLabels: ["noop"],
			tags: ["reactor-native", "canary", "memoization"],
			timeoutMs: 120_000,
		},
	],
};
