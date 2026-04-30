export type HarnessName = "claude" | "claude-sdk" | "codex" | "codex-sdk" | "mock";

export interface WritableStreamLike {
	write(chunk: string): unknown;
}

export interface HarnessRunOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
	signal?: AbortSignal;
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

export interface CodexThread {
	runStreamed(
		prompt: string,
		options?: { signal?: AbortSignal },
	): Promise<{ events: AsyncIterable<CodexThreadEvent> }>;
}

export interface CodexThreadOptions {
	workingDirectory?: string;
}

export interface CodexClient {
	startThread(options?: CodexThreadOptions): CodexThread;
}

export interface CodexSdkClientOptions {
	env?: Record<string, string>;
}

export type CodexSdkFactory = (options?: CodexSdkClientOptions) => CodexClient | Promise<CodexClient>;

export type CodexThreadEvent =
	| {
			type: "item.completed";
			item: CodexThreadItem;
	  }
	| {
			type: "turn.failed";
			error: { message: string };
	  }
	| {
			type: "error";
			message: string;
	  }
	| {
			type: string;
			[key: string]: unknown;
	  };

export type CodexThreadItem =
	| {
			type: "agent_message";
			text: string;
	  }
	| {
			type: "command_execution";
			command: string;
			aggregated_output: string;
			exit_code?: number;
			status: "in_progress" | "completed" | "failed";
	  }
	| {
			type: "error";
			message: string;
	  }
	| {
			type: string;
			[key: string]: unknown;
	  };
