import { validateRepositoryCronExpression } from "./repository-cron.js";

export const DEFAULT_REPOSITORY_IR_DIR = "dist";
export const NEXT_REPOSITORY_IR_PATH = `${DEFAULT_REPOSITORY_IR_DIR}/manifest.next.json`;
export const ACTIVE_REPOSITORY_IR_PATH = `${DEFAULT_REPOSITORY_IR_DIR}/manifest.active.json`;

export const REPOSITORY_IR_KIND = "openprose.repository-ir";
export const REPOSITORY_IR_VERSION = 0;

export type RepositoryIrSourceKind =
	| "responsibility"
	| "gateway"
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

export type RepositoryIrTriggerKind = "cron" | "http" | "manual";

export interface RepositoryIrTrigger {
	id: string;
	responsibilityId: string;
	kind: RepositoryIrTriggerKind;
	reason: string;
	cron?: string;
	timezone?: string;
	method?: string;
	path?: string;
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
	formeManifestId?: string;
}

export interface RepositoryIrFormeField {
	name: string;
	description?: string;
	source?: string;
}

export type RepositoryIrFormeInputSource = "caller" | "service";

export interface RepositoryIrFormeInputBinding {
	name: string;
	from: RepositoryIrFormeInputSource;
	path: string;
	sourceNodeId?: string;
	sourceOutput?: string;
	description?: string;
}

export interface RepositoryIrFormeOutputBinding {
	name: string;
	workspacePath: string;
	bindingPath?: string;
	public?: boolean;
	description?: string;
}

export interface RepositoryIrFormeDelegate {
	name: string;
	sourcePath: string;
}

export interface RepositoryIrFormeNode {
	id: string;
	sourcePath: string;
	workspacePath: string;
	inputs: RepositoryIrFormeInputBinding[];
	outputs: RepositoryIrFormeOutputBinding[];
	errors?: RepositoryIrFormeField[];
	delegates?: RepositoryIrFormeDelegate[];
}

export interface RepositoryIrFormeExecutionStep {
	nodeId: string;
	dependsOn: string[];
}

export interface RepositoryIrFormeEnvironmentVariable {
	name: string;
	requiredBy: string[];
}

export interface RepositoryIrFormeManifest {
	id: string;
	systemName: string;
	sourcePath: string;
	caller: {
		requires: RepositoryIrFormeField[];
		returns: RepositoryIrFormeField[];
	};
	graph: RepositoryIrFormeNode[];
	executionOrder: RepositoryIrFormeExecutionStep[];
	environment: RepositoryIrFormeEnvironmentVariable[];
	warnings: string[];
}

export interface RepositoryIrV0 {
	kind: typeof REPOSITORY_IR_KIND;
	version: typeof REPOSITORY_IR_VERSION;
	sources: RepositoryIrSource[];
	responsibilities: RepositoryIrResponsibility[];
	triggers: RepositoryIrTrigger[];
	activations: RepositoryIrActivationIntent[];
	formeManifests: RepositoryIrFormeManifest[];
	diagnostics: RepositoryIrDiagnostic[];
}

export interface RepositoryIrValidationResult {
	valid: boolean;
	errors: string[];
}

interface SourceIndex {
	paths: Set<string>;
	kindsByPath: Map<string, RepositoryIrSourceKind>;
}

interface ResponsibilityIndex {
	ids: Set<string>;
	recordsById: Map<string, RepositoryIrResponsibility>;
}

interface TriggerIndex {
	ids: Set<string>;
	recordsById: Map<string, RepositoryIrTrigger>;
	responsibilityIdById: Map<string, string>;
}

interface ActivationIndex {
	activationIdsByTriggerId: Map<string, string[]>;
	judgeActivationIdsByTriggerId: Map<string, string[]>;
}

interface FormeManifestIndex {
	ids: Set<string>;
	sourcePathById: Map<string, string>;
}

interface FormeGraphIndex {
	nodeIds: Set<string>;
	outputsByNodeId: Map<string, Set<string>>;
	dependenciesByNodeId: Map<string, Set<string>>;
}

const sourceKinds: readonly RepositoryIrSourceKind[] = [
	"responsibility",
	"gateway",
	"system",
	"service",
	"test",
	"pattern",
	"unknown",
];

