import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, posix, resolve } from "node:path";
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
	pressureClaimDirectoryPath: string;
	absoluteDirectoryPath: string;
	absoluteLatestPressurePath: string;
	absolutePressureLogPath: string;
	absolutePressureClaimDirectoryPath: string;
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
		triggerDedupeKey?: string;
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
const pressureWriteQueues = new Map<string, Promise<void>>();

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
	const pressureClaimDirectoryPath = posix.join(directoryPath, "pressure-claims");

	return {
		responsibilityId,
		directoryPath,
		latestPressurePath,
		pressureLogPath,
		pressureClaimDirectoryPath,
		absoluteDirectoryPath: resolve(openProseRoot.absolutePath, directoryPath),
		absoluteLatestPressurePath: resolve(openProseRoot.absolutePath, latestPressurePath),
		absolutePressureLogPath: resolve(openProseRoot.absolutePath, pressureLogPath),
		absolutePressureClaimDirectoryPath: resolve(openProseRoot.absolutePath, pressureClaimDirectoryPath),
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
		statusRecordedAt: status.recordedAt,
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
	return enqueueResponsibilityPressureWrite(paths.responsibilityId, () =>
		recordResponsibilityPressureSerialized({ record: options.record, paths }),
	);
}

async function recordResponsibilityPressureSerialized(options: {
	record: ResponsibilityPressureRecord;
	paths: ResponsibilityPressurePaths;
}): Promise<ResponsibilityPressureRecordResult> {
	const { paths } = options;
	const latest = await readLatestPressure(paths);
	if (latest !== undefined && pressureClaimsMatch(latest, options.record)) {
		return { paths, record: latest, recorded: false };
	}

	await mkdir(paths.absolutePressureClaimDirectoryPath, { recursive: true });
	const claimPath = resolve(paths.absolutePressureClaimDirectoryPath, `${fingerprintPressureClaim(options.record)}.json`);
	try {
		await writeFile(claimPath, `${JSON.stringify(options.record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
	} catch (error) {
		if (!isNodeError(error) || error.code !== "EEXIST") {
			const message = error instanceof Error ? error.message : String(error);
			throw new ResponsibilityPressureError(`Unable to claim responsibility pressure: ${message}`);
		}
		return {
			paths,
			record: await readPressureRecord(claimPath, "claimed responsibility pressure"),
			recorded: false,
		};
	}

	await writeJsonFileAtomic(paths.absoluteLatestPressurePath, options.record);
	await appendFile(paths.absolutePressureLogPath, `${JSON.stringify(options.record)}\n`, "utf8");
	return { paths, record: options.record, recorded: true };
}

async function enqueueResponsibilityPressureWrite<T>(responsibilityId: string, operation: () => Promise<T>): Promise<T> {
	const previous = pressureWriteQueues.get(responsibilityId) ?? Promise.resolve();
	const run = previous.catch(() => undefined).then(operation);
	const next = run.then(
		() => undefined,
		() => undefined,
	);
	pressureWriteQueues.set(responsibilityId, next);

	try {
		return await run;
	} finally {
		if (pressureWriteQueues.get(responsibilityId) === next) {
			pressureWriteQueues.delete(responsibilityId);
		}
	}
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

	return parsePressureRecord(text, "latest responsibility pressure");
}

async function readPressureRecord(path: string, label: string): Promise<ResponsibilityPressureRecord> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new ResponsibilityPressureError(`Unable to read ${label}: ${message}`);
	}

	return parsePressureRecord(text, label);
}

function parsePressureRecord(text: string, label: string): ResponsibilityPressureRecord {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new ResponsibilityPressureError(`Unable to parse ${label}: ${message}`);
	}

	const validation = validateResponsibilityPressureRecord(parsed);
	if (!validation.valid) {
		throw new ResponsibilityPressureError(`Invalid ${label} record.`, validation.errors);
	}

	return parsed as ResponsibilityPressureRecord;
}

function pressureClaimsMatch(left: ResponsibilityPressureRecord, right: ResponsibilityPressureRecord): boolean {
	return left.dedupeKey === right.dedupeKey || fingerprintPressureClaim(left) === fingerprintPressureClaim(right);
}

function fingerprintPressure(value: {
	responsibilityId: string;
	responsibilityFingerprint: string;
	status: ResponsibilityPressureStatus;
	statusRecordedAt: string;
	recommendedActivationKind: ResponsibilityPressureActivationKind;
	activationId?: string;
}): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fingerprintPressureClaim(record: ResponsibilityPressureRecord): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				schema: "openprose.responsibility-pressure-claim",
				v: 0,
				responsibilityId: record.responsibilityId,
				responsibilityFingerprint: record.responsibilityFingerprint,
				status: record.status,
				recommendedActivationKind: record.recommendedActivationKind,
				...(record.activationId === undefined ? {} : { activationId: record.activationId }),
				statusRecordedAt: record.source.statusRecordedAt,
			}),
		)
		.digest("hex");
}

async function writeJsonFileAtomic(path: string, value: unknown): Promise<void> {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
			await rename(temporaryPath, path);
			return;
		} catch (error) {
			try {
				await unlink(temporaryPath);
			} catch {
				// Best-effort cleanup; preserve the original write/rename failure.
			}
			if (attempt === 0 && isNodeError(error) && error.code === "ENOENT") {
				await mkdir(dirname(path), { recursive: true });
				continue;
			}
			throw error;
		}
	}
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
	for (const key of [
		"statusActivationId",
		"statusTriggerId",
		"statusRunId",
		"manifestPath",
		"triggerDedupeKey",
	] as const) {
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
