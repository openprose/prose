import { createProcessHarness, type ProcessHarnessOptions } from "./process-harness.js";

export function createClaudeHarness(options: ProcessHarnessOptions = {}) {
  return createProcessHarness(
    "claude",
    (prompt, runOptions) => ({
      command: "claude",
      args: [
        ...additionalDirectoryArgs(runOptions.additionalDirectories),
        ...(runOptions.systemPromptAppend === undefined
          ? []
          : ["--append-system-prompt", runOptions.systemPromptAppend]),
        "-p",
        prompt,
      ],
    }),
    options,
  );
}

function additionalDirectoryArgs(directories: readonly string[] | undefined): string[] {
  return (directories ?? []).flatMap((directory) => ["--add-dir", directory]);
}
