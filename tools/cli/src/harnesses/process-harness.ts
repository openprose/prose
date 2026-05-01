import { nodeProcessRunner } from "./process-runner.js";
import type { Harness, HarnessName, HarnessRunOptions, ProcessCommand, ProcessRunner } from "./types.js";

export interface ProcessHarnessOptions {
  runner?: ProcessRunner;
}

export function createProcessHarness(
	name: HarnessName,
	commandForPrompt: (prompt: string, options: HarnessRunOptions) => ProcessCommand,
	options: ProcessHarnessOptions = {},
): Harness {
	const runner = options.runner ?? nodeProcessRunner;

	return {
		name,
		async run(prompt, runOptions) {
			const command = commandForPrompt(prompt, runOptions);
			const result = await runner(command.command, command.args, runOptions);

			return result.exitCode;
		},
	};
}
