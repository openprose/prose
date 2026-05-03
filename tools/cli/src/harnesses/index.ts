import { createClaudeSdkHarness, type ClaudeSdkHarnessOptions } from "./claude-sdk.js";
import { createCodexSdkHarness, type CodexSdkHarnessOptions } from "./codex-sdk.js";
import { createMockHarness, type MockHarnessOptions } from "./mock.js";
import type { Harness, HarnessName } from "./types.js";

export type {
	CodexClient,
	CodexSdkClientOptions,
	CodexSdkFactory,
	CodexThread,
	CodexThreadEvent,
	CodexThreadOptions,
	Harness,
	HarnessName,
	HarnessRunOptions,
	ProcessCommand,
	ProcessRunner,
	ProcessRunResult,
	WritableStreamLike,
} from "./types.js";
export { createClaudeSdkHarness, defaultClaudeSdkQuery } from "./claude-sdk.js";
export { createCodexSdkHarness, createDefaultCodexSdkClient } from "./codex-sdk.js";
export { createMockHarness } from "./mock.js";

export interface HarnessSelectionOptions {
	claudeSdk?: ClaudeSdkHarnessOptions;
	codexSdk?: CodexSdkHarnessOptions;
	mock?: MockHarnessOptions;
}

export const HARNESS_NAMES: readonly HarnessName[] = ["codex-sdk", "claude-sdk", "mock"];

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

	switch (harnessName) {
		case "claude-sdk":
			return createClaudeSdkHarness(options.claudeSdk);
		case "codex-sdk":
			return createCodexSdkHarness(options.codexSdk);
		case "mock":
			return createMockHarness(options.mock);
		default:
			assertNever(harnessName);
	}
}

function assertNever(value: never): never {
	throw new Error(`Unsupported harness: ${String(value)}`);
}
