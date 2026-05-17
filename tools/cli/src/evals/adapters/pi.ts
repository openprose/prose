import { spawn } from "node:child_process";
import { join } from "node:path";

import type { ProcessCommand, ProcessRunner } from "../../harnesses/types.js";
import type {
	EvalAdapter,
	EvalAdapterContext,
	EvalAttemptResult,
	EvalCostRecord,
	EvalEvent,
	EvalTask,
	JsonObject,
	JsonValue,
} from "../types.js";
import { DEFAULT_EVAL_OUTPUT_CHAR_LIMIT, sanitizeJsonValue, sanitizeText } from "../safety.js";
import { mergeEvalEnvWithProtectedIsolation, redactionValuesFromProcessEnv } from "./env.js";
import { createProcessEvalAdapter } from "./process.js";

export const DEFAULT_PI_PACKAGE_SPEC = "@earendil-works/pi-coding-agent@0.75.0";

export type PiEvalAdapterMode = "rpc" | "print" | "json";

export interface PiEvalAdapterOptions {
	binary?: string;
	env?: Record<string, string | undefined>;
	isolateResources?: boolean;
	launcher?: "npx" | "binary";
	mode?: PiEvalAdapterMode;
	model?: string;
	name?: string;
	maxOutputChars?: number;
	packageSpec?: string;
	provider?: string;
	runner?: ProcessRunner;
	rpcRunner?: PiRpcRunner;
	thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	tools?: readonly string[];
	writeTranscript?: boolean;
}

export interface PiRpcRunOptions {
	context: EvalAdapterContext;
	cwd?: string;
	env?: Record<string, string | undefined>;
	prompt: string;
	signal?: AbortSignal;
	task: EvalTask;
	maxOutputChars?: number;
}

export interface PiRpcRunResult {
	exitCode: number;
	records: readonly JsonObject[];
	stderr: string;
	stdout: string;
	lastAssistantText?: string;
	sessionStats?: JsonObject;
}

export type PiRpcRunner = (command: string, args: readonly string[], options: PiRpcRunOptions) => Promise<PiRpcRunResult>;

export function createPiEvalAdapter(options: PiEvalAdapterOptions = {}): EvalAdapter {
	if ((options.mode ?? "rpc") !== "rpc") {
		return createProcessEvalAdapter({
			name: options.name ?? "pi",
			...(options.env === undefined ? {} : { env: options.env }),
			...(options.runner === undefined ? {} : { runner: options.runner }),
			buildCommand: (task) => buildPiCommand(task, options),
			buildEnv: (_task, context) => buildPiEnv(context),
		});
	}

	const name = options.name ?? "pi";
	const rpcRunner = options.rpcRunner ?? nodePiRpcRunner;

	return {
		name,
		async runTask(task, context) {
			const started = Date.now();
			const command = buildPiCommand(task, { ...options, mode: "rpc" });
			const buildEnv = buildPiEnv(context);
			const env = mergeEvalEnvWithProtectedIsolation([buildEnv, options.env, context.env], buildEnv) ?? {};
			const maxOutputChars = options.maxOutputChars ?? DEFAULT_EVAL_OUTPUT_CHAR_LIMIT;
			const redactionValues = redactionValuesFromProcessEnv(env);
			const cwd = task.cwd ?? context.adapterRunDirectory;
			const result = await rpcRunner(command.command, command.args, {
				...(cwd === undefined ? {} : { cwd }),
				env,
				maxOutputChars,
				...(context.signal === undefined ? {} : { signal: context.signal }),
				context,
				prompt: task.prompt,
				task,
			});

			const records = result.records.map((record) => sanitizeJsonValue(record, redactionValues, maxOutputChars) as JsonObject);
			const stderr = sanitizeText(result.stderr, redactionValues, maxOutputChars);
			const events = piRecordsToEvents(records);
			const sessionStats =
				result.sessionStats === undefined
					? undefined
					: (sanitizeJsonValue(result.sessionStats, redactionValues, maxOutputChars) as JsonObject);
			const costs = sessionStats === undefined ? [] : piStatsToCosts(sessionStats, name, task, context);
			const stdout = sanitizeText(
				result.lastAssistantText ?? collectAssistantText(records) ?? result.stdout,
				redactionValues,
				maxOutputChars,
			);
			const artifacts =
				options.writeTranscript === false || context.artifactStore === undefined
					? []
					: [
							await context.artifactStore.writeJson(`${context.runId}/${task.id}/${name}/rpc-transcript.json`, {
								records,
								stderr,
							}),
						];

			return {
				adapterName: name,
				durationMs: Date.now() - started,
				exitCode: result.exitCode,
				stdout,
				stderr,
				...(artifacts.length === 0 ? {} : { artifacts }),
				...(costs.length === 0 ? {} : { costs }),
				...(events.length === 0 ? {} : { events }),
			};
		},
	};
}

