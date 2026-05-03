import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WritableStreamLike } from "../harnesses/types.js";
import { canonicalPrompt } from "./command-model.js";
import {
	ACTIVE_REPOSITORY_IR_PATH,
	REPOSITORY_IR_KIND,
	type RepositoryIrActivationIntent,
	type RepositoryIrTriggerIntent,
	type RepositoryIrTriggerIntentKind,
	type RepositoryIrV0,
	validateRepositoryIr,
} from "./repository-ir.js";
import { resolveOpenProseRoot, type OpenProseRoot } from "./openprose-root.js";

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
	kind: RepositoryIrTriggerIntentKind;
	reason: string;
	activationIds: string[];
	adapter: "static";
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
	trigger: RepositoryIrTriggerIntent;
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
		kind: RepositoryIrTriggerIntentKind;
		responsibilityId: string;
		reason: string;
	};
	activation: {
		id: string;
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
	};
	event: {
		triggerId: string;
		payload?: unknown;
	};
}

export interface RepositoryServeActivationRunRequest {
	activationId: string;
	sourcePath: string;
	argv: string[];
	prompt: string;
	payload: RepositoryServeActivationPayload;
	env: Record<string, string>;
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

export async function prepareStaticRepositoryServe(
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
		adapter: "static",
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

export function buildActivationRunRequest(options: {
	loaded: RepositoryServeLoadedIr;
	event: RepositoryServeEvent;
	resolved: RepositoryServeResolvedActivation;
}): RepositoryServeActivationRunRequest {
	const { loaded, event, resolved } = options;
	const { manifest } = loaded;
	const { activation, trigger } = resolved;

	if (activation.sourcePath === undefined) {
		if (activation.kind !== "judge") {
			throw new RepositoryServeError(`Activation '${activation.id}' does not declare a runnable sourcePath.`);
		}
		throw new RepositoryServeError(
			`Activation '${activation.id}' does not declare a runnable sourcePath; generated judge runs are introduced in a later phase.`,
		);
	}

	const responsibility = manifest.responsibilities.find((candidate) => candidate.id === activation.responsibilityId);
	if (responsibility === undefined) {
		throw new RepositoryServeError(`Activation '${activation.id}' references an unknown responsibility.`);
	}

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
		},
		activation: {
			id: activation.id,
			kind: activation.kind,
			responsibilityId: activation.responsibilityId,
			reason: activation.reason,
			...(activation.targetName === undefined ? {} : { targetName: activation.targetName }),
			...(activation.sourcePath === undefined ? {} : { sourcePath: activation.sourcePath }),
			...(activation.formeManifestId === undefined ? {} : { formeManifestId: activation.formeManifestId }),
		},
		responsibility: {
			id: responsibility.id,
			sourcePath: responsibility.sourcePath,
			goal: responsibility.goal,
		},
		event: {
			triggerId: event.triggerId,
			...(event.payload === undefined ? {} : { payload: event.payload }),
		},
	};
	const payloadJson = JSON.stringify(payload);
	const argv = [activation.sourcePath, "--activation-context", payloadJson];

	return {
		activationId: activation.id,
		sourcePath: activation.sourcePath,
		argv,
		prompt: canonicalPrompt("run", argv),
		payload,
		env: {
			PROSE_OPENPROSE_ROOT: loaded.openProseRoot.absolutePath,
			PROSE_REPOSITORY_IR_PATH: loaded.manifestPath,
			PROSE_REPOSITORY_IR_VERSION: String(manifest.version),
			PROSE_ACTIVATION_ID: activation.id,
			PROSE_ACTIVATION_CONTEXT: payloadJson,
		},
	};
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

export function formatStaticRepositoryServe(summary: RepositoryServeSummary): string {
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
		lines.push(`- ${registration.triggerId} [${registration.kind}] -> ${activations}`);
	}

	lines.push("Live trigger adapters are not enabled in this phase.");
	return lines.join("\n");
}
