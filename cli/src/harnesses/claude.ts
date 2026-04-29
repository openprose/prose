import { createProcessHarness, type ProcessHarnessOptions } from "./process-harness.js";

export function createClaudeHarness(options: ProcessHarnessOptions = {}) {
  return createProcessHarness(
    "claude",
    (prompt) => ({
      command: "claude",
      args: ["-p", prompt],
    }),
    options,
  );
}
