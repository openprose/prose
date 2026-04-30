import { codexThreadRuntimeOptions } from "./codex-options.js";
import { writeLine } from "./streams.js";
import type { CodexSdkClientOptions, CodexSdkFactory, CodexThreadEvent, CodexThreadItem, Harness } from "./types.js";

export interface CodexSdkHarnessOptions {
	factory?: CodexSdkFactory;
}

export async function createDefaultCodexSdkClient(options: CodexSdkClientOptions = {}) {
	const { Codex } = await import("@openai/codex-sdk");
	return new Codex(options);
}

export function createCodexSdkHarness(options: CodexSdkHarnessOptions = {}): Harness {
	const factory = options.factory ?? createDefaultCodexSdkClient;

	return {
		name: "codex-sdk",
		async run(prompt, runOptions) {
			try {
				const env = definedEnv(runOptions.env);
				const codex = await factory(codexClientOptions(env));
				const thread = codex.startThread(codexThreadOptions(runOptions.cwd, env));
				const { events } = await thread.runStreamed(
					prompt,
					runOptions.signal === undefined ? undefined : { signal: runOptions.signal },
				);

				let exitCode = 0;
				for await (const event of events) {
					exitCode = Math.max(exitCode, writeCodexEvent(event, runOptions.stdout, runOptions.stderr));
				}

				return runOptions.signal?.aborted ? 143 : exitCode;
			} catch (error) {
				if (runOptions.signal?.aborted) {
					return 143;
				}
				throw error;
			}
		},
	};
}

function codexThreadOptions(cwd: string | undefined, env: Record<string, string> | undefined) {
	const runtimeOptions = codexThreadRuntimeOptions(env);
	const options = {
		...(cwd === undefined ? {} : { workingDirectory: cwd }),
		...runtimeOptions,
	};

	return Object.keys(options).length === 0 ? undefined : options;
}

function codexClientOptions(env: Record<string, string> | undefined) {
	const apiKey = env?.CODEX_API_KEY ?? env?.OPENAI_API_KEY ?? process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY;
	if (env === undefined && apiKey === undefined) {
		return undefined;
	}

	return {
		...(apiKey === undefined ? {} : { apiKey }),
		...(env === undefined ? {} : { env }),
	};
}

function writeCodexEvent(
	event: CodexThreadEvent,
	stdout: { write(chunk: string): unknown },
	stderr: { write(chunk: string): unknown },
): number {
	switch (event.type) {
		case "item.completed":
			return writeCodexItem(event.item, stdout, stderr);
		case "turn.failed":
			writeLine(stderr, event.error.message);
			return 1;
		case "error":
			writeLine(stderr, event.message);
			return 1;
		default:
			return 0;
	}
}

function writeCodexItem(
	item: CodexThreadItem,
	stdout: { write(chunk: string): unknown },
	stderr: { write(chunk: string): unknown },
): number {
	switch (item.type) {
		case "agent_message":
			writeLine(stdout, item.text);
			return 0;
		case "command_execution":
			if (item.status === "failed") {
				writeLine(stderr, item.aggregated_output || `Command failed: ${item.command}`);
				return typeof item.exit_code === "number" ? normalizeExitCode(item.exit_code) : 1;
			}
			return 0;
		case "error":
			writeLine(stderr, item.message);
			return 1;
		default:
			return 0;
	}
}

function definedEnv(env: Record<string, string | undefined> | undefined): Record<string, string> | undefined {
	if (env === undefined) {
		return undefined;
	}

	const entries = Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined);
	return Object.fromEntries(entries);
}

function normalizeExitCode(exitCode: number): number {
	if (Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255) {
		return exitCode;
	}
	return 1;
}