export function createPiPrintEvalAdapter(options: PiEvalAdapterOptions = {}): EvalAdapter {
	return createProcessEvalAdapter({
		name: options.name ?? "pi",
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.runner === undefined ? {} : { runner: options.runner }),
		buildCommand: (task) => buildPiCommand(task, { ...options, mode: options.mode ?? "print" }),
		buildEnv: (_task, context) => buildPiEnv(context),
	});
}

export function buildPiCommand(task: EvalTask, options: PiEvalAdapterOptions = {}): ProcessCommand {
	const launcher = options.launcher ?? "npx";
	const piArgs = buildPiArgs(task, options);

	if (launcher === "binary") {
		return {
			command: options.binary ?? "pi",
			args: piArgs,
		};
	}

	return {
		command: options.binary ?? "npx",
		args: ["-y", options.packageSpec ?? DEFAULT_PI_PACKAGE_SPEC, ...piArgs],
	};
}

function buildPiArgs(task: EvalTask, options: PiEvalAdapterOptions): string[] {
	const args: string[] = [];
	if (options.provider !== undefined) {
		args.push("--provider", options.provider);
	}
	if (options.model !== undefined) {
		args.push("--model", options.model);
	}
	if (options.thinking !== undefined) {
		args.push("--thinking", options.thinking);
	}
	if (options.tools !== undefined && options.tools.length > 0) {
		args.push("--tools", options.tools.join(","));
	}

	if (options.isolateResources ?? true) {
		args.push("--no-session", "--no-context-files", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes");
	}

	const mode = options.mode ?? "rpc";
	if (mode === "rpc") {
		args.push("--mode", "rpc");
	} else if (mode === "json") {
		args.push("--mode", "json", task.prompt);
	} else {
		args.push("-p", task.prompt);
	}

	return args;
}

function buildPiEnv(context: EvalAdapterContext): Record<string, string | undefined> {
	const root = context.adapterRunDirectory;
	return {
		PI_OFFLINE: "1",
		PI_SKIP_VERSION_CHECK: "1",
		PI_TELEMETRY: "0",
		...(root === undefined
			? {}
			: {
					PI_CODING_AGENT_DIR: join(root, "pi-agent"),
					PI_CODING_AGENT_SESSION_DIR: join(root, "pi-sessions"),
				}),
	};
}

async function nodePiRpcRunner(command: string, args: readonly string[], options: PiRpcRunOptions): Promise<PiRpcRunResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, [...args], {
			cwd: options.cwd,
			env: options.env ? { ...process.env, ...options.env } : process.env,
			stdio: ["pipe", "pipe", "pipe"],
		});

		const records: JsonObject[] = [];
		let stdout = "";
		let stderr = "";
		let buffer = "";
		let lastAssistantText: string | undefined;
		let sessionStats: JsonObject | undefined;
		let postAgentEndRequestsSent = false;
		let settled = false;
		let intentionalShutdown = false;
		let aborted = false;
		const maxOutputChars = options.maxOutputChars ?? DEFAULT_EVAL_OUTPUT_CHAR_LIMIT;

		const promptRequestId = `${options.context.attemptId}:prompt`;
		const lastAssistantRequestId = `${options.context.attemptId}:last-assistant`;
		const statsRequestId = `${options.context.attemptId}:stats`;

		const abort = () => {
			aborted = true;
			if (!child.killed) {
				child.kill("SIGTERM");
			}
		};

		const writeRecord = (record: JsonObject) => {
			child.stdin.write(`${JSON.stringify(record)}\n`);
		};

		const finishIfPostRequestsComplete = () => {
			if (lastAssistantText !== undefined && sessionStats !== undefined && !child.killed) {
				intentionalShutdown = true;
				child.stdin.end();
				child.kill("SIGTERM");
			}
		};

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout = appendLimited(stdout, chunk, maxOutputChars);
			buffer = appendLimited(buffer, chunk, maxOutputChars);
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed === "") {
					continue;
				}
				const record = parseJsonObject(trimmed);
				if (record === undefined) {
					continue;
				}
				records.push(record);
				const id = stringField(record, "id");
				const type = stringField(record, "type");

				if (id === lastAssistantRequestId) {
					lastAssistantText = textFromRpcRecord(record) ?? lastAssistantText;
					finishIfPostRequestsComplete();
				} else if (id === statsRequestId) {
					sessionStats = objectFromRpcRecord(record) ?? record;
					finishIfPostRequestsComplete();
				} else if (type === "agent_end" && !postAgentEndRequestsSent) {
					postAgentEndRequestsSent = true;
					writeRecord({ id: lastAssistantRequestId, type: "get_last_assistant_text" });
					writeRecord({ id: statsRequestId, type: "get_session_stats" });
				}
			}
		});
		child.stderr.on("data", (chunk: string) => {
			stderr = appendLimited(stderr, chunk, maxOutputChars);
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
		child.on("spawn", () => {
			writeRecord({ id: promptRequestId, type: "prompt", message: options.prompt });
		});
		child.on("close", (exitCode, signal) => {
			if (settled) {
				return;
			}
			settled = true;
			options.signal?.removeEventListener("abort", abort);
			const resolvedExitCode = exitCode ?? (intentionalShutdown ? 0 : exitCodeForSignal(signal));
			resolve({
				exitCode: resolvedExitCode,
				records,
				stderr: aborted && stderr.trim() === "" ? "Pi RPC run aborted.\n" : stderr,
				stdout,
				...(lastAssistantText === undefined ? {} : { lastAssistantText }),
				...(sessionStats === undefined ? {} : { sessionStats }),
			});
		});
	});
}

