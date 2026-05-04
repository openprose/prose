import { writeLine } from "./streams.js";
import type {
	CursorSdkAgent,
	CursorSdkAgentFactory,
	CursorSdkAgentOptions,
	CursorSdkMessage,
	CursorSdkRun,
	CursorSdkRunResult,
	Harness,
	HarnessRunOptions,
	WritableStreamLike,
} from "./types.js";

const DEFAULT_CURSOR_MODEL = "composer-2";

export interface CursorSdkHarnessOptions {
	factory?: CursorSdkAgentFactory;
}

export async function createDefaultCursorSdkAgent(
	options: CursorSdkAgentOptions,
): Promise<CursorSdkAgent> {
	const { Agent } = await import("@cursor/sdk");
	return Agent.create(options);
}

export function createCursorSdkHarness(options: CursorSdkHarnessOptions = {}): Harness {
	const factory = options.factory ?? createDefaultCursorSdkAgent;

	return {
		name: "cursor-sdk",
		async run(prompt, runOptions) {
			let agent: CursorSdkAgent | undefined;
			let run: CursorSdkRun | undefined;
			const onAbort = () => {
				void run?.cancel();
			};

			try {
				const agentOptions = cursorAgentOptions(runOptions);
				const env = runOptions.env ?? {};
				if (env.PROSE_SUPPRESS_EXPERIMENTAL_WARNINGS !== "1") {
					writeLine(
						runOptions.stderr,
						"[cursor-sdk] experimental harness — composer-2 is tuned for coding tasks, not OpenProse contract execution. Multi-stage programs may run plan-only. Set CURSOR_MODEL to a stronger instruction-follower if needed (see README).",
					);
				}
				agent = await factory(agentOptions);
				run = await agent.send(prompt);

				if (runOptions.signal !== undefined) {
					runOptions.signal.addEventListener("abort", onAbort, { once: true });
				}

				let exitCode = 0;
				try {
					for await (const event of run.stream()) {
						exitCode = Math.max(
							exitCode,
							writeCursorMessage(event, runOptions.stdout, runOptions.stderr),
						);
					}
					const result = await run.wait();
					exitCode = Math.max(exitCode, finalizeCursorResult(result, runOptions.stderr));
				} finally {
					if (runOptions.signal !== undefined) {
						runOptions.signal.removeEventListener("abort", onAbort);
					}
				}

				return runOptions.signal?.aborted ? 143 : exitCode;
			} catch (error) {
				if (runOptions.signal?.aborted) {
					return 143;
				}
				throw error;
			} finally {
				try {
					await agent?.[Symbol.asyncDispose]?.();
				} catch {
					// Disposal best-effort: surface only the original outcome.
				}
			}
		},
	};
}

function cursorAgentOptions(runOptions: HarnessRunOptions): CursorSdkAgentOptions {
	const env = runOptions.env ?? {};
	const apiKey = env.CURSOR_API_KEY ?? process.env.CURSOR_API_KEY;
	if (!apiKey) {
		throw new Error("CURSOR_API_KEY is required for cursor-sdk.");
	}
	const model = env.CURSOR_MODEL ?? process.env.CURSOR_MODEL ?? DEFAULT_CURSOR_MODEL;

	return {
		apiKey,
		model: { id: model },
		local: {
			...(runOptions.cwd === undefined ? {} : { cwd: runOptions.cwd }),
			settingSources: ["project", "user"],
		},
	};
}

function writeCursorMessage(
	event: CursorSdkMessage,
	stdout: WritableStreamLike,
	stderr: WritableStreamLike,
): number {
	switch (event.type) {
		case "assistant":
			for (const block of event.message.content) {
				if (block.type === "text") {
					stdout.write(block.text);
				}
			}
			return 0;
		case "tool_call":
			if (event.status === "error") {
				const detail = event.result === undefined ? "" : `: ${truncate(stringify(event.result))}`;
				writeLine(stderr, `[cursor] tool ${event.name} failed${detail}`);
				return 1;
			}
			return 0;
		case "status":
			if (event.status === "ERROR" || event.status === "EXPIRED") {
				const detail = event.message ? `: ${event.message}` : "";
				writeLine(stderr, `[cursor] ${event.status}${detail}`);
				return 1;
			}
			return 0;
		default:
			return 0;
	}
}

function finalizeCursorResult(result: CursorSdkRunResult, stderr: WritableStreamLike): number {
	switch (result.status) {
		case "finished":
			return 0;
		case "error":
			if (result.result) {
				writeLine(stderr, result.result);
			}
			return 1;
		case "cancelled":
			return 0;
		default:
			return 0;
	}
}

function stringify(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function truncate(text: string, max = 200): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max)}…`;
}
