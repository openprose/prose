import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WritableStreamLike } from "../harnesses/types.js";
import { canonicalPrompt } from "./command-model.js";
import {
	ACTIVE_REPOSITORY_IR_PATH,
	REPOSITORY_IR_KIND,
	type RepositoryIrActivationIntent,
	type RepositoryIrFulfillmentIntent,
	type RepositoryIrResponsibilityTool,
	type RepositoryIrTrigger,
	type RepositoryIrTriggerKind,
	type RepositoryIrV0,
	validateRepositoryIr,
} from "./repository-ir.js";
import { resolveOpenProseRoot, type OpenProseRoot } from "./openprose-root.js";
import { PROSE_FULFILLMENT_ARTIFACT_PATH_ENV } from "./fulfillment-artifact.js";
import {
	buildResponsibilityPressureRecord,
	recordResponsibilityPressure,
	type ResponsibilityPressureActivationKind,
	type ResponsibilityPressureRecord,
	type ResponsibilityPressureRecordResult,
} from "./responsibility-pressure.js";
import {
	claimResponsibilityPressureDispatch,
	completeResponsibilityPressureDispatch,
	readLatestResponsibilityPressure,
	startResponsibilityPressureDispatchEffect,
} from "./responsibility-pressure-dispatch.js";
import {
	buildResponsibilityStatusPaths,
	fingerprintResponsibility,
	validateResponsibilityStatusRecord,
} from "./responsibility-status.js";
import type { ResponsibilityStatusRecord } from "./responsibility-status.js";
import {
	findRepositoryTriggerReceipt,
	ingestRepositoryTriggerThroughReactor,
	loadResponsibilityReactor,
	type LoadResponsibilityReactorOptions,
} from "./responsibility-reactor.js";

export const OPENPROSE_JUDGE_SOURCE_PATH = "runtime/judge-responsibility.prose.md";

export class RepositoryServeError extends Error {
	readonly details: string[];

	constructor(message: string, details: readonly string[] = []) {
		super(message);
		this.name = "RepositoryServeError";
		this.details = [...details];
	}
}

export interface RepositoryServeLoadedIr {
	manifest: RepositoryIrV0;
	manifestPath: string;
	absoluteManifestPath: string;
	openProseRoot: OpenProseRoot;
}

export interface RepositoryServeTriggerRegistration {
	triggerId: string;
	responsibilityId: string;
	kind: RepositoryIrTriggerKind;
	reason: string;
	activationIds: string[];
	adapter: "timer" | "http" | "manual" | "unknown";
	cron?: string;
	timezone?: string;
	method?: string;
	path?: string;
}

export interface RepositoryServeSummary {
	loaded: RepositoryServeLoadedIr;
	registrations: RepositoryServeTriggerRegistration[];
}

export interface RepositoryServeEvent {
	triggerId: string;
	payload?: unknown;
}

export interface RepositoryServeResolvedActivation {
	trigger: RepositoryIrTrigger;
	activation: RepositoryIrActivationIntent;
}

export interface RepositoryServeActivationPayload {
	kind: "openprose.activation";
	ir: {
		kind: typeof REPOSITORY_IR_KIND;
		version: number;
		manifestPath: string;
	};
	trigger: {
		id: string;
		kind: RepositoryIrTriggerKind;
		responsibilityId: string;
		reason: string;
		cron?: string;
		timezone?: string;
		method?: string;
		path?: string;
	};
	activation: {
		id: string;
		attemptId: string;
		kind: RepositoryIrActivationIntent["kind"];
		responsibilityId: string;
		reason: string;
		targetName?: string;
		sourcePath?: string;
		formeManifestId?: string;
	};
	responsibility: {
		id: string;
		sourcePath: string;
		goal: string;
		continuity: string[];
		criteria: string[];
		constraints: string[];
		tools: RepositoryIrResponsibilityTool[];
		fingerprint: string;
		fulfillment?: RepositoryIrFulfillmentIntent;
	};
	event: {
		triggerId: string;
		payload?: unknown;
	};
	status?: {
		kind: "openprose.responsibility-status-output";
		latestPath: string;
		statusLogPath: string;
		responsibilityFingerprint: string;
	};
	pressure?: ResponsibilityPressureRecord;
}

