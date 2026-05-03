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

export interface RepositoryIrV0 {
	kind: typeof REPOSITORY_IR_KIND;
	version: typeof REPOSITORY_IR_VERSION;
	sources: RepositoryIrSource[];
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

	validateSources(value.sources, errors);
	validateDiagnostics(value.diagnostics, errors);

	return { valid: errors.length === 0, errors };
}

function validateSources(value: unknown, errors: string[]): void {
	if (!Array.isArray(value)) {
		errors.push("sources must be an array");
		return;
	}

	for (const [index, source] of value.entries()) {
		if (!isRecord(source)) {
			errors.push(`sources[${index}] must be an object`);
			continue;
		}
		if (!isNonEmptyString(source.path)) {
			errors.push(`sources[${index}].path must be a non-empty string`);
		}
		if (!sourceKinds.includes(source.kind as RepositoryIrSourceKind)) {
			errors.push(`sources[${index}].kind must be a known source kind`);
		}
		if (source.name !== undefined && !isNonEmptyString(source.name)) {
			errors.push(`sources[${index}].name must be a non-empty string when present`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}
