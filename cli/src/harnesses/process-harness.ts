import { nodeProcessRunner } from "./process-runner.js";
import type { Harness, HarnessName, ProcessCommand, ProcessRunner } from "./types.js";

export interface ProcessHarnessOptions {
  runner?: ProcessRunner;
}

export function createProcessHarness(
  name: HarnessName,
  commandForPrompt: (prompt: string) => ProcessCommand,
  options: ProcessHarnessOptions = {},
): Harness {
  const runner = options.runner ?? nodeProcessRunner;

  return {
    name,
    async run(prompt, runOptions) {
      const command = commandForPrompt(prompt);
      const result = await runner(command.command, command.args, runOptions);

      return {
        harness: name,
        prompt,
        text: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        command,
      };
    },
  };
}
