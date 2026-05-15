import type {
	CodexOptions,
	Input as CodexInput,
	RunStreamedResult,
	ThreadEvent,
	ThreadItem,
	ThreadOptions,
	TurnOptions,
} from "@openai/codex-sdk";

export type HarnessName = "claude-sdk" | "codex-sdk" | "mock";

export interface WritableStreamLike {
	write(chunk: string): unknown;
}

export interface HarnessRunOptions {
	additionalDirectories?: string[];
	cwd?: string;
	env?: Record<string, string | undefined>;
	model?: string;
	reasoningEffort?: string;
	signal?: AbortSignal;
	systemPromptAppend?: string;
	stdout: WritableStreamLike;
	stderr: WritableStreamLike;
}

export interface Harness {
	readonly name: HarnessName;
	run(prompt: string, options: HarnessRunOptions): Promise<number>;
}

export interface ProcessCommand {
	command: string;
	args: string[];
}

export interface ProcessRunOptions extends HarnessRunOptions {}

export interface ProcessRunResult {
	exitCode: number;
}

export type ProcessRunner = (
	command: string,
	args: string[],
	options: ProcessRunOptions,
) => Promise<ProcessRunResult>;

export type CodexThreadOptions = ThreadOptions;
export type CodexSdkClientOptions = Pick<CodexOptions, "apiKey" | "config" | "env">;

export interface CodexThread {
	runStreamed(prompt: CodexInput, options?: TurnOptions): Promise<RunStreamedResult>;
}

export interface CodexClient {
	startThread(options?: CodexThreadOptions): CodexThread;
}

export type CodexSdkFactory = (options?: CodexSdkClientOptions) => CodexClient | Promise<CodexClient>;
export type CodexThreadEvent = ThreadEvent;
export type CodexThreadItem = ThreadItem;
