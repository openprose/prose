import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { posix, resolve } from "node:path";
import type { OpenProseRoot } from "./openprose-root.js";
import type { RepositoryIrActivationIntentKind } from "./repository-ir.js";
import type { ResponsibilityStatusRecord, ResponsibilityStatusValue } from "./responsibility-status.js";
import { RESPONSIBILITY_STATE_DIR } from "./responsibility-status.js";

export const RESPONSIBILITY_PRESSURE_KIND = "openprose.responsibility-pressure";
export const RESPONSIBILITY_PRESSURE_VERSION = 0;

export type ResponsibilityPressureStatus = Exclude<ResponsibilityStatusValue, "up">;
export type ResponsibilityPressureActivationKind = Extract<
	RepositoryIrActivationIntentKind,
	"fulfillment" | "retry" | "escalation"
>;

export interface ResponsibilityPressurePaths {
	responsibilityId: string;
	directoryPath: string;
	latestPressurePath: string;
	pressureLogPath: string;
	absoluteDirectoryPath: string;
	absoluteLatestPressurePath: string;
	absolutePressureLogPath: string;
}

export interface ResponsibilityPressureRecord {
	kind: typeof RESPONSIBILITY_PRESSURE_KIND;
	version: typeof RESPONSIBILITY_PRESSURE_VERSION;
	pressureId: string;
	dedupeKey: string;
	responsibilityId: string;
	responsibilityFingerprint: string;
	status: ResponsibilityPressureStatus;
	evidence: string[];
	recommendedActivationKind: ResponsibilityPressureActivationKind;
	activationId?: string;
	reason: string;
	recordedAt: string;
	source: {
		statusRecordedAt: string;
		statusActivationId?: string;
		statusTriggerId?: string;
		statusRunId?: string;
		manifestPath?: string;
		irVersion?: number;
	};
}

export interface ResponsibilityPressureValidationResult {
	valid: boolean;
	errors: string[];
}

export interface ResponsibilityPressureRecordResult {
	paths: ResponsibilityPressurePaths;
	record: ResponsibilityPressureRecord;
	recorded: boolean;
}

export class ResponsibilityPressureError extends Error {
	readonly details: string[];

	constructor(message: string, details: readonly string[] = []) {
		super(message);
		this.name = "ResponsibilityPressureError";
		this.details = [...details];
	}
}

const pressureStatuses: readonly ResponsibilityPressureStatus[] = ["drifting", "down", "blocked"];
const pressureActivationKinds: readonly ResponsibilityPressureActivationKind[] = [
	"fulfillment",
	"retry",
	"escalation",
];

export function buildResponsibilityPressurePaths(
	openProseRoot: OpenProseRoot,
	responsibilityId: string,
): ResponsibilityPressurePaths {
	if (!isNonEmptyString(responsibilityId)) {
		throw new ResponsibilityPressureError("responsibilityId must be a non-empty string");
	}

	const directoryPath = posix.join(RESPONSIBILITY_STATE_DIR, encodeURIComponent(responsibilityId));
	const latestPressurePath = posix.join(directoryPath, "pressure.latest.json");
	const pressureLogPath = posix.join(directoryPath, "pressure.jsonl");

	return {
		responsibilityId,
		directoryPath,
		latestPressurePath,
		pressureLogPath,
		absoluteDirectoryPath: resolve(openProseRoot.absolutePath, directoryPath),
		absoluteLatestPressurePath: resolve(openProseRoot.absolutePath, latestPressurePath),
		absolutePressureLogPath: resolve(openProseRoot.absolutePath, pressureLogPath),
	};
}

export function buildResponsibilityPressureRecord(options: {
	status: ResponsibilityStatusRecord;
	recommendedActivationKind: ResponsibilityPressureActivationKind;
	activationId?: string;
	reason?: string;
	recordedAt?: string;
}): ResponsibilityPressureRecord | undefined {
	const { status, recommendedActivationKind } = options;
	if (status.status === "up") {
		return undefined;
	}

	const dedupeKey = fingerprintPressure({
		responsibilityId: status.responsibilityId,
		responsibilityFingerprint: status.responsibilityFingerprint,
		status: status.status,
		recommendedActivationKind,
		...(options.activationId === undefined ? {} : { activationId: options.activationId }),
	});

	return {
		kind: RESPONSIBILITY_PRESSURE_KIND,
		version: RESPONSIBILITY_PRESSURE_VERSION,
		pressureId: dedupeKey,
		dedupeKey,
		responsibilityId: status.responsibilityId,
		responsibilityFingerprint: status.responsibilityFingerprint,
		status: status.status,
		evidence: status.evidence,
		recommendedActivationKind,
		...(options.activationId === undefined ? {} : { activationId: options.activationId }),
		reason:
			options.reason ??
			`Responsibility status is ${status.status}; ${recommendedActivationKind} should reconcile it.`,
		recordedAt: options.recordedAt ?? new Date().toISOString(),
		source: {
			statusRecordedAt: status.recordedAt,
			...(status.source.activationId === undefined ? {} : { statusActivationId: status.source.activationId }),
			...(status.source.triggerId === undefined ? {} : { statusTriggerId: status.source.triggerId }),
			...(status.source.runId === undefined ? {} : { statusRunId: status.source.runId }),
			...(status.source.manifestPath === undefined ? {} : { manifestPath: status.source.manifestPath }),
			...(status.source.irVersion === undefined ? {} : { irVersion: status.source.irVersion }),
		},
	};
}