export interface RepositoryServeActivationRunRequest {
	activationId: string;
	sourcePath: string;
	argv: string[];
	prompt: string;
	payload: RepositoryServeActivationPayload;
	env: Record<string, string>;
}

export interface RepositoryServeActivationResult {
	activationId: string;
	exitCode: number;
	source: "trigger" | "pressure";
}

export interface RepositoryServeDispatchResult {
	triggerId: string;
	activationResults: RepositoryServeActivationResult[];
}

export type RepositoryServeReactorOptions = Omit<LoadResponsibilityReactorOptions, "loaded" | "responsibilityId">;

interface RepositoryServeJudgeRequest {
	request: RepositoryServeActivationRunRequest;
	previousStatusText?: string;
}

export interface LoadActiveRepositoryIrOptions {
	cwd: string;
	home?: string;
	manifestPath?: string;
}

export interface LaunchActivationRunOptions {
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	stdout: WritableStreamLike;
	stderr: WritableStreamLike;
	signal?: AbortSignal;
	commandRunner: (options: {
		command: "run";
		argv: readonly string[];
		cwd: string;
		env: Readonly<Record<string, string | undefined>>;
		stdout: WritableStreamLike;
		stderr: WritableStreamLike;
		signal?: AbortSignal;
	}) => Promise<number>;
}