function appendLimited(current: string, chunk: string, maxLength: number): string {
	if (current.length >= maxLength) {
		return current;
	}

	return `${current}${chunk}`.slice(0, maxLength);
}

function exitCodeForSignal(signal: NodeJS.Signals | null): number {
	if (signal === "SIGTERM") {
		return 143;
	}
	if (signal === "SIGKILL") {
		return 137;
	}
	if (signal === "SIGINT") {
		return 130;
	}

	return signal === null ? 1 : 1;
}

function piRecordsToEvents(records: readonly JsonObject[]): EvalEvent[] {
	return records.map((record) => ({
		type: stringField(record, "type") ?? "pi.record",
		at: new Date().toISOString(),
		data: record,
	}));
}

function piStatsToCosts(
	stats: JsonObject,
	adapterName: string,
	task: EvalTask,
	context: EvalAdapterContext,
): EvalCostRecord[] {
	const totalCostUsd =
		numberField(stats, "cost") ?? numberField(stats, "totalCost") ?? numberField(stats, "total_cost") ?? numberField(stats, "totalCostUsd");
	const tokens = objectField(stats, "tokens") ?? stats;
	const promptTokens = numberField(tokens, "prompt") ?? numberField(tokens, "promptTokens") ?? numberField(tokens, "input");
	const completionTokens =
		numberField(tokens, "completion") ?? numberField(tokens, "completionTokens") ?? numberField(tokens, "output");
	const totalTokens = numberField(tokens, "total") ?? numberField(tokens, "totalTokens") ?? sumDefined(promptTokens, completionTokens);

	if (totalCostUsd === undefined && promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
		return [];
	}

	return [
		{
			id: `pi:${context.attemptId}:stats`,
			runId: context.runId,
			taskId: task.id,
			attemptId: context.attemptId,
			adapterName,
			confidence: totalCostUsd === undefined ? "local-token-estimate" : "response-usage",
			occurredAt: new Date().toISOString(),
			currency: "USD",
			metadata: stats,
			...(completionTokens === undefined ? {} : { completionTokens }),
			...(promptTokens === undefined ? {} : { promptTokens }),
			...(task.surpriseLabels?.[0] === undefined ? {} : { surpriseLabel: task.surpriseLabels[0] }),
			...(totalCostUsd === undefined ? {} : { totalCostUsd }),
			...(totalTokens === undefined ? {} : { totalTokens }),
		},
	];
}

function collectAssistantText(records: readonly JsonObject[]): string | undefined {
	const chunks: string[] = [];
	for (const record of records) {
		if (stringField(record, "type") === "message_update") {
			const text = textFromRpcRecord(record);
			if (text !== undefined) {
				chunks.push(text);
			}
		}
	}

	return chunks.length === 0 ? undefined : chunks.join("");
}

function textFromRpcRecord(record: JsonObject): string | undefined {
	return (
		stringField(record, "text") ??
		stringField(record, "message") ??
		stringField(record, "content") ??
		stringField(record, "result") ??
		stringField(objectField(record, "data"), "text") ??
		stringField(objectField(record, "data"), "content")
	);
}

function objectFromRpcRecord(record: JsonObject): JsonObject | undefined {
	return objectField(record, "data") ?? objectField(record, "stats") ?? objectField(record, "result");
}

function parseJsonObject(line: string): JsonObject | undefined {
	try {
		const value = JSON.parse(line) as JsonValue;
		return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

function objectField(object: JsonObject | undefined, key: string): JsonObject | undefined {
	const value = object?.[key];
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function stringField(object: JsonObject | undefined, key: string): string | undefined {
	const value = object?.[key];
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function numberField(object: JsonObject | undefined, key: string): number | undefined {
	const value = object?.[key];
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return undefined;
}

function sumDefined(left: number | undefined, right: number | undefined): number | undefined {
	return left === undefined || right === undefined ? undefined : left + right;
}
