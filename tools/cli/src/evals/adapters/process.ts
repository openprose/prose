import { nodeProcessRunner } from "../../harnesses/process-runner.js";
import type { ProcessCommand, ProcessRunner, WritableStreamLike } from "../../harnesses/types.js";
import { DEFAULT_EVAL_OUTPUT_CHAR_LIMIT, redactionValuesFromEnv, sanitizeText } from "../safety.js";
import type { EvalAdapter, EvalAdapterContext, EvalTask } from "../types.js";

export interface ProcessEvalAdapterOptions {
	args?: readonly string[];
	buildEnv?: (task: EvalTask, context: EvalAdapterContext) => Record<string, string | undefined>;
	buildCommand?: (task: EvalTask) => ProcessCommand;
	command?: string;
	cwd?: string;
	env?: Record<string, string | undefined>;
	maxOutputChars?: number;
	name: string;
	runner?: ProcessRunner;
}

export function createProcessEvalAdapter(options: ProcessEvalAdapterOptions): EvalAdapter {
	const runner = options.runner ?? nodeProcessRunner;

	return {
		name: options.name,
		async runTask(task, context) {
			const command = resolveCommand(options, task);
			let stdout = "";
			let stderr = "";
			const started = Date.now();
			const env =
				context.env !== undefined || options.env !== undefined || options.buildEnv !== undefined
					? { ...(options.env ?? {}), ...(options.buildEnv?.(task, context) ?? {}), ...(context.env ?? {}) }
					: undefined;
			const maxOutputChars = options.maxOutputChars ?? DEFAULT_EVAL_OUTPUT_CHAR_LIMIT;
			const result = await runner(command.command, command.args, {
				...(task.cwd ?? options.cwd ? { cwd: task.cwd ?? options.cwd } : {}),
				...(env === undefined ? {} : { env }),
				...(context.signal === undefined ? {} : { signal: context.signal }),
				stdout: captureStream((chunk) => void (stdout = appendLimited(stdout, chunk, maxOutputChars))),
				stderr: captureStream((chunk) => void (stderr = appendLimited(stderr, chunk, maxOutputChars))),
			});
			const redactionValues = redactionValuesFromEnv(env);

			return {
				adapterName: options.name,
				durationMs: Date.now() - started,
				exitCode: result.exitCode,
				stdout: sanitizeText(stdout, redactionValues, maxOutputChars),
				stderr: sanitizeText(stderr, redactionValues, maxOutputChars),
			};
		},
	};
}

function appendLimited(current: string, chunk: string, maxLength: number): string {
	if (current.length >= maxLength) {
		return current;
	}

	return `${current}${chunk}`.slice(0, maxLength);
}

function resolveCommand(options: ProcessEvalAdapterOptions, task: EvalTask): ProcessCommand {
	if (options.buildCommand !== undefined) {
		return options.buildCommand(task);
	}

	if (options.command === undefined) {
		throw new Error("process eval adapter requires command or buildCommand");
	}

	return {
		command: options.command,
		args: [...(options.args ?? []), task.prompt],
	};
}

function captureStream(write: (chunk: string) => void): WritableStreamLike {
	return {
		write(chunk) {
			write(String(chunk));
		},
	};
}
