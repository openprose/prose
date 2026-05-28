import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { constants as osConstants } from "node:os";
import { dirname, join } from "node:path";

import type { JsonObject, JsonValue } from "../types.js";
import { createDockerIsolationPlan, type DockerIsolationPlanOptions } from "./docker-substrate.js";
import { readKernelEffects, reconcileKernelEffects } from "./effect-log.js";
import { readProxyModelCallRecords, type ProxyModelCallRecord } from "./egress-proxy.js";
import type { IsolationSubstratePlan, KernelEffectLogEntry, KernelEffectReconciliation } from "./types.js";

const DEFAULT_HARNESS_SERVICE_NAME = "harness";
const DEFAULT_COMPOSE_FILE_NAME = "compose.yaml";
const SAFE_COMPOSE_PROJECT_NAME = /^[a-z][a-z0-9-]{0,62}$/;

export interface DockerComposeRunner {
	run(args: readonly string[], options: DockerComposeRunOptions): Promise<DockerComposeRunResult>;
}

export interface DockerComposeRunOptions {
	cwd: string;
	env?: Readonly<Record<string, string | undefined>>;
	signal?: AbortSignal;
	stderr?: NodeJS.WritableStream;
	stdout?: NodeJS.WritableStream;
}

export interface DockerComposeRunResult {
	exitCode: number;
}

export interface DockerComposeCommandRunnerOptions {
	args?: readonly string[];
	command?: string;
}

export interface DockerIsolationLiveRunnerOptions extends DockerIsolationPlanOptions {
	allowedActionCids?: Iterable<string>;
	cleanup?: boolean;
	composeEnv?: Readonly<Record<string, string | undefined>>;
	composeFilePath?: string;
	composeProjectName?: string;
	composeRunner?: DockerComposeRunner;
	signal?: AbortSignal;
	stderr?: NodeJS.WritableStream;
	stdout?: NodeJS.WritableStream;
}

export interface DockerIsolationLiveRunResult {
	composeFilePath: string;
	composeProjectName: string;
	effectReconciliation: KernelEffectReconciliation;
	effects: readonly KernelEffectLogEntry[];
	exitCode: number;
	failureReasons: readonly string[];
	modelCalls: readonly ProxyModelCallRecord[];
	plan: IsolationSubstratePlan;
	status: "passed" | "failed";
	up: DockerComposeRunResult;
	down?: DockerComposeRunResult;
}

export const dockerComposeRunner: DockerComposeRunner = createDockerComposeCommandRunner();

export function createDockerComposeCommandRunner(options: DockerComposeCommandRunnerOptions = {}): DockerComposeRunner {
	const command = options.command ?? "docker";
	const baseArgs = options.args ?? ["compose"];

	return {
		run: (args, runOptions) => runProcess(command, [...baseArgs, ...args], runOptions),
	};
}

export async function runDockerIsolation(options: DockerIsolationLiveRunnerOptions): Promise<DockerIsolationLiveRunResult> {
	const plan = createDockerIsolationPlan(options);
	const composeRunner = options.composeRunner ?? dockerComposeRunner;
	const composeFilePath = options.composeFilePath ?? join(dirname(plan.effectLogPath), DEFAULT_COMPOSE_FILE_NAME);
	const composeProjectName = assertSafeComposeProjectName(
		options.composeProjectName ?? defaultComposeProjectName(plan.identity),
		"composeProjectName",
	);
	const harnessServiceName = options.harnessServiceName ?? DEFAULT_HARNESS_SERVICE_NAME;

	await mkdir(dirname(plan.effectLogPath), { recursive: true });
	await mkdir(dirname(plan.modelCallLogPath), { recursive: true });
	await mkdir(dirname(composeFilePath), { recursive: true });
	await writeFile(composeFilePath, stringifyComposeYaml(plan.compose), "utf8");

	const composePrefix = ["--project-name", composeProjectName, "-f", composeFilePath];
	const runOptions = composeRunOptions(options, dirname(composeFilePath));
	let up: DockerComposeRunResult | undefined;
	let down: DockerComposeRunResult | undefined;
	let upError: unknown;
	let downError: unknown;

	try {
		up = await composeRunner.run(
			[...composePrefix, "up", "--abort-on-container-exit", "--exit-code-from", harnessServiceName],
			runOptions,
		);
	} catch (error) {
		upError = error;
	} finally {
		if (options.cleanup ?? true) {
			try {
				down = await composeRunner.run([...composePrefix, "down", "--volumes", "--remove-orphans"], runOptions);
			} catch (error) {
				downError = error;
			}
		}
	}

	if (upError !== undefined) {
		throw upError;
	}
	if (downError !== undefined) {
		throw downError;
	}
	if (up === undefined) {
		throw new Error("docker compose up did not produce a result");
	}

	const modelCalls = readProxyModelCallRecords(plan.modelCallLogPath);
	const effects = readKernelEffects(plan.effectLogPath);
	const effectReconciliation = reconcileKernelEffects(effects, options.allowedActionCids ?? []);
	const failureReasons = failureReasonsFor(up.exitCode, effectReconciliation);
	const status = failureReasons.length === 0 ? "passed" : "failed";
	const exitCode = up.exitCode === 0 && status === "failed" ? 1 : up.exitCode;

	return {
		composeFilePath,
		composeProjectName,
		effectReconciliation,
		effects,
		exitCode,
		failureReasons,
		modelCalls,
		plan,
		status,
		up,
		...(down === undefined ? {} : { down }),
	};
}