export async function loadActiveRepositoryIr(options: LoadActiveRepositoryIrOptions): Promise<RepositoryServeLoadedIr> {
	const manifestPath = options.manifestPath ?? ACTIVE_REPOSITORY_IR_PATH;
	const openProseRoot = await resolveOpenProseRoot({
		cwd: options.cwd,
		...(options.home === undefined ? {} : { home: options.home }),
	});
	const absoluteManifestPath = resolve(openProseRoot.absolutePath, manifestPath);
	let text: string;

	try {
		text = await readFile(absoluteManifestPath, "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new RepositoryServeError(`Unable to read active repository IR at ${manifestPath}: ${message}`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new RepositoryServeError(`Unable to parse active repository IR at ${manifestPath}: ${message}`);
	}

	const validation = validateRepositoryIr(parsed);
	if (!validation.valid) {
		throw new RepositoryServeError(`Invalid active repository IR at ${manifestPath}.`, validation.errors);
	}

	return {
		manifest: parsed as RepositoryIrV0,
		manifestPath,
		absoluteManifestPath,
		openProseRoot,
	};
}

export async function prepareRepositoryServe(
	options: LoadActiveRepositoryIrOptions,
): Promise<RepositoryServeSummary> {
	const loaded = await loadActiveRepositoryIr(options);
	return {
		loaded,
		registrations: buildTriggerRegistrationPlan(loaded.manifest),
	};
}

export function buildTriggerRegistrationPlan(manifest: RepositoryIrV0): RepositoryServeTriggerRegistration[] {
	return manifest.triggers.map((trigger) => ({
		triggerId: trigger.id,
		responsibilityId: trigger.responsibilityId,
		kind: trigger.kind,
		reason: trigger.reason,
		activationIds: manifest.activations
			.filter((activation) => activation.triggerIds?.includes(trigger.id))
			.map((activation) => activation.id),
		adapter: adapterForTriggerKind(trigger.kind),
		...(trigger.cron === undefined ? {} : { cron: trigger.cron }),
		...(trigger.timezone === undefined ? {} : { timezone: trigger.timezone }),
		...(trigger.method === undefined ? {} : { method: trigger.method }),
		...(trigger.path === undefined ? {} : { path: trigger.path }),
	}));
}

export function resolveActivationsForEvent(
	manifest: RepositoryIrV0,
	event: RepositoryServeEvent,
): RepositoryServeResolvedActivation[] {
	const trigger = manifest.triggers.find((candidate) => candidate.id === event.triggerId);
	if (trigger === undefined) {
		throw new RepositoryServeError(`Unknown trigger '${event.triggerId}'.`);
	}

	return manifest.activations
		.filter((activation) => activation.triggerIds?.includes(event.triggerId))
		.map((activation) => {
			if (activation.responsibilityId !== trigger.responsibilityId) {
				throw new RepositoryServeError(
					`Activation '${activation.id}' is linked to trigger '${trigger.id}' from a different responsibility.`,
				);
			}
			return { trigger, activation };
		});
}

export async function dispatchRepositoryServeEvent(options: {
	loaded: RepositoryServeLoadedIr;
	event: RepositoryServeEvent;
	run: Omit<LaunchActivationRunOptions, "cwd"> & { cwd?: string };
	reactor?: RepositoryServeReactorOptions;
}): Promise<RepositoryServeDispatchResult> {
	const resolvedActivations = resolveActivationsForEvent(options.loaded.manifest, options.event);
	const activationResults: RepositoryServeActivationResult[] = [];
	const launchedActivationIds = new Set<string>();
	const judgeRequests: RepositoryServeJudgeRequest[] = [];
	const cwd = options.run.cwd ?? options.loaded.openProseRoot.absolutePath;

	if (options.reactor !== undefined) {
		await dispatchRepositoryServeEventThroughReactor({
			loaded: options.loaded,
			event: options.event,
			run: options.run,
			reactor: options.reactor,
			cwd,
			activationResults,
			launchedActivationIds,
		});

		return {
			triggerId: options.event.triggerId,
			activationResults,
		};
	}

	for (const resolved of resolvedActivations) {
		const request = buildActivationRunRequest({
			loaded: options.loaded,
			event: options.event,
			resolved,
		});
		const previousStatusText =
			request.payload.activation.kind === "judge" ? await readLatestStatusText(request) : undefined;
		const exitCode = await launchActivationRun(request, {
			...options.run,
			cwd,
		});
		activationResults.push({
			activationId: request.activationId,
			exitCode,
			source: "trigger",
		});
		launchedActivationIds.add(request.activationId);

		if (exitCode !== 0) {
			throw new RepositoryServeError(`Activation '${request.activationId}' exited with code ${exitCode}.`);
		}
		if (request.payload.activation.kind === "judge") {
			judgeRequests.push({
				request,
				...(previousStatusText === undefined ? {} : { previousStatusText }),
			});
		}
	}

	for (const judge of judgeRequests) {
		const status = await readLatestStatusForJudgeRequest(judge.request, judge.previousStatusText);
		const pressureResult = await recordPressureFromStatus({
			loaded: options.loaded,
			status,
		});
		if (pressureResult?.recorded !== true) {
			continue;
		}
		const pressureActivationId = pressureResult.record.activationId;
		if (pressureActivationId !== undefined && launchedActivationIds.has(pressureActivationId)) {
			continue;
		}

		const pressureRequest = buildPressureActivationRunRequest({
			loaded: options.loaded,
			pressure: pressureResult.record,
		});
		const pressureActivation = await launchPressureActivationOnce({
			loaded: options.loaded,
			pressure: pressureResult.record,
			request: pressureRequest,
			run: options.run,
			cwd,
		});
		if (pressureActivation === undefined) {
			continue;
		}
		activationResults.push(pressureActivation);
		launchedActivationIds.add(pressureActivation.activationId);

		if (pressureActivation.exitCode !== 0) {
			throw new RepositoryServeError(
				`Pressure activation '${pressureActivation.activationId}' exited with code ${pressureActivation.exitCode}.`,
			);
		}
	}

	return {
		triggerId: options.event.triggerId,
		activationResults,
	};
}

async function dispatchRepositoryServeEventThroughReactor(options: {
	loaded: RepositoryServeLoadedIr;
	event: RepositoryServeEvent;
	run: Omit<LaunchActivationRunOptions, "cwd"> & { cwd?: string };
	reactor: RepositoryServeReactorOptions;
	cwd: string;
	activationResults: RepositoryServeActivationResult[];
	launchedActivationIds: Set<string>;
}): Promise<void> {
	const trigger = findTriggerForEvent(options.loaded.manifest, options.event);
	const bridge = loadResponsibilityReactor({
		...options.reactor,
		loaded: options.loaded,
		responsibilityId: trigger.responsibilityId,
	});
	const existing = findRepositoryTriggerReceipt({
		bridge,
		loaded: options.loaded,
		event: options.event,
		...(options.reactor.asOf === undefined ? {} : { asOf: options.reactor.asOf }),
	});
	const latestPressure = await readLatestResponsibilityPressure({
		openProseRoot: options.loaded.openProseRoot,
		responsibilityId: bridge.responsibility.id,
	});
	if (
		latestPressure !== undefined &&
		latestPressure.responsibilityFingerprint === fingerprintResponsibility(bridge.responsibility) &&
		latestPressure.source.triggerDedupeKey === existing.triggerDedupeKey
	) {
		return;
	}
	if (existing.receipt !== undefined) {
		return;
	}
	const result = ingestRepositoryTriggerThroughReactor({
		bridge,
		loaded: options.loaded,
		event: options.event,
		...(options.reactor.asOf === undefined ? {} : { asOf: options.reactor.asOf }),
	});
	if (!result.result.accepted) {
		throw new RepositoryServeError(
			`Reactor rejected trigger '${options.event.triggerId}' with outcome '${result.result.outcome}'.`,
		);
	}
	if (result.pressure === undefined) {
		return;
	}

	const pressureResult = await recordResponsibilityPressure({
		openProseRoot: options.loaded.openProseRoot,
		record: result.pressure,
	});
	if (pressureResult.recorded !== true) {
		return;
	}

	const pressureActivationId = pressureResult.record.activationId;
	if (pressureActivationId !== undefined && options.launchedActivationIds.has(pressureActivationId)) {
		return;
	}

	const pressureRequest = buildPressureActivationRunRequest({
		loaded: options.loaded,
		pressure: pressureResult.record,
	});
	const pressureActivation = await launchPressureActivationOnce({
		loaded: options.loaded,
		pressure: pressureResult.record,
		request: pressureRequest,
		run: options.run,
		cwd: options.cwd,
	});
	if (pressureActivation === undefined) {
		return;
	}
	options.activationResults.push(pressureActivation);
	options.launchedActivationIds.add(pressureActivation.activationId);

	if (pressureActivation.exitCode !== 0) {
		throw new RepositoryServeError(
			`Pressure activation '${pressureActivation.activationId}' exited with code ${pressureActivation.exitCode}.`,
		);
	}
}

export async function dispatchPendingPressureActivations(options: {
	loaded: RepositoryServeLoadedIr;
	run: Omit<LaunchActivationRunOptions, "cwd"> & { cwd?: string };
}): Promise<RepositoryServeActivationResult[]> {
	const results: RepositoryServeActivationResult[] = [];
	const cwd = options.run.cwd ?? options.loaded.openProseRoot.absolutePath;

	for (const responsibility of options.loaded.manifest.responsibilities) {
		const pressure = await readLatestResponsibilityPressure({
			openProseRoot: options.loaded.openProseRoot,
			responsibilityId: responsibility.id,
		});
		if (pressure === undefined) {
			continue;
		}
		if (pressure.responsibilityFingerprint !== fingerprintResponsibility(responsibility)) {
			continue;
		}

		const request = buildPressureActivationRunRequest({
			loaded: options.loaded,
			pressure,
		});
		const result = await launchPressureActivationOnce({
			loaded: options.loaded,
			pressure,
			request,
			run: options.run,
			cwd,
			reclaimIncomplete: true,
		});
		if (result === undefined) {
			continue;
		}
		results.push(result);
		if (result.exitCode !== 0) {
			throw new RepositoryServeError(`Pressure activation '${result.activationId}' exited with code ${result.exitCode}.`);
		}
	}

	return results;
}

export function buildActivationRunRequest(options: {
	loaded: RepositoryServeLoadedIr;
	event: RepositoryServeEvent;
	resolved: RepositoryServeResolvedActivation;
	pressure?: ResponsibilityPressureRecord;
}): RepositoryServeActivationRunRequest {
	const { loaded, event, pressure, resolved } = options;
	const { manifest } = loaded;
	const { activation, trigger } = resolved;
	const sourcePath = activation.sourcePath ?? (activation.kind === "judge" ? OPENPROSE_JUDGE_SOURCE_PATH : undefined);
	const attemptId = randomUUID();

	if (sourcePath === undefined) {
		throw new RepositoryServeError(`Activation '${activation.id}' does not declare a runnable sourcePath.`);
	}

	const responsibility = manifest.responsibilities.find((candidate) => candidate.id === activation.responsibilityId);
	if (responsibility === undefined) {
		throw new RepositoryServeError(`Activation '${activation.id}' references an unknown responsibility.`);
	}

	const responsibilityFingerprint = fingerprintResponsibility(responsibility);
	validateActivationPressure({
		activation,
		responsibilityFingerprint,
		...(pressure === undefined ? {} : { pressure }),
	});
	const statusPaths =
		activation.kind === "judge" ? buildResponsibilityStatusPaths(loaded.openProseRoot, responsibility.id) : undefined;
	const fulfillmentArtifactPath = buildFulfillmentArtifactPath(activation, attemptId);
	const payload: RepositoryServeActivationPayload = {
		kind: "openprose.activation",
		ir: {
			kind: manifest.kind,
			version: manifest.version,
			manifestPath: loaded.manifestPath,
		},
		trigger: {
			id: trigger.id,
			kind: trigger.kind,
			responsibilityId: trigger.responsibilityId,
			reason: trigger.reason,
			...(trigger.cron === undefined ? {} : { cron: trigger.cron }),
			...(trigger.timezone === undefined ? {} : { timezone: trigger.timezone }),
			...(trigger.method === undefined ? {} : { method: trigger.method }),
			...(trigger.path === undefined ? {} : { path: trigger.path }),
		},
		activation: {
			id: activation.id,
			attemptId,
			kind: activation.kind,
			responsibilityId: activation.responsibilityId,
			reason: activation.reason,
			...(activation.targetName === undefined ? {} : { targetName: activation.targetName }),
			sourcePath,
			...(activation.formeManifestId === undefined ? {} : { formeManifestId: activation.formeManifestId }),
		},
		responsibility: {
			id: responsibility.id,
			sourcePath: responsibility.sourcePath,
			goal: responsibility.goal,
			continuity: responsibility.continuity,
			criteria: responsibility.criteria,
			constraints: responsibility.constraints,
			tools: responsibility.tools,
			fingerprint: responsibilityFingerprint,
			...(responsibility.fulfillment === undefined ? {} : { fulfillment: responsibility.fulfillment }),
		},
		event: {
			triggerId: event.triggerId,
			...(event.payload === undefined ? {} : { payload: event.payload }),
		},
		...(statusPaths === undefined
			? {}
			: {
					status: {
						kind: "openprose.responsibility-status-output",
						latestPath: statusPaths.latestPath,
						statusLogPath: statusPaths.statusLogPath,
						responsibilityFingerprint,
					},
				}),
		...(pressure === undefined ? {} : { pressure }),
	};
	const payloadJson = JSON.stringify(payload);
	const argv = [sourcePath, "--activation-context", payloadJson];

	return {
		activationId: activation.id,
		sourcePath,
		argv,
		prompt: canonicalPrompt("run", argv),
		payload,
		env: {
			PROSE_OPENPROSE_ROOT: loaded.openProseRoot.absolutePath,
			PROSE_REPOSITORY_IR_PATH: loaded.manifestPath,
			PROSE_REPOSITORY_IR_VERSION: String(manifest.version),
			PROSE_ACTIVATION_ID: activation.id,
			PROSE_ACTIVATION_ATTEMPT_ID: attemptId,
			PROSE_ACTIVATION_CONTEXT: payloadJson,
			...(fulfillmentArtifactPath === undefined
				? {}
				: {
						[PROSE_FULFILLMENT_ARTIFACT_PATH_ENV]: fulfillmentArtifactPath,
					}),
			...(statusPaths === undefined
				? {}
				: {
						PROSE_RESPONSIBILITY_ID: responsibility.id,
						PROSE_RESPONSIBILITY_FINGERPRINT: responsibilityFingerprint,
						PROSE_RESPONSIBILITY_STATUS_LATEST: statusPaths.absoluteLatestPath,
						PROSE_RESPONSIBILITY_STATUS_LOG: statusPaths.absoluteStatusLogPath,
					}),
			...(pressure === undefined
				? {}
				: {
						PROSE_PRESSURE_ID: pressure.pressureId,
						PROSE_PRESSURE_DEDUPE_KEY: pressure.dedupeKey,
					}),
		},
	};
}

function buildFulfillmentArtifactPath(
	activation: RepositoryIrActivationIntent,
	attemptId: string,
): string | undefined {
	if (activation.kind === "judge") {
		return undefined;
	}
	return `runs/${attemptId}/fulfillment-artifact.json`;
}

export function buildPressureFromStatus(options: {
	manifest: RepositoryIrV0;
	status: ResponsibilityStatusRecord;
	recordedAt?: string;
}): ResponsibilityPressureRecord | undefined {
	const { manifest, status } = options;
	const responsibility = manifest.responsibilities.find((candidate) => candidate.id === status.responsibilityId);
	if (responsibility === undefined) {
		throw new RepositoryServeError(`Status references unknown responsibility '${status.responsibilityId}'.`);
	}
	if (fingerprintResponsibility(responsibility) !== status.responsibilityFingerprint) {
		throw new RepositoryServeError(`Status for responsibility '${status.responsibilityId}' is stale.`);
	}
	if (status.status === "up") {
		return undefined;
	}

	const activation = selectPressureActivation(manifest, {
		responsibilityId: status.responsibilityId,
		status: status.status,
	});
	if (activation === undefined) {
		throw new RepositoryServeError(
			`Responsibility '${status.responsibilityId}' has unhealthy status but no fulfillment, retry, or escalation activation.`,
		);
	}

	return buildResponsibilityPressureRecord({
		status,
		recommendedActivationKind: activation.kind as ResponsibilityPressureActivationKind,
		activationId: activation.id,
		reason: `Responsibility status is ${status.status}; activate '${activation.id}' to reconcile it.`,
		...(options.recordedAt === undefined ? {} : { recordedAt: options.recordedAt }),
	});
}

export function resolveActivationForPressure(
	manifest: RepositoryIrV0,
	pressure: ResponsibilityPressureRecord,
): RepositoryServeResolvedActivation {
	const activation = selectPressureActivation(manifest, {
		responsibilityId: pressure.responsibilityId,
		status: pressure.status,
		recommendedActivationKind: pressure.recommendedActivationKind,
		...(pressure.activationId === undefined ? {} : { activationId: pressure.activationId }),
	});
	if (activation === undefined) {
		throw new RepositoryServeError(
			`Pressure '${pressure.pressureId}' references no runnable activation for responsibility '${pressure.responsibilityId}'.`,
		);
	}

	return {
		trigger: {
			id: `${pressure.responsibilityId}.pressure`,
			responsibilityId: pressure.responsibilityId,
			kind: "manual",
			reason: `Responsibility pressure requested ${pressure.recommendedActivationKind}.`,
		},
		activation,
	};
}

export function buildPressureActivationRunRequest(options: {
	loaded: RepositoryServeLoadedIr;
	pressure: ResponsibilityPressureRecord;
}): RepositoryServeActivationRunRequest {
	const resolved = resolveActivationForPressure(options.loaded.manifest, options.pressure);
	return buildActivationRunRequest({
		loaded: options.loaded,
		event: {
			triggerId: resolved.trigger.id,
			payload: {
				kind: "openprose.pressure-event",
				pressure: options.pressure,
			},
		},
		resolved,
		pressure: options.pressure,
	});
}

export async function recordPressureFromStatus(options: {
	loaded: RepositoryServeLoadedIr;
	status: ResponsibilityStatusRecord;
	recordedAt?: string;
}): Promise<ResponsibilityPressureRecordResult | undefined> {
	const pressure = buildPressureFromStatus({
		manifest: options.loaded.manifest,
		status: options.status,
		...(options.recordedAt === undefined ? {} : { recordedAt: options.recordedAt }),
	});
	if (pressure === undefined) {
		return undefined;
	}

	return recordResponsibilityPressure({
		openProseRoot: options.loaded.openProseRoot,
		record: pressure,
	});
}

async function launchPressureActivationOnce(options: {
	loaded: RepositoryServeLoadedIr;
	pressure: ResponsibilityPressureRecord;
	request: RepositoryServeActivationRunRequest;
	run: Omit<LaunchActivationRunOptions, "cwd"> & { cwd?: string };
	cwd: string;
	reclaimIncomplete?: boolean;
}): Promise<RepositoryServeActivationResult | undefined> {
	const claim = await claimResponsibilityPressureDispatch({
		openProseRoot: options.loaded.openProseRoot,
		pressure: options.pressure,
		activationId: options.request.activationId,
		...(options.reclaimIncomplete === undefined ? {} : { reclaimIncomplete: options.reclaimIncomplete }),
	});
	if (!claim.claimed) {
		return undefined;
	}

	const startedClaim = await startResponsibilityPressureDispatchEffect({ claim });
	const exitCode = await launchActivationRun(options.request, {
		...options.run,
		cwd: options.cwd,
	});
	await completeResponsibilityPressureDispatch({
		claim: startedClaim,
		exitCode,
	});

	return {
		activationId: options.request.activationId,
		exitCode,
		source: "pressure",
	};
}

function selectPressureActivation(
	manifest: RepositoryIrV0,
	options: {
		responsibilityId: string;
		status: ResponsibilityPressureRecord["status"];
		recommendedActivationKind?: ResponsibilityPressureActivationKind;
		activationId?: string;
	},
): RepositoryIrActivationIntent | undefined {
	const candidates = manifest.activations.filter(
		(activation) =>
			activation.responsibilityId === options.responsibilityId &&
			(activation.kind === "fulfillment" || activation.kind === "retry" || activation.kind === "escalation"),
	);

	if (options.activationId !== undefined) {
		return candidates.find(
			(activation) =>
				activation.id === options.activationId &&
				(options.recommendedActivationKind === undefined || activation.kind === options.recommendedActivationKind),
		);
	}

	const preferences: readonly ResponsibilityPressureActivationKind[] =
		options.recommendedActivationKind === undefined
			? pressureActivationPreferences(options.status)
			: [options.recommendedActivationKind];

	for (const kind of preferences) {
		const activation = candidates.find((candidate) => candidate.kind === kind);
		if (activation !== undefined) {
			return activation;
		}
	}

	return undefined;
}

function pressureActivationPreferences(
	status: ResponsibilityPressureRecord["status"],
): readonly ResponsibilityPressureActivationKind[] {
	if (status === "blocked") {
		return ["escalation", "fulfillment", "retry"];
	}
	return ["fulfillment", "retry", "escalation"];
}

function adapterForTriggerKind(kind: RepositoryIrTriggerKind): RepositoryServeTriggerRegistration["adapter"] {
	if (kind === "cron") {
		return "timer";
	}
	if (kind === "http") {
		return "http";
	}
	return kind;
}

function findTriggerForEvent(manifest: RepositoryIrV0, event: RepositoryServeEvent): RepositoryIrTrigger {
	const trigger = manifest.triggers.find((candidate) => candidate.id === event.triggerId);
	if (trigger === undefined) {
		throw new RepositoryServeError(`Unknown trigger '${event.triggerId}'.`);
	}
	return trigger;
}

function validateActivationPressure(options: {
	activation: RepositoryIrActivationIntent;
	pressure?: ResponsibilityPressureRecord;
	responsibilityFingerprint: string;
}): void {
	const { activation, pressure, responsibilityFingerprint } = options;
	if (pressure === undefined) {
		return;
	}
	if (pressure.responsibilityId !== activation.responsibilityId) {
		throw new RepositoryServeError(`Pressure '${pressure.pressureId}' targets a different responsibility.`);
	}
	if (pressure.activationId !== undefined && pressure.activationId !== activation.id) {
		throw new RepositoryServeError(`Pressure '${pressure.pressureId}' targets a different activation.`);
	}
	if (pressure.recommendedActivationKind !== activation.kind) {
		throw new RepositoryServeError(`Pressure '${pressure.pressureId}' targets a different activation kind.`);
	}
	if (pressure.responsibilityFingerprint !== responsibilityFingerprint) {
		throw new RepositoryServeError(`Pressure '${pressure.pressureId}' is stale for the active responsibility.`);
	}
}

export async function launchActivationRun(
	request: RepositoryServeActivationRunRequest,
	options: LaunchActivationRunOptions,
): Promise<number> {
	return options.commandRunner({
		command: "run",
		argv: request.argv,
		cwd: options.cwd,
		env: { ...options.env, ...request.env },
		stdout: options.stdout,
		stderr: options.stderr,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
}

export function formatRepositoryServeSummary(summary: RepositoryServeSummary): string {
	const { manifest } = summary.loaded;
	const lines = [
		`OpenProse serve loaded ${summary.loaded.manifestPath}`,
		`OpenProse root: ${summary.loaded.openProseRoot.path}`,
		`IR: ${manifest.kind} v${manifest.version}`,
		`Sources: ${manifest.sources.length}`,
		`Responsibilities: ${manifest.responsibilities.length}`,
		`Triggers: ${summary.registrations.length}`,
	];

	for (const registration of summary.registrations) {
		const activations =
			registration.activationIds.length === 0 ? "none" : registration.activationIds.join(", ");
		lines.push(`- ${registration.triggerId} [${formatTriggerRegistration(registration)}] -> ${activations}`);
	}

	return lines.join("\n");
}

export function formatTriggerRegistration(registration: RepositoryServeTriggerRegistration): string {
	if (registration.kind === "cron" && registration.cron !== undefined) {
		const timezone = registration.timezone === undefined ? "" : ` ${registration.timezone}`;
		return `cron ${registration.cron}${timezone}`;
	}
	if (registration.kind === "http" && registration.method !== undefined && registration.path !== undefined) {
		return `http ${registration.method.toUpperCase()} ${registration.path}`;
	}
	return registration.kind;
}

async function readLatestStatusForJudgeRequest(
	request: RepositoryServeActivationRunRequest,
	previousStatusText?: string,
): Promise<ResponsibilityStatusRecord> {
	const statusPath = request.env.PROSE_RESPONSIBILITY_STATUS_LATEST;
	if (statusPath === undefined) {
		throw new RepositoryServeError(`Judge activation '${request.activationId}' did not declare a status output path.`);
	}

	let text: string;
	try {
		text = await readFile(statusPath, "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new RepositoryServeError(`Judge activation '${request.activationId}' did not write latest status: ${message}`);
	}
	if (previousStatusText !== undefined && text === previousStatusText) {
		throw new RepositoryServeError(`Judge activation '${request.activationId}' did not refresh latest status.`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new RepositoryServeError(`Judge activation '${request.activationId}' wrote invalid status JSON: ${message}`);
	}

	const validation = validateResponsibilityStatusRecord(parsed);
	if (!validation.valid) {
		throw new RepositoryServeError(
			`Judge activation '${request.activationId}' wrote invalid responsibility status.`,
			validation.errors,
		);
	}

	validateJudgeStatusBelongsToRequest(request, parsed as ResponsibilityStatusRecord);
	return parsed as ResponsibilityStatusRecord;
}

async function readLatestStatusText(request: RepositoryServeActivationRunRequest): Promise<string | undefined> {
	const statusPath = request.env.PROSE_RESPONSIBILITY_STATUS_LATEST;
	if (statusPath === undefined) {
		return undefined;
	}
	try {
		return await readFile(statusPath, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return undefined;
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new RepositoryServeError(`Unable to inspect latest status for '${request.activationId}': ${message}`);
	}
}

function validateJudgeStatusBelongsToRequest(
	request: RepositoryServeActivationRunRequest,
	status: ResponsibilityStatusRecord,
): void {
	if (status.responsibilityId !== request.payload.responsibility.id) {
		throw new RepositoryServeError(`Judge activation '${request.activationId}' wrote status for a different responsibility.`);
	}
	if (status.responsibilityFingerprint !== request.payload.responsibility.fingerprint) {
		throw new RepositoryServeError(`Judge activation '${request.activationId}' wrote stale responsibility status.`);
	}
	if (status.source.activationId !== request.activationId) {
		throw new RepositoryServeError(`Judge activation '${request.activationId}' wrote status for a different activation.`);
	}
	if (status.source.attemptId !== request.payload.activation.attemptId) {
		throw new RepositoryServeError(`Judge activation '${request.activationId}' wrote status for a different activation attempt.`);
	}
	if (status.source.triggerId !== request.payload.trigger.id) {
		throw new RepositoryServeError(`Judge activation '${request.activationId}' wrote status for a different trigger.`);
	}
	if (
		status.source.manifestPath !== request.payload.ir.manifestPath ||
		status.source.irVersion !== request.payload.ir.version
	) {
		throw new RepositoryServeError(`Judge activation '${request.activationId}' wrote status for a different IR.`);
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
