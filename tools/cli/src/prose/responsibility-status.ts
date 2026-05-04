import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { posix, resolve } from "node:path";
import type { OpenProseRoot } from "./openprose-root.js";
import type { RepositoryIrResponsibility } from "./repository-ir.js";

export const RESPONSIBILITY_STATUS_KIND = "openprose.responsibility-status";
export const RESPONSIBILITY_STATUS_VERSION = 0;
export const RESPONSIBILITY_STATE_DIR = "state/responsibilities";

export type ResponsibilityStatusValue = "up" | "drifting" | "down" | "blocked";

export interface ResponsibilityStatusPaths {
	responsibilityId: string;
	directoryPath: string;
	latestPath: string;
	statusLogPath: string;
	absoluteDirectoryPath: string;
	absoluteLatestPath: string;
	absoluteStatusLogPath: string;
}

export interface ResponsibilityStatusRecord {
	kind: typeof RESPONSIBILITY_STATUS_KIND;
	version: typeof RESPONSIBILITY_STATUS_VERSION;
	responsibilityId: string;
	responsibilityFingerprint: string;
	status: ResponsibilityStatusValue;
	evidence: string[];
	recordedAt: string;
	source: {
		activationId?: string;
		triggerId?: string;
		runId?: string;
		manifestPath?: string;
		irVersion?: number;
	};
}

export interface ResponsibilityStatusValidationResult {
	valid: boolean;
	errors: string[];
}

export class ResponsibilityStatusError extends Error {
	readonly details: string[];

	constructor(message: string, details: readonly string[] = []) {
		super(message);
		this.name = "ResponsibilityStatusError";
		this.details = [...details];
	}
}

const statusValues: readonly ResponsibilityStatusValue[] = ["up", "drifting", "down", "blocked"];

export function fingerprintResponsibility(responsibility: RepositoryIrResponsibility): string {
	const snapshot = {
		id: responsibility.id,
		sourcePath: responsibility.sourcePath,
		goal: responsibility.goal,
		continuity: responsibility.continuity,
		criteria: responsibility.criteria,
		constraints: responsibility.constraints,
		...(responsibility.fulfillment === undefined ? {} : { fulfillment: responsibility.fulfillment }),
	};

	return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function buildResponsibilityStatusPaths(
	openProseRoot: OpenProseRoot,
	responsibilityId: string,
): ResponsibilityStatusPaths {
	if (!isNonEmptyString(responsibilityId)) {
		throw new ResponsibilityStatusError("responsibilityId must be a non-empty string");
	}

	const directoryPath = posix.join(RESPONSIBILITY_STATE_DIR, encodeURIComponent(responsibilityId));
	const latestPath = posix.join(directoryPath, "latest.json");
	const statusLogPath = posix.join(directoryPath, "status.jsonl");

	return {
		responsibilityId,
		directoryPath,
		latestPath,
		statusLogPath,
		absoluteDirectoryPath: resolve(openProseRoot.absolutePath, directoryPath),
		absoluteLatestPath: resolve(openProseRoot.absolutePath, latestPath),
		absoluteStatusLogPath: resolve(openProseRoot.absolutePath, statusLogPath),
	};
}

export function validateResponsibilityStatusRecord(value: unknown): ResponsibilityStatusValidationResult {
	const errors: string[] = [];
	if (!isRecord(value)) {
		return { valid: false, errors: ["status record must be a JSON object"] };
	}

	if (value.kind !== RESPONSIBILITY_STATUS_KIND) {
		errors.push(`kind must be ${RESPONSIBILITY_STATUS_KIND}`);
	}
	if (value.version !== RESPONSIBILITY_STATUS_VERSION) {
		errors.push(`version must be ${RESPONSIBILITY_STATUS_VERSION}`);
	}
	if (!isNonEmptyString(value.responsibilityId)) {
		errors.push("responsibilityId must be a non-empty string");
	}
	if (!isNonEmptyString(value.responsibilityFingerprint)) {
		errors.push("responsibilityFingerprint must be a non-empty string");
	}
	if (!statusValues.includes(value.status as ResponsibilityStatusValue)) {
		errors.push("status must be up, drifting, down, or blocked");
	}
	validateStringArray(value.evidence, "evidence", errors);
	if (!isNonEmptyString(value.recordedAt)) {
		errors.push("recordedAt must be a non-empty string");
	}
	validateStatusSource(value.source, errors);

	return { valid: errors.length === 0, errors };
}

export async function recordResponsibilityStatus(options: {
	openProseRoot: OpenProseRoot;
	record: ResponsibilityStatusRecord;
}): Promise<ResponsibilityStatusPaths> {
	const validation = validateResponsibilityStatusRecord(options.record);
	if (!validation.valid) {
		throw new ResponsibilityStatusError("Invalid responsibility status record.", validation.errors);
	}

	const paths = buildResponsibilityStatusPaths(options.openProseRoot, options.record.responsibilityId);
	await mkdir(paths.absoluteDirectoryPath, { recursive: true });
	await writeFile(paths.absoluteLatestPath, `${JSON.stringify(options.record, null, 2)}\n`, "utf8");
	await appendFile(paths.absoluteStatusLogPath, `${JSON.stringify(options.record)}\n`, "utf8");
	return paths;
}

function validateStringArray(value: unknown, label: string, errors: string[]): void {
	if (!Array.isArray(value)) {
		errors.push(`${label} must be an array`);
		return;
	}
	if (value.length === 0) {
		errors.push(`${label} must contain at least one item`);
	}
	for (const [index, item] of value.entries()) {
		if (!isNonEmptyString(item)) {
			errors.push(`${label}[${index}] must be a non-empty string`);
		}
	}
}

function validateStatusSource(value: unknown, errors: string[]): void {
	if (!isRecord(value)) {
		errors.push("source must be an object");
		return;
	}

	for (const key of ["activationId", "triggerId", "runId", "manifestPath"] as const) {
		if (value[key] !== undefined && !isNonEmptyString(value[key])) {
			errors.push(`source.${key} must be a non-empty string when present`);
		}
	}
	if (value.irVersion !== undefined && !Number.isInteger(value.irVersion)) {
		errors.push("source.irVersion must be an integer when present");
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}
