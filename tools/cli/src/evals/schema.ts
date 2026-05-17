import { EVAL_SUITE_KIND, EVAL_TASK_KIND, SURPRISE_LABELS, type EvalSuite, type SurpriseLabel } from "./types.js";

export class EvalSchemaError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EvalSchemaError";
	}
}

export function validateEvalSuite(value: unknown): EvalSuite {
	const suite = objectAt(value, "suite");
	if (suite.kind !== EVAL_SUITE_KIND) {
		throw new EvalSchemaError(`suite.kind must be ${EVAL_SUITE_KIND}`);
	}

	requireNonEmptyString(suite.id, "suite.id");
	requireNonEmptyString(suite.title, "suite.title");

	if (!Array.isArray(suite.tasks) || suite.tasks.length === 0) {
		throw new EvalSchemaError("suite.tasks must contain at least one task");
	}

	const ids = new Set<string>();
	for (let index = 0; index < suite.tasks.length; index += 1) {
		const task = objectAt(suite.tasks[index], `suite.tasks[${index}]`);
		if (task.kind !== EVAL_TASK_KIND) {
			throw new EvalSchemaError(`suite.tasks[${index}].kind must be ${EVAL_TASK_KIND}`);
		}

		const id = requireNonEmptyString(task.id, `suite.tasks[${index}].id`);
		if (ids.has(id)) {
			throw new EvalSchemaError(`suite.tasks contains duplicate id: ${id}`);
		}
		ids.add(id);

		requireNonEmptyString(task.title, `suite.tasks[${index}].title`);
		requireNonEmptyString(task.prompt, `suite.tasks[${index}].prompt`);
		objectAt(task.expected, `suite.tasks[${index}].expected`);

		if (task.timeoutMs !== undefined) {
			requirePositiveNumber(task.timeoutMs, `suite.tasks[${index}].timeoutMs`);
		}

		if (task.surpriseLabels !== undefined) {
			requireSurpriseLabels(task.surpriseLabels, `suite.tasks[${index}].surpriseLabels`);
		}
	}

	return suite as unknown as EvalSuite;
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new EvalSchemaError(`${path} must be an object`);
	}

	return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new EvalSchemaError(`${path} must be a non-empty string`);
	}

	return value;
}

function requirePositiveNumber(value: unknown, path: string): void {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new EvalSchemaError(`${path} must be a positive finite number`);
	}
}

function requireSurpriseLabels(value: unknown, path: string): void {
	if (!Array.isArray(value)) {
		throw new EvalSchemaError(`${path} must be an array`);
	}

	for (const [index, label] of value.entries()) {
		if (!SURPRISE_LABELS.includes(label as SurpriseLabel)) {
			throw new EvalSchemaError(`${path}[${index}] must be one of: ${SURPRISE_LABELS.join(", ")}`);
		}
	}
}