export function validateResponsibilityPressureRecord(value: unknown): ResponsibilityPressureValidationResult {
	const errors: string[] = [];
	if (!isRecord(value)) {
		return { valid: false, errors: ["pressure record must be a JSON object"] };
	}

	if (value.kind !== RESPONSIBILITY_PRESSURE_KIND) {
		errors.push(`kind must be ${RESPONSIBILITY_PRESSURE_KIND}`);
	}
	if (value.version !== RESPONSIBILITY_PRESSURE_VERSION) {
		errors.push(`version must be ${RESPONSIBILITY_PRESSURE_VERSION}`);
	}
	for (const key of [
		"pressureId",
		"dedupeKey",
		"responsibilityId",
		"responsibilityFingerprint",
		"reason",
		"recordedAt",
	] as const) {
		if (!isNonEmptyString(value[key])) {
			errors.push(`${key} must be a non-empty string`);
		}
	}
	if (!pressureStatuses.includes(value.status as ResponsibilityPressureStatus)) {
		errors.push("status must be drifting, down, or blocked");
	}
	validateStringArray(value.evidence, "evidence", errors);
	if (!pressureActivationKinds.includes(value.recommendedActivationKind as ResponsibilityPressureActivationKind)) {
		errors.push("recommendedActivationKind must be fulfillment, retry, or escalation");
	}
	if (value.activationId !== undefined && !isNonEmptyString(value.activationId)) {
		errors.push("activationId must be a non-empty string when present");
	}
	validatePressureSource(value.source, errors);

	return { valid: errors.length === 0, errors };
}

export async function recordResponsibilityPressure(options: {
	openProseRoot: OpenProseRoot;
	record: ResponsibilityPressureRecord;
}): Promise<ResponsibilityPressureRecordResult> {
	const validation = validateResponsibilityPressureRecord(options.record);
	if (!validation.valid) {
		throw new ResponsibilityPressureError("Invalid responsibility pressure record.", validation.errors);
	}

	const paths = buildResponsibilityPressurePaths(options.openProseRoot, options.record.responsibilityId);
	const latest = await readLatestPressure(paths);
	if (latest?.dedupeKey === options.record.dedupeKey) {
		return { paths, record: latest, recorded: false };
	}

	await mkdir(paths.absoluteDirectoryPath, { recursive: true });
	await writeFile(paths.absoluteLatestPressurePath, `${JSON.stringify(options.record, null, 2)}\n`, "utf8");
	await appendFile(paths.absolutePressureLogPath, `${JSON.stringify(options.record)}\n`, "utf8");
	return { paths, record: options.record, recorded: true };
}

async function readLatestPressure(paths: ResponsibilityPressurePaths): Promise<ResponsibilityPressureRecord | undefined> {
	let text: string;
	try {
		text = await readFile(paths.absoluteLatestPressurePath, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return undefined;
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new ResponsibilityPressureError(`Unable to read latest responsibility pressure: ${message}`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new ResponsibilityPressureError(`Unable to parse latest responsibility pressure: ${message}`);
	}

	const validation = validateResponsibilityPressureRecord(parsed);
	if (!validation.valid) {
		throw new ResponsibilityPressureError("Invalid latest responsibility pressure record.", validation.errors);
	}

	return parsed as ResponsibilityPressureRecord;
}

function fingerprintPressure(value: {
	responsibilityId: string;
	responsibilityFingerprint: string;
	status: ResponsibilityPressureStatus;
	recommendedActivationKind: ResponsibilityPressureActivationKind;
	activationId?: string;
}): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

function validatePressureSource(value: unknown, errors: string[]): void {
	if (!isRecord(value)) {
		errors.push("source must be an object");
		return;
	}

	if (!isNonEmptyString(value.statusRecordedAt)) {
		errors.push("source.statusRecordedAt must be a non-empty string");
	}
	for (const key of ["statusActivationId", "statusTriggerId", "statusRunId", "manifestPath"] as const) {
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
