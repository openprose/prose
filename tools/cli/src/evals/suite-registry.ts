import { loadEvalSuite } from "./suite-loader.js";
import { reactorNativeTinySuite } from "./suites/reactor-native-tiny.js";
import type { EvalSuite } from "./types.js";

export type BuiltInEvalSuiteName = "reactor-native-tiny";

export const BUILT_IN_EVAL_SUITE_NAMES: readonly BuiltInEvalSuiteName[] = ["reactor-native-tiny"];

export function isBuiltInEvalSuiteName(value: string): value is BuiltInEvalSuiteName {
	return BUILT_IN_EVAL_SUITE_NAMES.includes(value as BuiltInEvalSuiteName);
}

export function getBuiltInEvalSuite(name: BuiltInEvalSuiteName): EvalSuite {
	switch (name) {
		case "reactor-native-tiny":
			return reactorNativeTinySuite;
		default:
			assertNever(name);
	}
}

export async function loadEvalSuiteByNameOrPath(value: string): Promise<EvalSuite> {
	if (isBuiltInEvalSuiteName(value)) {
		return getBuiltInEvalSuite(value);
	}

	return loadEvalSuite(value);
}

function assertNever(value: never): never {
	throw new Error(`Unsupported built-in eval suite: ${String(value)}`);
}
