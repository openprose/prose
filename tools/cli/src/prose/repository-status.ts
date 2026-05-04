import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
	ACTIVE_REPOSITORY_IR_PATH,
	type RepositoryIrDiagnostic,
	type RepositoryIrV0,
	validateRepositoryIr,
} from "./repository-ir.js";
import { buildTriggerRegistrationPlan, type RepositoryServeTriggerRegistration } from "./repository-serve.js";
import { resolveOpenProseRoot, type OpenProseRoot } from "./openprose-root.js";
import {
	buildResponsibilityPressurePaths,
	validateResponsibilityPressureRecord,
	type ResponsibilityPressureRecord,
} from "./responsibility-pressure.js";
import {
	buildResponsibilityStatusPaths,
	fingerprintResponsibility,
	validateResponsibilityStatusRecord,
	type ResponsibilityStatusRecord,
} from "./responsibility-status.js";

export const REPOSITORY_RUNS_DIR = "runs";
export const REPOSITORY_STATUS_RECENT_RUN_LIMIT = 5;

export type RepositoryStatusIrState = "loaded" | "missing" | "invalid";
export type RepositoryStatusRecordState = "present" | "missing" | "invalid";

export interface LoadRepositoryStatusOptions {
	cwd: string;
	home?: string;
	manifestPath?: string;
	runLimit?: number;
}

export interface RepositoryStatusSummary {
	openProseRoot: OpenProseRoot;
	activeIr: RepositoryStatusActiveIr;
	registrations: RepositoryServeTriggerRegistration[];
	responsibilities: RepositoryStatusResponsibility[];
	runs: RepositoryStatusRun[];
}

export interface RepositoryStatusActiveIr {
	state: RepositoryStatusIrState;
	manifestPath: string;
	absoluteManifestPath: string;
	errors: string[];
	manifest?: RepositoryIrV0;
}

export interface RepositoryStatusResponsibility {
	id: string;
	sourcePath: string;
	fingerprint: string;
	status: RepositoryStatusLatestStatus;
	pressure: RepositoryStatusLatestPressure;
}

export interface RepositoryStatusLatestStatus {
	state: RepositoryStatusRecordState;
	error?: string;
	record?: ResponsibilityStatusRecord;
	stale?: boolean;
}

export interface RepositoryStatusLatestPressure {
	state: RepositoryStatusRecordState;
	error?: string;
	record?: ResponsibilityPressureRecord;
	stale?: boolean;
}

export interface RepositoryStatusRun {
	id: string;
	path: string;
	updatedAt: string;
}

export class RepositoryStatusError extends Error {
	readonly details: string[];

	constructor(message: string, details: readonly string[] = []) {
		super(message);
		this.name = "RepositoryStatusError";
		this.details = [...details];
	}
}

export async function loadRepositoryStatus(options: LoadRepositoryStatusOptions): Promise<RepositoryStatusSummary> {
	const openProseRoot = await resolveOpenProseRoot({
		cwd: options.cwd,
		...(options.home === undefined ? {} : { home: options.home }),
	});
	const activeIr = await loadStatusActiveIr(openProseRoot, options.manifestPath ?? ACTIVE_REPOSITORY_IR_PATH);
	const registrations =
		activeIr.manifest === undefined ? [] : buildTriggerRegistrationPlan(activeIr.manifest);
	const responsibilities =
		activeIr.manifest === undefined
			? []
			: await loadResponsibilityStatusSummaries(openProseRoot, activeIr.manifest);
	const runs = await loadRecentRuns(openProseRoot, options.runLimit ?? REPOSITORY_STATUS_RECENT_RUN_LIMIT);

	return {
		openProseRoot,
		activeIr,
		registrations,
		responsibilities,
		runs,
	};
}

export function formatRepositoryStatus(summary: RepositoryStatusSummary): string {
	const lines = [
		"OpenProse status",
		`Root: ${summary.openProseRoot.path} (${summary.openProseRoot.mode})`,
		`Active IR: ${summary.activeIr.manifestPath} (${summary.activeIr.state})`,
	];

	if (summary.activeIr.manifest === undefined) {
		for (const error of summary.activeIr.errors) {
			lines.push(`- ${error}`);
		}
		lines.push("");
		lines.push("Responsibilities: none");
		lines.push("");
		appendRuns(lines, summary.runs);
		return lines.join("\n");
	}

	const manifest = summary.activeIr.manifest;
	lines.push(`IR: ${manifest.kind} v${manifest.version}`);
	lines.push(`Sources: ${manifest.sources.length}`);
	lines.push(`Responsibilities: ${manifest.responsibilities.length}`);
	lines.push(`Triggers: ${manifest.triggers.length}`);
	lines.push(`Activations: ${formatActivationCounts(manifest)}`);
	lines.push(`Forme manifests: ${manifest.formeManifests.length}`);
	lines.push("");
	appendDiagnostics(lines, manifest.diagnostics);
	lines.push("");
	appendTriggerPlan(lines, summary.registrations);
	lines.push("");
	appendResponsibilities(lines, summary.responsibilities);
	lines.push("");
	appendRuns(lines, summary.runs);

	return lines.join("\n");
}

