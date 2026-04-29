import { createProcessHarness, type ProcessHarnessOptions } from "./process-harness.js";

export function createCodexCliHarness(options: ProcessHarnessOptions = {}) {
  return createProcessHarness(
    "codex",
    (prompt) => ({
      command: "codex",
      args: ["exec", prompt],
    }),
    options,
  );
}
