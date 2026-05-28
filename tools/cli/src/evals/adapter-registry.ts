import { createDspyRlmEvalAdapter, type DspyRlmEvalAdapterOptions } from "./adapters/dspy-rlm.js";
import { createHermesEvalAdapter, type HermesEvalAdapterOptions } from "./adapters/hermes.js";
import { createMockEvalAdapter, type MockEvalAdapterOptions, type MockEvalAdapterResponse } from "./adapters/mock.js";
import { createPiEvalAdapter, type PiEvalAdapterOptions } from "./adapters/pi.js";
import type { EvalAdapter, EvalTask } from "./types.js";

export type EvalAdapterName = "mock" | "pi" | "hermes" | "dspy-rlm";

export const EVAL_ADAPTER_NAMES: readonly EvalAdapterName[] = ["mock", "pi", "hermes", "dspy-rlm"];

export interface EvalAdapterRegistryOptions {
	dspyRlm?: DspyRlmEvalAdapterOptions;
	hermes?: HermesEvalAdapterOptions;
	mock?: MockEvalAdapterOptions;
	pi?: PiEvalAdapterOptions;
}

export function isEvalAdapterName(value: string): value is EvalAdapterName {
	return EVAL_ADAPTER_NAMES.includes(value as EvalAdapterName);
}

export function resolveEvalAdapterName(value: string): EvalAdapterName {
	if (isEvalAdapterName(value)) {
		return value;
	}

	throw new Error(`Unsupported eval adapter: ${value}. Expected one of: ${EVAL_ADAPTER_NAMES.join(", ")}`);
}

export function createNamedEvalAdapter(name: string, options: EvalAdapterRegistryOptions = {}): EvalAdapter {
	const adapterName = resolveEvalAdapterName(name);

	switch (adapterName) {
		case "mock":
			return createMockEvalAdapter({
				handler: defaultMockResponse,
				...(options.mock ?? {}),
			});
		case "pi":
			return createPiEvalAdapter(options.pi);
		case "hermes":
			return createHermesEvalAdapter(options.hermes);
		case "dspy-rlm":
			return createDspyRlmEvalAdapter(options.dspyRlm);
		default:
			assertNever(adapterName);
	}
}

function defaultMockResponse(task: EvalTask): MockEvalAdapterResponse {
	return { stdout: task.expected.stdoutContains?.[0] ?? task.prompt };
}

function assertNever(value: never): never {
	throw new Error(`Unsupported eval adapter: ${String(value)}`);
}