const diagnosticSeverities: readonly RepositoryIrDiagnosticSeverity[] = ["info", "warning", "error"];
const fulfillmentModes: readonly RepositoryIrFulfillmentMode[] = ["declared", "inferred"];
const triggerKinds: readonly RepositoryIrTriggerKind[] = ["cron", "http", "manual"];
const activationIntentKinds: readonly RepositoryIrActivationIntentKind[] = [
	"judge",
	"fulfillment",
	"retry",
	"escalation",
];
const formeInputSources: readonly RepositoryIrFormeInputSource[] = ["caller", "service"];
const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

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

	const sources = validateSources(value.sources, errors);
	const formeManifests = validateFormeManifests(value.formeManifests, sources.paths, errors);
	const responsibilities = validateResponsibilities(value.responsibilities, sources.paths, errors);
	const triggers = validateTriggers(value.triggers, responsibilities.ids, errors);
	const activations = validateActivations(value.activations, responsibilities, triggers, sources, formeManifests, errors);
	validateConcreteTriggersWakeActivations(triggers, activations, errors);
	validateDiagnostics(value.diagnostics, sources.paths, errors);

	return { valid: errors.length === 0, errors };
}

function validateSources(value: unknown, errors: string[]): SourceIndex {
	const paths = new Set<string>();
	const kindsByPath = new Map<string, RepositoryIrSourceKind>();
	if (!Array.isArray(value)) {
		errors.push("sources must be an array");
		return { paths, kindsByPath };
	}

	for (const [index, source] of value.entries()) {
		if (!isRecord(source)) {
			errors.push(`sources[${index}] must be an object`);
			continue;
		}
		const hasKnownKind = sourceKinds.includes(source.kind as RepositoryIrSourceKind);
		if (isNonEmptyString(source.path)) {
			const sourcePath = source.path;
			const isUnique = !paths.has(sourcePath);
			validateSourcePathShape(sourcePath, `sources[${index}].path`, errors);
			addUnique(paths, sourcePath, `sources[${index}].path`, errors);
			if (isUnique && hasKnownKind) {
				kindsByPath.set(sourcePath, source.kind as RepositoryIrSourceKind);
			}
		} else {
			errors.push(`sources[${index}].path must be a non-empty string`);
		}
		if (!hasKnownKind) {
			errors.push(`sources[${index}].kind must be a known source kind`);
		}
		if (source.name !== undefined && !isNonEmptyString(source.name)) {
			errors.push(`sources[${index}].name must be a non-empty string when present`);
		}
	}

	return { paths, kindsByPath };
}