async function loadStatusActiveIr(openProseRoot: OpenProseRoot, manifestPath: string): Promise<RepositoryStatusActiveIr> {
	const absoluteManifestPath = resolve(openProseRoot.absolutePath, manifestPath);
	let text: string;

	try {
		text = await readFile(absoluteManifestPath, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return {
				state: "missing",
				manifestPath,
				absoluteManifestPath,
				errors: [`No active IR found at ${manifestPath}. Run prose compile and promote the manifest when ready.`],
			};
		}
		const message = error instanceof Error ? error.message : String(error);
		return {
			state: "invalid",
			manifestPath,
			absoluteManifestPath,
			errors: [`Unable to read active IR: ${message}`],
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			state: "invalid",
			manifestPath,
			absoluteManifestPath,
			errors: [`Unable to parse active IR: ${message}`],
		};
	}

	const validation = validateRepositoryIr(parsed);
	if (!validation.valid) {
		return {
			state: "invalid",
			manifestPath,
			absoluteManifestPath,
			errors: validation.errors,
		};
	}

	return {
		state: "loaded",
		manifestPath,
		absoluteManifestPath,
		errors: [],
		manifest: parsed as RepositoryIrV0,
	};
}

async function loadResponsibilityStatusSummaries(
	openProseRoot: OpenProseRoot,
	manifest: RepositoryIrV0,
): Promise<RepositoryStatusResponsibility[]> {
	return Promise.all(
		manifest.responsibilities.map(async (responsibility) => {
			const fingerprint = fingerprintResponsibility(responsibility);
			const statusPaths = buildResponsibilityStatusPaths(openProseRoot, responsibility.id);
			const pressurePaths = buildResponsibilityPressurePaths(openProseRoot, responsibility.id);
			const [status, pressure] = await Promise.all([
				readLatestStatus(statusPaths.absoluteLatestPath, fingerprint),
				readLatestPressure(pressurePaths.absoluteLatestPressurePath, fingerprint),
			]);

			return {
				id: responsibility.id,
				sourcePath: responsibility.sourcePath,
				fingerprint,
				status,
				pressure,
			};
		}),
	);
}

async function readLatestStatus(path: string, fingerprint: string): Promise<RepositoryStatusLatestStatus> {
	const parsed = await readOptionalJson(path, "responsibility status");
	if (parsed.state !== "present") {
		return parsed;
	}

	const validation = validateResponsibilityStatusRecord(parsed.value);
	if (!validation.valid) {
		return { state: "invalid", error: validation.errors.join("; ") };
	}

	const record = parsed.value as ResponsibilityStatusRecord;
	return {
		state: "present",
		record,
		stale: record.responsibilityFingerprint !== fingerprint,
	};
}

async function readLatestPressure(path: string, fingerprint: string): Promise<RepositoryStatusLatestPressure> {
	const parsed = await readOptionalJson(path, "responsibility pressure");
	if (parsed.state !== "present") {
		return parsed;
	}

	const validation = validateResponsibilityPressureRecord(parsed.value);
	if (!validation.valid) {
		return { state: "invalid", error: validation.errors.join("; ") };
	}

	const record = parsed.value as ResponsibilityPressureRecord;
	return {
		state: "present",
		record,
		stale: record.responsibilityFingerprint !== fingerprint,
	};
}

async function readOptionalJson(
	path: string,
	label: string,
): Promise<{ state: "missing" } | { state: "invalid"; error: string } | { state: "present"; value: unknown }> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return { state: "missing" };
		}
		const message = error instanceof Error ? error.message : String(error);
		return { state: "invalid", error: `Unable to read latest ${label}: ${message}` };
	}

	try {
		return { state: "present", value: JSON.parse(text) };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { state: "invalid", error: `Unable to parse latest ${label}: ${message}` };
	}
}

