import type { EvalAdapter, EvalAttemptResult, EvalCostRecord, EvalEvent, EvalTask, JsonObject } from "../types.js";

export interface MockEvalAdapterOptions {
	costs?: readonly EvalCostRecord[];
	events?: readonly EvalEvent[];
	exitCode?: number;
	handler?: (task: EvalTask) => MockEvalAdapterResponse | Promise<MockEvalAdapterResponse>;
	metadata?: JsonObject;
	name?: string;
	stderr?: string;
	stdout?: string;
}

export interface MockEvalAdapterResponse {
	costs?: readonly EvalCostRecord[];
	events?: readonly EvalEvent[];
	exitCode?: number;
	metadata?: JsonObject;
	stderr?: string;
	stdout?: string;
}

export function createMockEvalAdapter(options: MockEvalAdapterOptions = {}): EvalAdapter {
	const name = options.name ?? "mock";

	return {
		name,
		async runTask(task) {
			const started = Date.now();
			const response = options.handler ? await options.handler(task) : {};
			return {
				adapterName: name,
				durationMs: Date.now() - started,
				exitCode: response.exitCode ?? options.exitCode ?? 0,
				stdout: response.stdout ?? options.stdout ?? task.prompt,
				stderr: response.stderr ?? options.stderr ?? "",
				...(response.costs !== undefined || options.costs !== undefined
					? { costs: response.costs ?? options.costs ?? [] }
					: {}),
				...(response.events !== undefined || options.events !== undefined
					? { events: response.events ?? options.events ?? [] }
					: {}),
				metadata: {
					...(options.metadata ?? {}),
					...(response.metadata ?? {}),
					adapterKind: "mock",
					debugOnly: true,
					reportUse: "debug-only",
				},
			};
		},
	};
}
