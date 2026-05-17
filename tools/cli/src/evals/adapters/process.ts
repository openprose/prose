import { nodeProcessRunner } from "../../harnesses/process-runner.js";
import type { ProcessCommand, ProcessRunner, WritableStreamLike } from "../../harnesses/types.js";
import type { EvalAdapter, EvalAdapterContext, EvalTask } from "../types.js";

export interface ProcessEvalAdapterOptions {
	args?: readonly string[];
	buildEnv?: (task: EvalTask, context: EvalAdapterContext) => Record<string, string | undefined>;
	buildCommand?: (task: EvalTask) => ProcessCommand;
	command?: string;
	cwd?: string;
	env?: Record<string, string | undefined>;
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
			const result = await runner(command.command, command.args, {
				...(task.cwd ?? options.cwd ? { cwd: task.cwd ?? options.cwd } : {}),
				...(context.env !== undefined || options.env !== undefined || options.buildEnv !== undefined
					? { env: { ...(options.env ?? {}), ...(options.buildEnv?.(task, context) ?? {}), ...(context.env ?? {}) } }
					: {}),
				...(context.signal === undefined ? {} : { signal: context.signal }),
				stdout: captureStream((chunk) => void (stdout += chunk)),
				stderr: captureStream((chunk) => void (stderr += chunk)),
			});

			return {
				adapterName: options.name,
				durationMs: Date.now() - started,
				exitCode: result.exitCode,
				stdout,
				stderr,
			};
		},
	};
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
