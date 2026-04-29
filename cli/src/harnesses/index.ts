import { createClaudeHarness } from "./claude.js";
import { createCodexCliHarness } from "./codex-cli.js";
import { createCodexSdkHarness, type CodexSdkHarnessOptions } from "./codex-sdk.js";
import { createFakeHarness, type FakeHarnessOptions } from "./fake.js";
import type { Harness, HarnessName, ProcessRunner } from "./types.js";

export type {
  CodexClient,
  CodexSdkClientOptions,
  CodexSdkFactory,
  CodexThread,
  CodexThreadOptions,
  Harness,
  HarnessName,
  HarnessResult,
  HarnessRunOptions,
  ProcessCommand,
  ProcessRunner,
  ProcessRunResult,
} from "./types.js";
export { createClaudeHarness } from "./claude.js";
export { createCodexCliHarness } from "./codex-cli.js";
export { createCodexSdkHarness, createDefaultCodexSdkClient, formatCodexSdkResult } from "./codex-sdk.js";
export { createFakeHarness } from "./fake.js";
export { nodeProcessRunner } from "./process-runner.js";

export interface HarnessSelectionOptions {
  runner?: ProcessRunner;
  codexSdk?: CodexSdkHarnessOptions;
  fake?: FakeHarnessOptions;
}

export const HARNESS_NAMES: readonly HarnessName[] = ["claude", "codex", "codex-sdk", "fake"];

export function isHarnessName(value: string): value is HarnessName {
  return HARNESS_NAMES.includes(value as HarnessName);
}

export function resolveHarnessName(value: string): HarnessName {
  if (isHarnessName(value)) {
    return value;
  }

  throw new Error(`Unsupported harness: ${value}. Expected one of: ${HARNESS_NAMES.join(", ")}`);
}

export function createHarness(name: string, options: HarnessSelectionOptions = {}): Harness {
  const harnessName = resolveHarnessName(name);
  const processOptions = options.runner === undefined ? {} : { runner: options.runner };

  switch (harnessName) {
    case "claude":
      return createClaudeHarness(processOptions);
    case "codex":
      return createCodexCliHarness(processOptions);
    case "codex-sdk":
      return createCodexSdkHarness(options.codexSdk);
    case "fake":
      return createFakeHarness(options.fake);
    default:
      assertNever(harnessName);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported harness: ${String(value)}`);
}
