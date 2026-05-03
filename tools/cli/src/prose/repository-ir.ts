export const DEFAULT_REPOSITORY_IR_DIR = "dist/prose";
export const NEXT_REPOSITORY_IR_PATH = `${DEFAULT_REPOSITORY_IR_DIR}/manifest.next.json`;
export const ACTIVE_REPOSITORY_IR_PATH = `${DEFAULT_REPOSITORY_IR_DIR}/manifest.active.json`;

export const REPOSITORY_IR_KIND = "openprose.repository-ir";
export const REPOSITORY_IR_VERSION = 0;

export type RepositoryIrSourceKind =
	| "responsibility"
	| "system"
	| "service"
	| "test"
	| "pattern"
	| "unknown";

export type RepositoryIrDiagnosticSeverity = "info" | "warning" | "error";

export interface RepositoryIrSource {
	path: string;
	kind: RepositoryIrSourceKind;
	name?: string;
}

export interface RepositoryIrDiagnostic {
	severity: RepositoryIrDiagnosticSeverity;
	message: string;
	sourcePath?: string;
}

export type RepositoryIrFulfillmentMode = "declared" | "inferred";

export interface RepositoryIrFulfillmentIntent {
	mode: RepositoryIrFulfillmentMode;
	targetName: string;
	sourcePath?: string;
}

export interface RepositoryIrResponsibility {
	id: string;
	sourcePath: string;
	goal: string;
	continuity: string[];
	criteria: string[];
	constraints: string[];
	fulfillment?: RepositoryIrFulfillmentIntent;
}

export type RepositoryIrTriggerIntentKind = "periodic" | "event" | "manual" | "unknown";

export interface RepositoryIrTriggerIntent {
	id: string;
	responsibilityId: string;
	kind: RepositoryIrTriggerIntentKind;
	reason: string;
}

export type RepositoryIrActivationIntentKind = "judge" | "fulfillment" | "retry" | "escalation";

export interface RepositoryIrActivationIntent {
	id: string;
	responsibilityId: string;
	kind: RepositoryIrActivationIntentKind;
	reason: string;
	triggerIds?: string[];
	targetName?: string;
	sourcePath?: string;
}

export interface RepositoryIrV0 {
	kind: typeof REPOSITORY_IR_KIND;
	version: typeof REPOSITORY_IR_VERSION;
	sources: RepositoryIrSource[];
	responsibilities: RepositoryIrResponsibility[];
	triggers: RepositoryIrTriggerIntent[];
	activations: RepositoryIrActivationIntent[];
	diagnostics: RepositoryIrDiagnostic[];
}

export interface RepositoryIrValidationResult {
	valid: boolean;
	errors: string[];
}

const sourceKinds: readonly RepositoryIrSourceKind[] = [
	"responsibility",
	"system",
	"service",
	"test",
	"pattern",
	"unknown",
];

const diagnosticSeverities: readonly RepositoryIrDiagnosticSeverity[] = ["info", "warning", "error"];
const fulfillmentModes: readonly RepositoryIrFulfillmentMode[] = ["declared", "inferred"];
const triggerIntentKinds: readonly RepositoryIrTriggerIntentKind[] = ["periodic", "event", "manual", "unknown"];
const activationIntentKinds: readonly RepositoryIrActivationIntentKind[] = [
	"judge",
	"fulfillment",
	"retry",
	"escalation",
];

export function validateRepositoryIr(value: unknown): RepositoryIrValidationResult {
	const errors: string[] = [];

	if (!isRecord(value)) {
		return { valid: false, errors: ["manifest must be a JSON object"] };
	}

	if (value.kind !== REPOSITORY_IR_KIND) {
		errors.push(`kind must be ${REPOSITORY_IR_KIND}`);
	}
	if (value.version !== REPOSITORY_IR_VERSION) {
		errors.push(`version must be ${REPOSITORY_IR_VERSION}`);
	}

	const sourcePaths = validateSources(value.sources, errors);
	const responsibilityIds = validateResponsibilities(value.responsibilities, sourcePaths, errors);
	const triggerIds = validateTriggers(value.triggers, responsibilityIds, errors);
	validateActivations(value.activations, responsibilityIds, triggerIds, sourcePaths, errors);
	validateDiagnostics(value.diagnostics, errors);

	return { valid: errors.length === 0, errors };
}

