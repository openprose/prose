import { codexCliRuntimeArgs } from "./codex-options.js";
import { createProcessHarness, type ProcessHarnessOptions } from "./process-harness.js";
import type { HarnessRunOptions } from "./types.js";

export function createCodexCliHarness(options: ProcessHarnessOptions = {}) {
	const harness = createProcessHarness(
		"codex",
		(prompt, runOptions) => ({
			command: "codex",
			args: ["exec", ...codexCliRuntimeArgs(runOptions.env), prompt],
		}),
		options,
	);

	return {
		name: harness.name,
		run(prompt: string, runOptions: HarnessRunOptions) {
			return harness.run(prompt, {
				...runOptions,
				env: codexCliEnv(runOptions.env),
			});
		},
	};
}

function codexCliEnv(env: Record<string, string | undefined> | undefined): Record<string, string | undefined> {
	const source = env ?? process.env;
	const apiKey = source.CODEX_API_KEY ?? source.OPENAI_API_KEY;
	if (apiKey === undefined || source.CODEX_API_KEY !== undefined) {
		return source;
	}

	return { ...source, CODEX_API_KEY: apiKey };
}