function composeRunOptions(
	options: DockerIsolationLiveRunnerOptions,
	cwd: string,
): DockerComposeRunOptions {
	return {
		cwd,
		...(options.composeEnv === undefined ? {} : { env: options.composeEnv }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
		...(options.stderr === undefined ? {} : { stderr: options.stderr }),
		...(options.stdout === undefined ? {} : { stdout: options.stdout }),
	};
}

function runProcess(command: string, args: readonly string[], options: DockerComposeRunOptions): Promise<DockerComposeRunResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, [...args], {
			cwd: options.cwd,
			env: mergeEnv(options.env),
			stdio: ["ignore", "pipe", "pipe"],
		});

		let settled = false;
		const abort = () => {
			const signal = toNodeSignal(options.signal?.reason) ?? "SIGTERM";
			if (!child.killed) {
				child.kill(signal);
			}
		};

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			options.stdout?.write(chunk);
		});
		child.stderr.on("data", (chunk: string) => {
			options.stderr?.write(chunk);
		});

		if (options.signal?.aborted) {
			abort();
		} else {
			options.signal?.addEventListener("abort", abort, { once: true });
		}

		child.on("error", (error) => {
			if (!settled) {
				settled = true;
				options.signal?.removeEventListener("abort", abort);
				reject(error);
			}
		});
		child.on("close", (exitCode, signal) => {
			if (settled) {
				return;
			}
			settled = true;
			options.signal?.removeEventListener("abort", abort);
			resolve({ exitCode: exitCode ?? exitCodeForSignal(signal) });
		});
	});
}

function mergeEnv(env: Readonly<Record<string, string | undefined>> | undefined): NodeJS.ProcessEnv {
	if (env === undefined) {
		return process.env;
	}

	const merged: NodeJS.ProcessEnv = { ...process.env };
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) {
			delete merged[key];
		} else {
			merged[key] = value;
		}
	}

	return merged;
}

function failureReasonsFor(exitCode: number, reconciliation: KernelEffectReconciliation): readonly string[] {
	const reasons: string[] = [];
	if (exitCode !== 0) {
		reasons.push(`docker compose up exited with code ${exitCode}`);
	}
	if (reconciliation.unreconciled.length > 0) {
		reasons.push(`unreconciled kernel effects: ${reconciliation.unreconciled.length}`);
	}

	return reasons;
}

function defaultComposeProjectName(identity: IsolationSubstratePlan["identity"]): string {
	const digest = createHash("sha256")
		.update(`${identity.runId}\0${identity.caseId}\0${identity.attemptId}\0${identity.adapterName}`)
		.digest("hex")
		.slice(0, 12);
	const slug = `${identity.adapterName}-${identity.runId}-${identity.caseId}`
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-+/g, "-");
	const prefix = slug.length === 0 || !/^[a-z]/.test(slug) ? "prose-eval" : `prose-${slug}`;
	const truncated = prefix.slice(0, Math.max(1, 62 - digest.length)).replace(/-+$/g, "");

	return assertSafeComposeProjectName(`${truncated}-${digest}`, "composeProjectName");
}

function assertSafeComposeProjectName(value: string, path: string): string {
	if (!SAFE_COMPOSE_PROJECT_NAME.test(value)) {
		throw new Error(`${path} must be a safe Docker Compose project name: ${value}`);
	}

	return value;
}

function stringifyComposeYaml(compose: JsonObject): string {
	return `${yamlLines(compose, 0).join("\n")}\n`;
}

function yamlLines(value: JsonValue, indent: number): string[] {
	const spaces = " ".repeat(indent);
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return [`${spaces}[]`];
		}

		return value.flatMap((item) => {
			if (isInlineYamlValue(item)) {
				return [`${spaces}- ${inlineYamlValue(item)}`];
			}

			return [`${spaces}-`, ...yamlLines(item, indent + 2)];
		});
	}

	if (isJsonObject(value)) {
		const entries = Object.entries(value);
		if (entries.length === 0) {
			return [`${spaces}{}`];
		}

		return entries.flatMap(([key, child]) => {
			if (isInlineYamlValue(child)) {
				return [`${spaces}${yamlKey(key)}: ${inlineYamlValue(child)}`];
			}

			return [`${spaces}${yamlKey(key)}:`, ...yamlLines(child, indent + 2)];
		});
	}

	return [`${spaces}${inlineYamlValue(value)}`];
}

function isInlineYamlValue(value: JsonValue): boolean {
	return (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		(Array.isArray(value) && value.length === 0) ||
		(isJsonObject(value) && Object.keys(value).length === 0)
	);
}

function inlineYamlValue(value: JsonValue): string {
	if (Array.isArray(value)) {
		return "[]";
	}
	if (isJsonObject(value)) {
		return "{}";
	}

	return JSON.stringify(value);
}

function yamlKey(key: string): string {
	return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function isJsonObject(value: JsonValue): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exitCodeForSignal(signal: NodeJS.Signals | null): number {
	if (signal === null) {
		return 1;
	}

	const signalNumber = (osConstants.signals as Record<string, number | undefined>)[signal];
	return signalNumber === undefined ? 1 : 128 + signalNumber;
}

function toNodeSignal(value: unknown): NodeJS.Signals | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	return value in osConstants.signals ? (value as NodeJS.Signals) : undefined;
}