function validateSources(value: unknown, errors: string[]): Set<string> {
	const paths = new Set<string>();
	if (!Array.isArray(value)) {
		errors.push("sources must be an array");
		return paths;
	}

	for (const [index, source] of value.entries()) {
		if (!isRecord(source)) {
			errors.push(`sources[${index}] must be an object`);
			continue;
		}
		if (isNonEmptyString(source.path)) {
			addUnique(paths, source.path, `sources[${index}].path`, errors);
		} else {
			errors.push(`sources[${index}].path must be a non-empty string`);
		}
		if (!sourceKinds.includes(source.kind as RepositoryIrSourceKind)) {
			errors.push(`sources[${index}].kind must be a known source kind`);
		}
		if (source.name !== undefined && !isNonEmptyString(source.name)) {
			errors.push(`sources[${index}].name must be a non-empty string when present`);
		}
	}

	return paths;
}

function validateResponsibilities(value: unknown, sourcePaths: Set<string>, errors: string[]): Set<string> {
	const ids = new Set<string>();
	if (!Array.isArray(value)) {
		errors.push("responsibilities must be an array");
		return ids;
	}

	for (const [index, responsibility] of value.entries()) {
		if (!isRecord(responsibility)) {
			errors.push(`responsibilities[${index}] must be an object`);
			continue;
		}

		const prefix = `responsibilities[${index}]`;
		if (isNonEmptyString(responsibility.id)) {
			addUnique(ids, responsibility.id, `${prefix}.id`, errors);
		} else {
			errors.push(`${prefix}.id must be a non-empty string`);
		}

		if (isNonEmptyString(responsibility.sourcePath)) {
			validateKnownSourcePath(responsibility.sourcePath, sourcePaths, `${prefix}.sourcePath`, errors);
		} else {
			errors.push(`${prefix}.sourcePath must be a non-empty string`);
		}

		if (!isNonEmptyString(responsibility.goal)) {
			errors.push(`${prefix}.goal must be a non-empty string`);
		}
		validateStringArray(responsibility.continuity, `${prefix}.continuity`, errors);
		validateStringArray(responsibility.criteria, `${prefix}.criteria`, errors);
		validateStringArray(responsibility.constraints, `${prefix}.constraints`, errors);

		if (responsibility.fulfillment !== undefined) {
			validateFulfillmentIntent(responsibility.fulfillment, `${prefix}.fulfillment`, sourcePaths, errors);
		}
	}

	return ids;
}

function validateFulfillmentIntent(
	value: unknown,
	prefix: string,
	sourcePaths: Set<string>,
	errors: string[],
): void {
	if (!isRecord(value)) {
		errors.push(`${prefix} must be an object when present`);
		return;
	}

	if (!fulfillmentModes.includes(value.mode as RepositoryIrFulfillmentMode)) {
		errors.push(`${prefix}.mode must be declared or inferred`);
	}
	if (!isNonEmptyString(value.targetName)) {
		errors.push(`${prefix}.targetName must be a non-empty string`);
	}
	if (value.sourcePath !== undefined) {
		if (isNonEmptyString(value.sourcePath)) {
			validateKnownSourcePath(value.sourcePath, sourcePaths, `${prefix}.sourcePath`, errors);
		} else {
			errors.push(`${prefix}.sourcePath must be a non-empty string when present`);
		}
	}
}

function validateTriggers(value: unknown, responsibilityIds: Set<string>, errors: string[]): Set<string> {
	const ids = new Set<string>();
	if (!Array.isArray(value)) {
		errors.push("triggers must be an array");
		return ids;
	}

	for (const [index, trigger] of value.entries()) {
		if (!isRecord(trigger)) {
			errors.push(`triggers[${index}] must be an object`);
			continue;
		}

		const prefix = `triggers[${index}]`;
		if (isNonEmptyString(trigger.id)) {
			addUnique(ids, trigger.id, `${prefix}.id`, errors);
		} else {
			errors.push(`${prefix}.id must be a non-empty string`);
		}
		validateResponsibilityReference(trigger.responsibilityId, responsibilityIds, `${prefix}.responsibilityId`, errors);
		if (!triggerIntentKinds.includes(trigger.kind as RepositoryIrTriggerIntentKind)) {
			errors.push(`${prefix}.kind must be periodic, event, manual, or unknown`);
		}
		if (!isNonEmptyString(trigger.reason)) {
			errors.push(`${prefix}.reason must be a non-empty string`);
		}
	}

	return ids;
}