function validateResponsibilities(value: unknown, sourcePaths: Set<string>, errors: string[]): ResponsibilityIndex {
	const ids = new Set<string>();
	const recordsById = new Map<string, RepositoryIrResponsibility>();
	if (!Array.isArray(value)) {
		errors.push("responsibilities must be an array");
		return { ids, recordsById };
	}

	for (const [index, responsibility] of value.entries()) {
		if (!isRecord(responsibility)) {
			errors.push(`responsibilities[${index}] must be an object`);
			continue;
		}

		const prefix = `responsibilities[${index}]`;
		if (isNonEmptyString(responsibility.id)) {
			const isUnique = !ids.has(responsibility.id);
			addUnique(ids, responsibility.id, `${prefix}.id`, errors);
			if (isUnique) {
				recordsById.set(responsibility.id, responsibility as unknown as RepositoryIrResponsibility);
			}
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

	return { ids, recordsById };
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

function validateTriggers(value: unknown, responsibilityIds: Set<string>, errors: string[]): TriggerIndex {
	const ids = new Set<string>();
	const recordsById = new Map<string, RepositoryIrTrigger>();
	const responsibilityIdById = new Map<string, string>();
	if (!Array.isArray(value)) {
		errors.push("triggers must be an array");
		return { ids, recordsById, responsibilityIdById };
	}

	for (const [index, trigger] of value.entries()) {
		if (!isRecord(trigger)) {
			errors.push(`triggers[${index}] must be an object`);
			continue;
		}

		const prefix = `triggers[${index}]`;
		if (isNonEmptyString(trigger.id)) {
			const isUnique = !ids.has(trigger.id);
			addUnique(ids, trigger.id, `${prefix}.id`, errors);
			if (isUnique && isNonEmptyString(trigger.responsibilityId)) {
				responsibilityIdById.set(trigger.id, trigger.responsibilityId);
				recordsById.set(trigger.id, trigger as unknown as RepositoryIrTrigger);
			}
		} else {
			errors.push(`${prefix}.id must be a non-empty string`);
		}
		validateResponsibilityReference(trigger.responsibilityId, responsibilityIds, `${prefix}.responsibilityId`, errors);
		if (!triggerKinds.includes(trigger.kind as RepositoryIrTriggerKind)) {
			errors.push(`${prefix}.kind must be cron, http, or manual`);
		}
		if (!isNonEmptyString(trigger.reason)) {
			errors.push(`${prefix}.reason must be a non-empty string`);
		}
		validateConcreteTrigger(trigger, prefix, errors);
	}

	return { ids, recordsById, responsibilityIdById };
}

function validateConcreteTrigger(trigger: Record<string, unknown>, prefix: string, errors: string[]): void {
	if (trigger.kind === "cron") {
		if (isNonEmptyString(trigger.cron)) {
			validateCronExpression(trigger.cron, `${prefix}.cron`, errors, trigger.timezone);
		} else {
			errors.push(`${prefix}.cron must be a non-empty string for cron triggers`);
		}
		if (trigger.timezone !== undefined && !isNonEmptyString(trigger.timezone)) {
			errors.push(`${prefix}.timezone must be a non-empty string when present`);
		}
		rejectTriggerFields(trigger, prefix, ["method", "path"], errors);
	}

	if (trigger.kind !== "cron") {
		rejectTriggerFields(trigger, prefix, ["cron", "timezone"], errors);
	}

	if (trigger.kind === "http") {
		if (!isNonEmptyString(trigger.method)) {
			errors.push(`${prefix}.method must be a non-empty string for http triggers`);
		} else if (!httpMethods.includes(trigger.method.toUpperCase() as (typeof httpMethods)[number])) {
			errors.push(`${prefix}.method must be GET, POST, PUT, PATCH, or DELETE`);
		}
		if (!isNonEmptyString(trigger.path)) {
			errors.push(`${prefix}.path must be a non-empty string for http triggers`);
		} else if (!trigger.path.startsWith("/")) {
			errors.push(`${prefix}.path must start with /`);
		}
	}

	if (trigger.kind !== "http") {
		rejectTriggerFields(trigger, prefix, ["method", "path"], errors);
	}
}

function validateCronExpression(value: string, label: string, errors: string[], timezone: unknown): void {
	try {
		validateRepositoryCronExpression(value, isNonEmptyString(timezone) ? timezone : undefined);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		errors.push(`${label} must be a standard five-field cron expression: ${message}`);
	}
}

function rejectTriggerFields(
	trigger: Record<string, unknown>,
	prefix: string,
	fields: readonly string[],
	errors: string[],
): void {
	for (const field of fields) {
		if (trigger[field] !== undefined) {
			errors.push(`${prefix}.${field} is not valid for ${String(trigger.kind)} triggers`);
		}
	}
}

function validateActivations(
	value: unknown,
	responsibilities: ResponsibilityIndex,
	triggers: TriggerIndex,
	sources: SourceIndex,
	formeManifests: FormeManifestIndex,
	errors: string[],
): ActivationIndex {
	const ids = new Set<string>();
	const judgeCountsByResponsibilityId = new Map<string, number>();
	const activationIdsByTriggerId = new Map<string, string[]>();
	const judgeActivationIdsByTriggerId = new Map<string, string[]>();
	if (!Array.isArray(value)) {
		errors.push("activations must be an array");
		return { activationIdsByTriggerId, judgeActivationIdsByTriggerId };
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
		validateResponsibilityReference(activation.responsibilityId, responsibilities.ids, `${prefix}.responsibilityId`, errors);
		if (!activationIntentKinds.includes(activation.kind as RepositoryIrActivationIntentKind)) {
			errors.push(`${prefix}.kind must be judge, fulfillment, retry, or escalation`);
		}
		if (!isNonEmptyString(activation.reason)) {
			errors.push(`${prefix}.reason must be a non-empty string`);
		}
		if (activation.triggerIds !== undefined) {
			validateTriggerReferences(activation.triggerIds, triggers, activation.responsibilityId, `${prefix}.triggerIds`, errors);
			if (Array.isArray(activation.triggerIds) && isNonEmptyString(activation.id)) {
				for (const triggerId of activation.triggerIds) {
					if (isNonEmptyString(triggerId)) {
						activationIdsByTriggerId.set(triggerId, [
							...(activationIdsByTriggerId.get(triggerId) ?? []),
							activation.id,
						]);
						if (activation.kind === "judge") {
							judgeActivationIdsByTriggerId.set(triggerId, [
								...(judgeActivationIdsByTriggerId.get(triggerId) ?? []),
								activation.id,
							]);
						}
					}
				}
			}
		}
		if (activation.kind === "judge" && isNonEmptyString(activation.responsibilityId)) {
			judgeCountsByResponsibilityId.set(
				activation.responsibilityId,
				(judgeCountsByResponsibilityId.get(activation.responsibilityId) ?? 0) + 1,
			);
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
				validateKnownSourcePath(activation.sourcePath, sources.paths, `${prefix}.sourcePath`, errors);
			} else {
				errors.push(`${prefix}.sourcePath must be a non-empty string when present`);
			}
		}
		if (activation.formeManifestId !== undefined) {
			if (isNonEmptyString(activation.formeManifestId)) {
				validateKnownFormeManifestId(activation.formeManifestId, formeManifests.ids, `${prefix}.formeManifestId`, errors);
			} else {
				errors.push(`${prefix}.formeManifestId must be a non-empty string when present`);
			}
		}
		validateActivationFulfillment(activation, prefix, responsibilities, sources, formeManifests, errors);
	}

	for (const responsibilityId of responsibilities.ids) {
		const count = judgeCountsByResponsibilityId.get(responsibilityId) ?? 0;
		if (count !== 1) {
			errors.push(`responsibility '${responsibilityId}' must have exactly one judge activation`);
		}
	}

	return { activationIdsByTriggerId, judgeActivationIdsByTriggerId };
}

function validateConcreteTriggersWakeActivations(
	triggers: TriggerIndex,
	activations: ActivationIndex,
	errors: string[],
): void {
	for (const [triggerId, trigger] of triggers.recordsById) {
		if (trigger.kind !== "cron" && trigger.kind !== "http") {
			continue;
		}
		if ((activations.activationIdsByTriggerId.get(triggerId) ?? []).length === 0) {
			errors.push(`trigger '${triggerId}' must wake at least one activation`);
		}
		if ((activations.judgeActivationIdsByTriggerId.get(triggerId) ?? []).length === 0) {
			errors.push(`trigger '${triggerId}' must wake a judge activation`);
		}
	}
}

function validateActivationFulfillment(
	activation: Record<string, unknown>,
	prefix: string,
	responsibilities: ResponsibilityIndex,
	sources: SourceIndex,
	formeManifests: FormeManifestIndex,
	errors: string[],
): void {
	if (activation.kind !== "fulfillment") {
		if (activation.formeManifestId !== undefined) {
			errors.push(`${prefix}.formeManifestId is only valid for fulfillment activations`);
		}
		return;
	}

	const responsibility = isNonEmptyString(activation.responsibilityId)
		? responsibilities.recordsById.get(activation.responsibilityId)
		: undefined;
	const fulfillment = responsibility?.fulfillment;
	if (fulfillment === undefined) {
		errors.push(`${prefix} must not be a fulfillment activation unless its responsibility declares or infers fulfillment`);
	} else {
		if (
			isNonEmptyString(activation.targetName) &&
			isNonEmptyString(fulfillment.targetName) &&
			activation.targetName !== fulfillment.targetName
		) {
			errors.push(`${prefix}.targetName must match responsibility fulfillment targetName`);
		}
		if (isNonEmptyString(fulfillment.sourcePath)) {
			if (activation.sourcePath === undefined) {
				errors.push(`${prefix}.sourcePath must match responsibility fulfillment sourcePath`);
			} else if (activation.sourcePath !== fulfillment.sourcePath) {
				errors.push(`${prefix}.sourcePath must match responsibility fulfillment sourcePath`);
			}
		}
	}

	if (!isNonEmptyString(activation.sourcePath)) {
		errors.push(`${prefix}.sourcePath must be a non-empty string for fulfillment activations`);
		return;
	}

	const sourceKind = sources.kindsByPath.get(activation.sourcePath);
	if (sourceKind !== "system" && sourceKind !== "service") {
		errors.push(`${prefix}.sourcePath must reference a system or service source for fulfillment activations`);
		return;
	}

	if (sourceKind === "system" && activation.formeManifestId === undefined) {
		errors.push(`${prefix}.formeManifestId is required for fulfillment activations targeting system sources`);
	}
	if (sourceKind === "service" && activation.formeManifestId !== undefined) {
		errors.push(`${prefix}.formeManifestId must be omitted for fulfillment activations targeting service sources`);
	}
	if (isNonEmptyString(activation.formeManifestId)) {
		const manifestSourcePath = formeManifests.sourcePathById.get(activation.formeManifestId);
		if (manifestSourcePath !== undefined && manifestSourcePath !== activation.sourcePath) {
			errors.push(`${prefix}.formeManifestId must reference a Forme manifest for activation.sourcePath`);
		}
	}
}

function validateFormeManifests(value: unknown, sourcePaths: Set<string>, errors: string[]): FormeManifestIndex {
	const ids = new Set<string>();
	const sourcePathById = new Map<string, string>();
	if (!Array.isArray(value)) {
		errors.push("formeManifests must be an array");
		return { ids, sourcePathById };
	}

	for (const [index, manifest] of value.entries()) {
		if (!isRecord(manifest)) {
			errors.push(`formeManifests[${index}] must be an object`);
			continue;
		}

		const prefix = `formeManifests[${index}]`;
		if (isNonEmptyString(manifest.id)) {
			const isUnique = !ids.has(manifest.id);
			addUnique(ids, manifest.id, `${prefix}.id`, errors);
			if (isUnique && isNonEmptyString(manifest.sourcePath)) {
				sourcePathById.set(manifest.id, manifest.sourcePath);
			}
		} else {
			errors.push(`${prefix}.id must be a non-empty string`);
		}
		if (!isNonEmptyString(manifest.systemName)) {
			errors.push(`${prefix}.systemName must be a non-empty string`);
		}
		if (isNonEmptyString(manifest.sourcePath)) {
			validateKnownSourcePath(manifest.sourcePath, sourcePaths, `${prefix}.sourcePath`, errors);
		} else {
			errors.push(`${prefix}.sourcePath must be a non-empty string`);
		}
		const graph = validateFormeGraph(manifest.graph, `${prefix}.graph`, sourcePaths, errors);
		validateFormeCaller(manifest.caller, `${prefix}.caller`, graph, errors);
		validateFormeExecutionOrder(manifest.executionOrder, `${prefix}.executionOrder`, graph, errors);
		validateFormeEnvironment(manifest.environment, `${prefix}.environment`, graph.nodeIds, errors);
		validateStringArrayAllowEmpty(manifest.warnings, `${prefix}.warnings`, errors);
	}

	return { ids, sourcePathById };
}

function validateFormeCaller(value: unknown, prefix: string, graph: FormeGraphIndex, errors: string[]): void {
	if (!isRecord(value)) {
		errors.push(`${prefix} must be an object`);
		return;
	}
	validateFormeFields(value.requires, `${prefix}.requires`, errors);
	validateFormeFields(value.returns, `${prefix}.returns`, errors);
	validateFormeReturnReferences(value.returns, `${prefix}.returns`, graph, errors);
}

function validateFormeGraph(
	value: unknown,
	prefix: string,
	sourcePaths: Set<string>,
	errors: string[],
): FormeGraphIndex {
	const nodeIds = new Set<string>();
	const outputsByNodeId = new Map<string, Set<string>>();
	const dependenciesByNodeId = new Map<string, Set<string>>();
	if (!Array.isArray(value)) {
		errors.push(`${prefix} must be an array`);
		return { nodeIds, outputsByNodeId, dependenciesByNodeId };
	}
	if (value.length === 0) {
		errors.push(`${prefix} must contain at least one node`);
	}

	for (const [index, node] of value.entries()) {
		if (!isRecord(node)) {
			errors.push(`${prefix}[${index}] must be an object`);
			continue;
		}

		const nodePrefix = `${prefix}[${index}]`;
		const nodeId = isNonEmptyString(node.id) ? node.id : undefined;
		if (isNonEmptyString(node.id)) {
			addUnique(nodeIds, node.id, `${nodePrefix}.id`, errors);
		} else {
			errors.push(`${nodePrefix}.id must be a non-empty string`);
		}
		if (isNonEmptyString(node.sourcePath)) {
			validateKnownSourcePath(node.sourcePath, sourcePaths, `${nodePrefix}.sourcePath`, errors);
		} else {
			errors.push(`${nodePrefix}.sourcePath must be a non-empty string`);
		}
		if (!isNonEmptyString(node.workspacePath)) {
			errors.push(`${nodePrefix}.workspacePath must be a non-empty string`);
		}
		validateFormeInputs(node.inputs, `${nodePrefix}.inputs`, errors);
		const outputs = validateFormeOutputs(node.outputs, `${nodePrefix}.outputs`, errors);
		if (nodeId !== undefined) {
			outputsByNodeId.set(nodeId, outputs);
			dependenciesByNodeId.set(nodeId, new Set());
		}
		if (node.errors !== undefined) {
			validateFormeFields(node.errors, `${nodePrefix}.errors`, errors);
		}
		if (node.delegates !== undefined) {
			validateFormeDelegates(node.delegates, `${nodePrefix}.delegates`, sourcePaths, errors);
		}
	}

	const graph = { nodeIds, outputsByNodeId, dependenciesByNodeId };
	validateFormeInputReferences(value, prefix, graph, errors);
	return graph;
}

function validateFormeInputs(value: unknown, prefix: string, errors: string[]): void {
	if (!Array.isArray(value)) {
		errors.push(`${prefix} must be an array`);
		return;
	}
	for (const [index, input] of value.entries()) {
		if (!isRecord(input)) {
			errors.push(`${prefix}[${index}] must be an object`);
			continue;
		}
		const inputPrefix = `${prefix}[${index}]`;
		if (!isNonEmptyString(input.name)) {
			errors.push(`${inputPrefix}.name must be a non-empty string`);
		}
		if (!formeInputSources.includes(input.from as RepositoryIrFormeInputSource)) {
			errors.push(`${inputPrefix}.from must be caller or service`);
		}
		if (!isNonEmptyString(input.path)) {
			errors.push(`${inputPrefix}.path must be a non-empty string`);
		}
		const hasSourceNodeId = isNonEmptyString(input.sourceNodeId);
		const hasSourceOutput = isNonEmptyString(input.sourceOutput);
		if (input.from === "service") {
			if (!hasSourceNodeId) {
				errors.push(`${inputPrefix}.sourceNodeId must be a non-empty string for service inputs`);
			}
			if (!hasSourceOutput) {
				errors.push(`${inputPrefix}.sourceOutput must be a non-empty string for service inputs`);
			}
		}
		if (input.from !== "service" && input.sourceNodeId !== undefined && !hasSourceNodeId) {
			errors.push(`${inputPrefix}.sourceNodeId must be a non-empty string when present`);
		}
		if (input.from !== "service" && input.sourceOutput !== undefined && !hasSourceOutput) {
			errors.push(`${inputPrefix}.sourceOutput must be a non-empty string when present`);
		}
		if (input.description !== undefined && !isNonEmptyString(input.description)) {
			errors.push(`${inputPrefix}.description must be a non-empty string when present`);
		}
	}
}

function validateFormeOutputs(value: unknown, prefix: string, errors: string[]): Set<string> {
	const outputNames = new Set<string>();
	if (!Array.isArray(value)) {
		errors.push(`${prefix} must be an array`);
		return outputNames;
	}
	if (value.length === 0) {
		errors.push(`${prefix} must contain at least one output`);
	}
	for (const [index, output] of value.entries()) {
		if (!isRecord(output)) {
			errors.push(`${prefix}[${index}] must be an object`);
			continue;
		}
		const outputPrefix = `${prefix}[${index}]`;
		if (!isNonEmptyString(output.name)) {
			errors.push(`${outputPrefix}.name must be a non-empty string`);
		} else {
			addUnique(outputNames, output.name, `${outputPrefix}.name`, errors);
		}
		if (!isNonEmptyString(output.workspacePath)) {
			errors.push(`${outputPrefix}.workspacePath must be a non-empty string`);
		}
		if (output.bindingPath !== undefined && !isNonEmptyString(output.bindingPath)) {
			errors.push(`${outputPrefix}.bindingPath must be a non-empty string when present`);
		}
		if (output.public !== undefined && typeof output.public !== "boolean") {
			errors.push(`${outputPrefix}.public must be a boolean when present`);
		}
		if (output.description !== undefined && !isNonEmptyString(output.description)) {
			errors.push(`${outputPrefix}.description must be a non-empty string when present`);
		}
	}
	return outputNames;
}

function validateFormeInputReferences(
	nodes: unknown[],
	prefix: string,
	graph: FormeGraphIndex,
	errors: string[],
): void {
	for (const [nodeIndex, node] of nodes.entries()) {
		if (!isRecord(node) || !Array.isArray(node.inputs) || !isNonEmptyString(node.id)) {
			continue;
		}
		for (const [inputIndex, input] of node.inputs.entries()) {
			if (!isRecord(input)) {
				continue;
			}
			if (input.from === "caller") {
				graph.dependenciesByNodeId.get(node.id)?.add("caller");
				continue;
			}
			if (input.from !== "service" || !isNonEmptyString(input.sourceNodeId)) {
				continue;
			}
			if (!graph.nodeIds.has(input.sourceNodeId)) {
				errors.push(`${prefix}[${nodeIndex}].inputs[${inputIndex}].sourceNodeId must reference a known graph node`);
				continue;
			}
			graph.dependenciesByNodeId.get(node.id)?.add(input.sourceNodeId);
			if (isNonEmptyString(input.sourceOutput)) {
				const sourceOutputs = graph.outputsByNodeId.get(input.sourceNodeId);
				if (sourceOutputs !== undefined && !sourceOutputs.has(input.sourceOutput)) {
					errors.push(`${prefix}[${nodeIndex}].inputs[${inputIndex}].sourceOutput must reference an output on sourceNodeId`);
				}
			}
		}
	}
}

function validateFormeReturnReferences(
	value: unknown,
	prefix: string,
	graph: FormeGraphIndex,
	errors: string[],
): void {
	if (!Array.isArray(value)) {
		return;
	}
	for (const [index, field] of value.entries()) {
		if (!isRecord(field) || field.source === undefined) {
			continue;
		}
		const fieldPrefix = `${prefix}[${index}]`;
		if (!isNonEmptyString(field.source)) {
			continue;
		}
		if (!graph.nodeIds.has(field.source)) {
			errors.push(`${fieldPrefix}.source must reference a known graph node`);
			continue;
		}
		const outputs = graph.outputsByNodeId.get(field.source);
		if (isNonEmptyString(field.name) && outputs !== undefined && !outputs.has(field.name)) {
			errors.push(`${fieldPrefix}.name must reference an output on source`);
		}
	}
}

function validateFormeDelegates(
	value: unknown,
	prefix: string,
	sourcePaths: Set<string>,
	errors: string[],
): void {
	if (!Array.isArray(value)) {
		errors.push(`${prefix} must be an array when present`);
		return;
	}
	for (const [index, delegate] of value.entries()) {
		if (!isRecord(delegate)) {
			errors.push(`${prefix}[${index}] must be an object`);
			continue;
		}
		const delegatePrefix = `${prefix}[${index}]`;
		if (!isNonEmptyString(delegate.name)) {
			errors.push(`${delegatePrefix}.name must be a non-empty string`);
		}
		if (isNonEmptyString(delegate.sourcePath)) {
			validateKnownSourcePath(delegate.sourcePath, sourcePaths, `${delegatePrefix}.sourcePath`, errors);
		} else {
			errors.push(`${delegatePrefix}.sourcePath must be a non-empty string`);
		}
	}
}

function validateFormeExecutionOrder(
	value: unknown,
	prefix: string,
	graph: FormeGraphIndex,
	errors: string[],
): void {
	if (!Array.isArray(value)) {
		errors.push(`${prefix} must be an array`);
		return;
	}
	if (value.length === 0) {
		errors.push(`${prefix} must contain at least one step`);
	}
	const seenSteps = new Set<string>();
	for (const [index, step] of value.entries()) {
		if (!isRecord(step)) {
			errors.push(`${prefix}[${index}] must be an object`);
			continue;
		}
		const stepPrefix = `${prefix}[${index}]`;
		validateNodeReference(step.nodeId, graph.nodeIds, `${stepPrefix}.nodeId`, errors);
		if (isNonEmptyString(step.nodeId)) {
			addUnique(seenSteps, step.nodeId, `${stepPrefix}.nodeId`, errors);
		}
		if (!Array.isArray(step.dependsOn)) {
			errors.push(`${stepPrefix}.dependsOn must be an array`);
			continue;
		}
		const declaredDependencies = new Set<string>();
		for (const [dependsOnIndex, dependency] of step.dependsOn.entries()) {
			if (!isNonEmptyString(dependency)) {
				errors.push(`${stepPrefix}.dependsOn[${dependsOnIndex}] must be a non-empty string`);
				continue;
			}
			addUnique(declaredDependencies, dependency, `${stepPrefix}.dependsOn[${dependsOnIndex}]`, errors);
			if (dependency !== "caller" && !graph.nodeIds.has(dependency)) {
				errors.push(`${stepPrefix}.dependsOn[${dependsOnIndex}] must reference caller or a known graph node`);
				continue;
			}
			if (dependency !== "caller" && !seenSteps.has(dependency)) {
				errors.push(`${stepPrefix}.dependsOn[${dependsOnIndex}] must appear earlier in executionOrder`);
			}
		}
		if (isNonEmptyString(step.nodeId)) {
			const expectedDependencies = graph.dependenciesByNodeId.get(step.nodeId) ?? new Set<string>();
			for (const expectedDependency of expectedDependencies) {
				if (!declaredDependencies.has(expectedDependency)) {
					errors.push(`${stepPrefix}.dependsOn must include dependency '${expectedDependency}'`);
				}
			}
		}
	}
	for (const nodeId of graph.nodeIds) {
		if (!seenSteps.has(nodeId)) {
			errors.push(`${prefix} must include exactly one step for graph node '${nodeId}'`);
		}
	}
}

function validateFormeEnvironment(
	value: unknown,
	prefix: string,
	nodeIds: Set<string>,
	errors: string[],
): void {
	if (!Array.isArray(value)) {
		errors.push(`${prefix} must be an array`);
		return;
	}
	for (const [index, variable] of value.entries()) {
		if (!isRecord(variable)) {
			errors.push(`${prefix}[${index}] must be an object`);
			continue;
		}
		const variablePrefix = `${prefix}[${index}]`;
		if (!isNonEmptyString(variable.name)) {
			errors.push(`${variablePrefix}.name must be a non-empty string`);
		}
		if (!Array.isArray(variable.requiredBy)) {
			errors.push(`${variablePrefix}.requiredBy must be an array`);
			continue;
		}
		if (variable.requiredBy.length === 0) {
			errors.push(`${variablePrefix}.requiredBy must contain at least one node id`);
		}
		for (const [requiredByIndex, requiredBy] of variable.requiredBy.entries()) {
			validateNodeReference(requiredBy, nodeIds, `${variablePrefix}.requiredBy[${requiredByIndex}]`, errors);
		}
	}
}

function validateFormeFields(value: unknown, prefix: string, errors: string[]): void {
	if (!Array.isArray(value)) {
		errors.push(`${prefix} must be an array`);
		return;
	}
	for (const [index, field] of value.entries()) {
		if (!isRecord(field)) {
			errors.push(`${prefix}[${index}] must be an object`);
			continue;
		}
		const fieldPrefix = `${prefix}[${index}]`;
		if (!isNonEmptyString(field.name)) {
			errors.push(`${fieldPrefix}.name must be a non-empty string`);
		}
		if (field.description !== undefined && !isNonEmptyString(field.description)) {
			errors.push(`${fieldPrefix}.description must be a non-empty string when present`);
		}
		if (field.source !== undefined && !isNonEmptyString(field.source)) {
			errors.push(`${fieldPrefix}.source must be a non-empty string when present`);
		}
	}
}

function validateDiagnostics(value: unknown, sourcePaths: Set<string>, errors: string[]): void {
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
		} else if (diagnostic.severity === "error") {
			errors.push(`diagnostics[${index}].severity must not be error in a written manifest`);
		}
		if (!isNonEmptyString(diagnostic.message)) {
			errors.push(`diagnostics[${index}].message must be a non-empty string`);
		}
		if (diagnostic.sourcePath !== undefined) {
			if (isNonEmptyString(diagnostic.sourcePath)) {
				validateKnownSourcePath(diagnostic.sourcePath, sourcePaths, `diagnostics[${index}].sourcePath`, errors);
			} else {
				errors.push(`diagnostics[${index}].sourcePath must be a non-empty string when present`);
			}
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

function validateStringArrayAllowEmpty(value: unknown, prefix: string, errors: string[]): void {
	if (!Array.isArray(value)) {
		errors.push(`${prefix} must be an array`);
		return;
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
	if (!responsibilityIds.has(value)) {
		errors.push(`${path} must reference a known responsibility id`);
	}
}

function validateNodeReference(value: unknown, nodeIds: Set<string>, path: string, errors: string[]): void {
	if (!isNonEmptyString(value)) {
		errors.push(`${path} must be a non-empty string`);
		return;
	}
	if (!nodeIds.has(value)) {
		errors.push(`${path} must reference a known graph node`);
	}
}

function validateTriggerReferences(
	value: unknown,
	triggers: TriggerIndex,
	activationResponsibilityId: unknown,
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
		const triggerResponsibilityId = triggers.responsibilityIdById.get(triggerId);
		if (!triggers.ids.has(triggerId) || triggerResponsibilityId === undefined) {
			errors.push(`${prefix}[${index}] must reference a known trigger id`);
			continue;
		}
		if (isNonEmptyString(activationResponsibilityId) && triggerResponsibilityId !== activationResponsibilityId) {
			errors.push(`${prefix}[${index}] must reference a trigger for the same responsibility`);
		}
	}
}

function validateKnownFormeManifestId(
	id: string,
	formeManifestIds: Set<string>,
	label: string,
	errors: string[],
): void {
	if (!formeManifestIds.has(id)) {
		errors.push(`${label} must reference a known Forme manifest id`);
	}
}

function validateKnownSourcePath(path: string, sourcePaths: Set<string>, label: string, errors: string[]): void {
	validateSourcePathShape(path, label, errors);
	if (!sourcePaths.has(path)) {
		errors.push(`${label} must reference a discovered source path`);
	}
}

function validateSourcePathShape(path: string, label: string, errors: string[]): void {
	if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) {
		errors.push(`${label} must be root-relative`);
		return;
	}
	if (path.includes("\\")) {
		errors.push(`${label} must use forward slashes`);
	}
	const parts = path.split("/");
	if (parts.some((part) => part === "" || part === "." || part === "..")) {
		errors.push(`${label} must not contain empty, current, or parent path segments`);
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
