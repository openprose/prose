import { CLAUDE_SDK_DEFAULTS, resolveClaudeModel } from "./defaults.js";
import { writeLine } from "./streams.js";
import type { Harness, HarnessRunOptions } from "./types.js";

export type ClaudeSdkQuery = typeof import("@anthropic-ai/claude-agent-sdk").query;
export type ClaudeSdkQueryResult = ReturnType<ClaudeSdkQuery>;
export type ClaudeSdkMessage = ClaudeSdkQueryResult extends AsyncIterable<infer Message> ? Message : never;
export type ClaudeSdkQueryLike = (...args: Parameters<ClaudeSdkQuery>) => ClaudeSdkQueryResult | Promise<ClaudeSdkQueryResult>;

export interface ClaudeSdkHarnessOptions {
	query?: ClaudeSdkQueryLike;
}

export async function defaultClaudeSdkQuery(...args: Parameters<ClaudeSdkQuery>): Promise<ClaudeSdkQueryResult> {
	const { query } = await import("@anthropic-ai/claude-agent-sdk");
	return query(...args);
}

export function createClaudeSdkHarness(options: ClaudeSdkHarnessOptions = {}): Harness {
	const query = options.query ?? defaultClaudeSdkQuery;

	return {
		name: "claude-sdk",
		async run(prompt, runOptions) {
			const abortController = bridgeAbortController(runOptions.signal);
			const stream = await Promise.resolve(
				query({
					prompt,
					options: {
						abortController,
						model: resolveClaudeModel(runOptions.env),
						thinking: CLAUDE_SDK_DEFAULTS.thinking,
						...(runOptions.additionalDirectories === undefined
							? {}
							: { additionalDirectories: runOptions.additionalDirectories }),
						...(runOptions.cwd === undefined ? {} : { cwd: runOptions.cwd }),
						...(runOptions.env === undefined ? {} : { env: runOptions.env }),
						includePartialMessages: true,
						stderr: (chunk: string) => runOptions.stderr.write(chunk),
						...(runOptions.systemPromptAppend === undefined
							? {}
							: {
									systemPrompt: {
										type: "preset",
										preset: "claude_code",
										append: runOptions.systemPromptAppend,
									},
								}),
					},
				}),
			).catch((error: unknown) => {
				if (runOptions.signal?.aborted) {
					return undefined;
				}
				throw error;
			});

			if (stream === undefined) {
				return 143;
			}

			let exitCode = 0;
			let wroteStreamingText = false;
			let streamingTextEndedWithNewline = true;

			try {
				for await (const message of stream) {
					const outcome = writeClaudeMessage(message, runOptions, wroteStreamingText);
					exitCode = Math.max(exitCode, outcome.exitCode);
					if (outcome.wroteText) {
						wroteStreamingText = true;
						streamingTextEndedWithNewline = outcome.endedWithNewline;
					}
				}
			} catch (error) {
				if (runOptions.signal?.aborted) {
					return 143;
				}
				throw error;
			} finally {
				stream.close();
			}

			if (wroteStreamingText && !streamingTextEndedWithNewline) {
				runOptions.stdout.write("\n");
			}

			return runOptions.signal?.aborted ? 143 : exitCode;
		},
	};
}

function writeClaudeMessage(
	message: ClaudeSdkMessage,
	runOptions: HarnessRunOptions,
	wroteStreamingText: boolean,
): { exitCode: number; wroteText: boolean; endedWithNewline: boolean } {
	switch (message.type) {
		case "stream_event": {
			const text = textDelta(message.event);
			if (!text) {
				return ok();
			}
			runOptions.stdout.write(text);
			return { exitCode: 0, wroteText: true, endedWithNewline: text.endsWith("\n") };
		}
		case "assistant":
			if (wroteStreamingText) {
				return ok();
			}
			return writeAssistantMessage(message, runOptions);
		case "result":
			if (message.subtype === "success") {
				if (!wroteStreamingText && message.result) {
					writeLine(runOptions.stdout, message.result);
					return { exitCode: 0, wroteText: true, endedWithNewline: true };
				}
				return ok();
			}
			writeLine(runOptions.stderr, message.errors.join("\n") || message.subtype);
			return { exitCode: 1, wroteText: false, endedWithNewline: true };
		case "auth_status":
			for (const line of message.output) {
				writeLine(runOptions.stderr, line);
			}
			if (message.error) {
				writeLine(runOptions.stderr, message.error);
				return { exitCode: 1, wroteText: false, endedWithNewline: true };
			}
			return ok();
		default:
			return ok();
	}
}

function writeAssistantMessage(
	message: Extract<ClaudeSdkMessage, { type: "assistant" }>,
	runOptions: HarnessRunOptions,
): { exitCode: number; wroteText: boolean; endedWithNewline: boolean } {
	let wroteText = false;
	let endedWithNewline = true;
	for (const block of message.message.content) {
		if (block.type !== "text") {
			continue;
		}
		runOptions.stdout.write(block.text);
		wroteText = true;
		endedWithNewline = block.text.endsWith("\n");
	}

	if (wroteText && !endedWithNewline) {
		runOptions.stdout.write("\n");
		endedWithNewline = true;
	}

	return { exitCode: message.error === undefined ? 0 : 1, wroteText, endedWithNewline };
}

function textDelta(event: Extract<ClaudeSdkMessage, { type: "stream_event" }>["event"]): string {
	if (event.type !== "content_block_delta") {
		return "";
	}

	const delta = event.delta;
	if (delta.type !== "text_delta") {
		return "";
	}

	return delta.text;
}

function ok(): { exitCode: number; wroteText: boolean; endedWithNewline: boolean } {
	return { exitCode: 0, wroteText: false, endedWithNewline: true };
}

function bridgeAbortController(signal: AbortSignal | undefined): AbortController {
	const abortController = new AbortController();
	if (signal === undefined) {
		return abortController;
	}

	if (signal.aborted) {
		abortController.abort(signal.reason);
		return abortController;
	}

	signal.addEventListener("abort", () => abortController.abort(signal.reason), { once: true });
	return abortController;
}