function validateActivations(
	value: unknown,
	responsibilityIds: Set<string>,
	triggerIds: Set<string>,
	sourcePaths: Set<string>,
	errors: string[],
): void {
	const ids = new Set<string>();
	if (!Array.isArray(value)) {
		errors.push("activations must be an array");
		return;
	}

	for (const [index, activation] of value.entries()) {
		if (!isRecord(activation)) {
			errors.push(`activations[${index}] must be an object`);
			continue;
		}

		const prefix = `activations[${index}]`;
		if (isNonEmptyString(activation.id)) {
			addUnique(ids, activation.id, `${prefix}.id`, errors);
		} else {
			errors.push(`${prefix}.id must be a non-empty string`);
		}
		validateResponsibilityReference(activation.responsibilityId, responsibilityIds, `${prefix}.responsibilityId`, errors);
		if (!activationIntentKinds.includes(activation.kind as RepositoryIrActivationIntentKind)) {
			errors.push(`${prefix}.kind must be judge, fulfillment, retry, or escalation`);
		}
		if (!isNonEmptyString(activation.reason)) {
			errors.push(`${prefix}.reason must be a non-empty string`);
		}
		if (activation.triggerIds !== undefined) {
			validateTriggerReferences(activation.triggerIds, triggerIds, `${prefix}.triggerIds`, errors);
		}
		const hasTargetName = isNonEmptyString(activation.targetName);
		if (activation.kind === "fulfillment" && !hasTargetName) {
			errors.push(`${prefix}.targetName must be a non-empty string for fulfillment activations`);
		}
		if (activation.kind !== "fulfillment" && activation.targetName !== undefined && !hasTargetName) {
			errors.push(`${prefix}.targetName must be a non-empty string when present`);
		}
		if (activation.sourcePath !== undefined) {
			if (isNonEmptyString(activation.sourcePath)) {
				validateKnownSourcePath(activation.sourcePath, sourcePaths, `${prefix}.sourcePath`, errors);
			} else {
				errors.push(`${prefix}.sourcePath must be a non-empty string when present`);
			}
		}
	}
}

function validateDiagnostics(value: unknown, errors: string[]): void {
	if (!Array.isArray(value)) {
		errors.push("diagnostics must be an array");
		return;
	}

	for (const [index, diagnostic] of value.entries()) {
		if (!isRecord(diagnostic)) {
			errors.push(`diagnostics[${index}] must be an object`);
			continue;
		}
		if (!diagnosticSeverities.includes(diagnostic.severity as RepositoryIrDiagnosticSeverity)) {
			errors.push(`diagnostics[${index}].severity must be info, warning, or error`);
		}
		if (!isNonEmptyString(diagnostic.message)) {
			errors.push(`diagnostics[${index}].message must be a non-empty string`);
		}
		if (diagnostic.sourcePath !== undefined && !isNonEmptyString(diagnostic.sourcePath)) {
			errors.push(`diagnostics[${index}].sourcePath must be a non-empty string when present`);
		}
	}
}

function validateStringArray(value: unknown, prefix: string, errors: string[]): void {
	if (!Array.isArray(value)) {
		errors.push(`${prefix} must be an array`);
		return;
	}
	if (value.length === 0) {
		errors.push(`${prefix} must contain at least one item`);
	}
	for (const [index, item] of value.entries()) {
		if (!isNonEmptyString(item)) {
			errors.push(`${prefix}[${index}] must be a non-empty string`);
		}
	}
}

function validateResponsibilityReference(
	value: unknown,
	responsibilityIds: Set<string>,
	path: string,
	errors: string[],
): void {
	if (!isNonEmptyString(value)) {
		errors.push(`${path} must be a non-empty string`);
		return;
	}
	if (responsibilityIds.size > 0 && !responsibilityIds.has(value)) {
		errors.push(`${path} must reference a known responsibility id`);
	}
}

function validateTriggerReferences(
	value: unknown,
	triggerIds: Set<string>,
	prefix: string,
	errors: string[],
): void {
	if (!Array.isArray(value)) {
		errors.push(`${prefix} must be an array when present`);
		return;
	}
	for (const [index, triggerId] of value.entries()) {
		if (!isNonEmptyString(triggerId)) {
			errors.push(`${prefix}[${index}] must be a non-empty string`);
			continue;
		}
		if (triggerIds.size > 0 && !triggerIds.has(triggerId)) {
			errors.push(`${prefix}[${index}] must reference a known trigger id`);
		}
	}
}

function validateKnownSourcePath(path: string, sourcePaths: Set<string>, label: string, errors: string[]): void {
	if (sourcePaths.size > 0 && !sourcePaths.has(path)) {
		errors.push(`${label} must reference a discovered source path`);
	}
}

function addUnique(values: Set<string>, value: string, label: string, errors: string[]): void {
	if (values.has(value)) {
		errors.push(`${label} must be unique`);
		return;
	}
	values.add(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}
