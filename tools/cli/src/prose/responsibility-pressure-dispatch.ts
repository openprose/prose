import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, posix, resolve } from "node:path";
import type { OpenProseRoot } from "./openprose-root.js";
import {
	buildResponsibilityPressurePaths,
	validateResponsibilityPressureRecord,
	type ResponsibilityPressureRecord,
} from "./responsibility-pressure.js";

export const RESPONSIBILITY_PRESSURE_DISPATCH_KIND = "openprose.responsibility-pressure-dispatch";
export const RESPONSIBILITY_PRESSURE_DISPATCH_VERSION = 0;

export interface ResponsibilityPressureDispatchRecord {
	kind: typeof RESPONSIBILITY_PRESSURE_DISPATCH_KIND;
	version: typeof RESPONSIBILITY_PRESSURE_DISPATCH_VERSION;
	pressureId: string;
	dedupeKey: string;
	responsibilityId: string;
	activationId: string;
	claimedAt: string;
	effectStartedAt?: string;
	completedAt?: string;
	exitCode?: number;
}

export interface ResponsibilityPressureDispatchClaimResult {
	claimed: boolean;
	path: string;
	record: ResponsibilityPressureDispatchRecord;
}

export async function readLatestResponsibilityPressure(options: {
	openProseRoot: OpenProseRoot;
	responsibilityId: string;
}): Promise<ResponsibilityPressureRecord | undefined> {
	const paths = buildResponsibilityPressurePaths(options.openProseRoot, options.responsibilityId);
	let text: string;
	try {
		text = await readFile(paths.absoluteLatestPressurePath, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return undefined;
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Unable to read latest responsibility pressure: ${message}`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Unable to parse latest responsibility pressure: ${message}`);
	}

	const validation = validateResponsibilityPressureRecord(parsed);
	if (!validation.valid) {
		throw new Error(`Invalid latest responsibility pressure record: ${validation.errors.join("; ")}`);
	}
	return parsed as ResponsibilityPressureRecord;
}

export async function claimResponsibilityPressureDispatch(options: {
	openProseRoot: OpenProseRoot;
	pressure: ResponsibilityPressureRecord;
	activationId: string;
	claimedAt?: string;
	reclaimIncomplete?: boolean;
}): Promise<ResponsibilityPressureDispatchClaimResult> {
	const validation = validateResponsibilityPressureRecord(options.pressure);
	if (!validation.valid) {
		throw new Error(`Invalid responsibility pressure record: ${validation.errors.join("; ")}`);
	}

	const path = buildResponsibilityPressureDispatchPath(options.openProseRoot, options.pressure);
	const record: ResponsibilityPressureDispatchRecord = {
		kind: RESPONSIBILITY_PRESSURE_DISPATCH_KIND,
		version: RESPONSIBILITY_PRESSURE_DISPATCH_VERSION,
		pressureId: options.pressure.pressureId,
		dedupeKey: options.pressure.dedupeKey,
		responsibilityId: options.pressure.responsibilityId,
		activationId: options.activationId,
		claimedAt: options.claimedAt ?? new Date().toISOString(),
	};

	await mkdir(dirname(path), { recursive: true });
	let file;
	try {
		file = await open(path, "wx");
	} catch (error) {
		if (isNodeError(error) && error.code === "EEXIST") {
			const existing = await readPressureDispatchRecord(path);
			if (options.reclaimIncomplete === true && isIncompleteDispatchClaim(existing, options)) {
				return {
					claimed: true,
					path,
					record: existing,
				};
			}
			return {
				claimed: false,
				path,
				record: existing,
			};
		}
		throw error;
	}

	try {
		await file.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
	} finally {
		await file.close();
	}

	return {
		claimed: true,
		path,
		record,
	};
}

export async function completeResponsibilityPressureDispatch(options: {
	claim: ResponsibilityPressureDispatchClaimResult;
	completedAt?: string;
	exitCode: number;
}): Promise<ResponsibilityPressureDispatchRecord> {
	const record: ResponsibilityPressureDispatchRecord = {
		...options.claim.record,
		completedAt: options.completedAt ?? new Date().toISOString(),
		exitCode: options.exitCode,
	};
	await writeFile(options.claim.path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
	return record;
}

export async function startResponsibilityPressureDispatchEffect(options: {
	claim: ResponsibilityPressureDispatchClaimResult;
	effectStartedAt?: string;
}): Promise<ResponsibilityPressureDispatchClaimResult> {
	const record: ResponsibilityPressureDispatchRecord = {
		...options.claim.record,
		effectStartedAt: options.effectStartedAt ?? new Date().toISOString(),
	};
	await writeFile(options.claim.path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
	return {
		...options.claim,
		record,
	};
}

export function buildResponsibilityPressureDispatchPath(
	openProseRoot: OpenProseRoot,
	pressure: Pick<ResponsibilityPressureRecord, "responsibilityId" | "dedupeKey">,
): string {
	const directoryPath = posix.join(
		"state/responsibilities",
		encodeURIComponent(pressure.responsibilityId),
		"pressure.dispatches",
	);
	return resolve(openProseRoot.absolutePath, directoryPath, `${encodeURIComponent(pressure.dedupeKey)}.json`);
}

async function readPressureDispatchRecord(path: string): Promise<ResponsibilityPressureDispatchRecord> {
	const text = await readFile(path, "utf8");
	const parsed = JSON.parse(text) as ResponsibilityPressureDispatchRecord;
	if (
		parsed.kind !== RESPONSIBILITY_PRESSURE_DISPATCH_KIND ||
		parsed.version !== RESPONSIBILITY_PRESSURE_DISPATCH_VERSION ||
		typeof parsed.pressureId !== "string" ||
		typeof parsed.dedupeKey !== "string" ||
		typeof parsed.responsibilityId !== "string" ||
		typeof parsed.activationId !== "string" ||
		typeof parsed.claimedAt !== "string" ||
		(parsed.effectStartedAt !== undefined && typeof parsed.effectStartedAt !== "string") ||
		(parsed.completedAt !== undefined && typeof parsed.completedAt !== "string") ||
		(parsed.exitCode !== undefined && !Number.isInteger(parsed.exitCode))
	) {
		throw new Error(`Invalid responsibility pressure dispatch claim at ${path}`);
	}
	return parsed;
}

function isIncompleteDispatchClaim(
	record: ResponsibilityPressureDispatchRecord,
	options: {
		pressure: ResponsibilityPressureRecord;
		activationId: string;
	},
): boolean {
	return (
		record.pressureId === options.pressure.pressureId &&
		record.dedupeKey === options.pressure.dedupeKey &&
		record.responsibilityId === options.pressure.responsibilityId &&
		record.activationId === options.activationId &&
		record.effectStartedAt === undefined &&
		record.completedAt === undefined &&
		record.exitCode === undefined
	);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}