async function loadRecentRuns(openProseRoot: OpenProseRoot, limit: number): Promise<RepositoryStatusRun[]> {
	const runsPath = resolve(openProseRoot.absolutePath, REPOSITORY_RUNS_DIR);
	let entries;
	try {
		entries = await readdir(runsPath, { withFileTypes: true });
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return [];
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new RepositoryStatusError(`Unable to read ${REPOSITORY_RUNS_DIR}/: ${message}`);
	}

	const runs = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory())
			.map(async (entry): Promise<RepositoryStatusRun | undefined> => {
				const path = resolve(runsPath, entry.name);
				try {
					const info = await stat(path);
					return {
						id: entry.name,
						path: `${REPOSITORY_RUNS_DIR}/${entry.name}`,
						updatedAt: info.mtime.toISOString(),
					};
				} catch {
					return undefined;
				}
			}),
	);

	return runs
		.filter((run): run is RepositoryStatusRun => run !== undefined)
		.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
		.slice(0, Math.max(0, limit));
}

function appendDiagnostics(lines: string[], diagnostics: RepositoryIrDiagnostic[]): void {
	lines.push("Diagnostics:");
	if (diagnostics.length === 0) {
		lines.push("- none");
		return;
	}

	for (const diagnostic of diagnostics) {
		const source = diagnostic.sourcePath === undefined ? "" : ` ${diagnostic.sourcePath}:`;
		lines.push(`- ${diagnostic.severity}${source} ${diagnostic.message}`);
	}
}

function appendTriggerPlan(lines: string[], registrations: RepositoryServeTriggerRegistration[]): void {
	lines.push("Trigger plan:");
	if (registrations.length === 0) {
		lines.push("- none");
		return;
	}

	for (const registration of registrations) {
		const activations =
			registration.activationIds.length === 0 ? "none" : registration.activationIds.join(", ");
		lines.push(`- ${registration.triggerId} [${registration.kind}] -> ${activations}`);
	}
}

function appendResponsibilities(lines: string[], responsibilities: RepositoryStatusResponsibility[]): void {
	lines.push("Responsibilities:");
	if (responsibilities.length === 0) {
		lines.push("- none");
		return;
	}

	for (const responsibility of responsibilities) {
		lines.push(`- ${responsibility.id}`);
		lines.push(`  source: ${responsibility.sourcePath}`);
		lines.push(`  status: ${formatLatestStatus(responsibility.status)}`);
		lines.push(`  pressure: ${formatLatestPressure(responsibility.pressure)}`);
	}
}

function appendRuns(lines: string[], runs: RepositoryStatusRun[]): void {
	lines.push("Runs:");
	if (runs.length === 0) {
		lines.push("- none");
		return;
	}

	for (const run of runs) {
		lines.push(`- ${run.id} updated ${run.updatedAt}`);
	}
}

function formatLatestStatus(status: RepositoryStatusLatestStatus): string {
	if (status.state === "missing") {
		return "missing";
	}
	if (status.state === "invalid") {
		return `invalid (${status.error ?? "unknown error"})`;
	}

	const record = status.record;
	if (record === undefined) {
		return "invalid (missing record)";
	}
	return [
		`${record.status} at ${record.recordedAt}`,
		`${record.evidence.length} evidence`,
		status.stale ? "stale" : undefined,
	]
		.filter((part): part is string => part !== undefined)
		.join("; ");
}

function formatLatestPressure(pressure: RepositoryStatusLatestPressure): string {
	if (pressure.state === "missing") {
		return "none";
	}
	if (pressure.state === "invalid") {
		return `invalid (${pressure.error ?? "unknown error"})`;
	}

	const record = pressure.record;
	if (record === undefined) {
		return "invalid (missing record)";
	}

	const activation = record.activationId === undefined ? "" : ` -> ${record.activationId}`;
	return [
		`${record.recommendedActivationKind} for ${record.status}${activation}`,
		`at ${record.recordedAt}`,
		pressure.stale ? "stale" : undefined,
	]
		.filter((part): part is string => part !== undefined)
		.join("; ");
}

function formatActivationCounts(manifest: RepositoryIrV0): string {
	if (manifest.activations.length === 0) {
		return "0";
	}

	const counts = new Map<string, number>();
	for (const activation of manifest.activations) {
		counts.set(activation.kind, (counts.get(activation.kind) ?? 0) + 1);
	}

	const breakdown = [...counts.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([kind, count]) => `${kind}: ${count}`)
		.join(", ");
	return `${manifest.activations.length} (${breakdown})`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
