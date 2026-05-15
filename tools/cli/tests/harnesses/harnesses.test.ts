import { describe, expect, test } from "vitest";

import {
	createClaudeSdkHarness,
	createCodexSdkHarness,
	createCursorSdkHarness,
	createHarness,
	resolveHarnessName,
	type CodexThreadEvent,
	type CodexSdkFactory,
	type CursorSdkAgent,
	type CursorSdkAgentFactory,
	type CursorSdkAgentOptions,
	type CursorSdkMessage,
	type CursorSdkRun,
	type CursorSdkRunResult,
	type CursorSdkUserMessage,
} from "../../src/harnesses/index.js";

function memoryStreams() {
	let stdout = "";
	let stderr = "";

	return {
		options: {
			stdout: { write: (chunk: string) => void (stdout += chunk) },
			stderr: { write: (chunk: string) => void (stderr += chunk) },
		},
		get stdout() {
			return stdout;
		},
		get stderr() {
			return stderr;
		},
	};
}

async function* events(items: CodexThreadEvent[]): AsyncGenerator<CodexThreadEvent> {
	for (const item of items) {
		yield item;
	}
}

describe("harness selection", () => {
	test("resolves supported harness names and rejects unknown names", () => {
		expect(resolveHarnessName("codex-sdk")).toBe("codex-sdk");
		expect(resolveHarnessName("claude-sdk")).toBe("claude-sdk");
		expect(() => resolveHarnessName("missing")).toThrow(
			"Unsupported harness: missing. Expected one of: codex-sdk, claude-sdk, cursor-sdk, mock",
		);
		expect(() => resolveHarnessName("claude")).toThrow(
			"Unsupported harness: claude. Expected one of: codex-sdk, claude-sdk, cursor-sdk, mock",
		);
		expect(() => resolveHarnessName("codex")).toThrow(
			"Unsupported harness: codex. Expected one of: codex-sdk, claude-sdk, cursor-sdk, mock",
		);
	});

	test("selects mock harness", async () => {
		const io = memoryStreams();
		const harness = createHarness("mock", { mock: { response: "ok" } });

		await expect(harness.run("prose run inspector.prose.md", { ...io.options })).resolves.toBe(0);
		expect(io.stdout).toBe("ok\n");
	});
});

describe("codex-sdk harness", () => {
	test("streams agent messages and forwards cwd/env/signal", async () => {
		const io = memoryStreams();
		const starts: unknown[] = [];
		const factoryOptions: unknown[] = [];
		const signal = new AbortController().signal;
		const factory: CodexSdkFactory = (options) => {
			factoryOptions.push(options);
			return {
				startThread: (options) => {
					starts.push(options);
					return {
						runStreamed: async (prompt, turnOptions) => {
							expect(prompt).toBe("prose run inspector.prose.md");
							expect(turnOptions?.signal).toBe(signal);
							return {
								events: events([
									{ type: "item.completed", item: { id: "item-1", type: "agent_message", text: "sdk output" } },
								]),
							};
						},
					};
				},
			};
		};

		const exitCode = await createCodexSdkHarness({ factory }).run("prose run inspector.prose.md", {
			...io.options,
			cwd: "/repo",
			env: { OPENAI_API_KEY: "test", EMPTY: undefined },
			signal,
		});

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("sdk output\n");
		expect(starts).toEqual([{ skipGitRepoCheck: true, workingDirectory: "/repo" }]);
		expect(factoryOptions).toEqual([{ apiKey: "test", env: { OPENAI_API_KEY: "test" } }]);
	});

	test("injects OpenProse bootstrap into Codex SDK client and thread options", async () => {
		const io = memoryStreams();
		const starts: unknown[] = [];
		const factoryOptions: unknown[] = [];
		const bootstrap = "OPEN_PROSE_BOOTSTRAP";
		const factory: CodexSdkFactory = (options) => {
			factoryOptions.push(options);
			return {
				startThread: (options) => {
					starts.push(options);
					return {
						runStreamed: async () => ({
							events: events([
								{ type: "item.completed", item: { id: "item-1", type: "agent_message", text: "sdk output" } },
							]),
						}),
					};
				},
			};
		};

		await createCodexSdkHarness({ factory }).run("prose run inspector.prose.md", {
			...io.options,
			additionalDirectories: ["/skills/open-prose"],
			env: { OPENAI_API_KEY: "test", HOME: "/home/prose" },
			systemPromptAppend: bootstrap,
		});

		expect(starts).toEqual([
			{
				additionalDirectories: ["/skills/open-prose"],
				skipGitRepoCheck: true,
			},
		]);
		expect(factoryOptions).toEqual([
			{
				apiKey: "test",
				config: {
					developer_instructions: bootstrap,
				},
				env: { OPENAI_API_KEY: "test", HOME: "/home/prose" },
			},
		]);
	});

	test("forwards requested runtime settings to Codex SDK threads", async () => {
		const io = memoryStreams();
		const starts: unknown[] = [];
		const factory: CodexSdkFactory = () => ({
			startThread: (options) => {
				starts.push(options);
				return {
					runStreamed: async () => ({
						events: events([
							{ type: "item.completed", item: { id: "item-1", type: "agent_message", text: "sdk output" } },
						]),
					}),
				};
			},
		});

		const exitCode = await createCodexSdkHarness({ factory }).run("prose run inspector.prose.md", {
			...io.options,
			additionalDirectories: ["/skills/open-prose"],
			env: {
				PROSE_CODEX_ADD_DIR: " /var/lib/prose, /tmp/grant-finder ,,",
				PROSE_CODEX_APPROVAL_POLICY: "never",
				PROSE_CODEX_NETWORK: "true",
				PROSE_CODEX_SANDBOX_MODE: "danger-full-access",
			},
		});

		expect(exitCode).toBe(0);
		expect(starts).toEqual([
			{
				additionalDirectories: ["/skills/open-prose", "/var/lib/prose", "/tmp/grant-finder"],
				approvalPolicy: "never",
				networkAccessEnabled: true,
				sandboxMode: "danger-full-access",
				skipGitRepoCheck: true,
			},
		]);
	});

	test("rejects invalid Codex network setting", async () => {
		const io = memoryStreams();
		const harness = createCodexSdkHarness({
			factory: () => ({
				startThread: () => {
					throw new Error("unexpected startThread");
				},
			}),
		});

		await expect(
			harness.run("prose run inspector.prose.md", {
				...io.options,
				env: {
					PROSE_CODEX_NETWORK: "yes",
				},
			}),
		).rejects.toThrow("PROSE_CODEX_NETWORK must be one of: true, false");
	});

	test("maps failed turns to stderr and nonzero exit", async () => {
		const io = memoryStreams();
		const harness = createCodexSdkHarness({
			factory: () => ({
				startThread: () => ({
					runStreamed: async () => ({
						events: events([{ type: "turn.failed", error: { message: "boom" } }]),
					}),
				}),
			}),
		});

		await expect(harness.run("prose status", { ...io.options })).resolves.toBe(1);
		expect(io.stderr).toBe("boom\n");
	});
});

describe("claude-sdk harness", () => {
	test("injects OpenProse bootstrap as Claude Code system prompt append", async () => {
		const io = memoryStreams();
		const calls: unknown[] = [];
		const bootstrap = "OPEN_PROSE_BOOTSTRAP";
		const harness = createClaudeSdkHarness({
			query: async (args) => {
				calls.push(args);
				return {
					async *[Symbol.asyncIterator]() {
						yield { type: "result", subtype: "success", result: "ok", is_error: false };
					},
					close() {},
				} as never;
			},
		});

		const exitCode = await harness.run("prose run inspector.prose.md", {
			...io.options,
			additionalDirectories: ["/skills/open-prose"],
			cwd: "/repo",
			env: { A: "B" },
			systemPromptAppend: bootstrap,
		});

		expect(exitCode).toBe(0);
		expect(calls).toEqual([
			{
				prompt: "prose run inspector.prose.md",
				options: expect.objectContaining({
					additionalDirectories: ["/skills/open-prose"],
					cwd: "/repo",
					env: { A: "B" },
					systemPrompt: {
						type: "preset",
						preset: "claude_code",
						append: bootstrap,
					},
				}),
			},
		]);
	});

	test("streams text deltas without duplicating final result", async () => {
		const io = memoryStreams();
		const abortControllers: AbortController[] = [];
		const harness = createClaudeSdkHarness({
			query: async ({ options }) => {
				abortControllers.push(options?.abortController as AbortController);
				return {
					async *[Symbol.asyncIterator]() {
						yield {
							type: "stream_event",
							event: { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } },
						};
						yield { type: "result", subtype: "success", result: "hello", is_error: false };
					},
					close() {},
				} as never;
			},
		});

		const exitCode = await harness.run("prose status", { ...io.options, cwd: "/repo", env: { A: "B" } });

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("hello\n");
		expect(abortControllers).toHaveLength(1);
	});

	test("maps result errors to stderr and nonzero exit", async () => {
		const io = memoryStreams();
		const harness = createClaudeSdkHarness({
			query: async () =>
				({
					async *[Symbol.asyncIterator]() {
						yield { type: "result", subtype: "error_during_execution", errors: ["bad"], is_error: true };
					},
					close() {},
				}) as never,
		});

		await expect(harness.run("prose status", { ...io.options })).resolves.toBe(1);
		expect(io.stderr).toBe("bad\n");
	});

	test("always forwards settingSources: ['user', 'project']", async () => {
		const io = memoryStreams();
		const calls: unknown[] = [];
		const harness = createClaudeSdkHarness({
			query: async (args) => {
				calls.push(args);
				return {
					async *[Symbol.asyncIterator]() {
						yield { type: "result", subtype: "success", result: "ok", is_error: false };
					},
					close() {},
				} as never;
			},
		});

		await harness.run("prose status", { ...io.options });

		expect(calls).toEqual([
			expect.objectContaining({
				options: expect.objectContaining({
					settingSources: ["user", "project"],
				}),
			}),
		]);
	});

	test("auth_status with error writes output and error to stderr and exits 1", async () => {
		const io = memoryStreams();
		const harness = createClaudeSdkHarness({
			query: async () =>
				({
					async *[Symbol.asyncIterator]() {
						yield {
							type: "auth_status",
							output: ["Visit https://example.com to authenticate"],
							error: "Not authenticated",
						};
					},
					close() {},
				}) as never,
		});

		await expect(harness.run("prose status", { ...io.options })).resolves.toBe(1);
		expect(io.stderr).toContain("Visit https://example.com to authenticate");
		expect(io.stderr).toContain("Not authenticated");
	});

	test("auth_status info-only writes lines to stderr and exits 0", async () => {
		const io = memoryStreams();
		const harness = createClaudeSdkHarness({
			query: async () =>
				({
					async *[Symbol.asyncIterator]() {
						yield { type: "auth_status", output: ["Authenticated as user@example.com"] };
						yield { type: "result", subtype: "success", result: "ok", is_error: false };
					},
					close() {},
				}) as never,
		});

		await expect(harness.run("prose status", { ...io.options })).resolves.toBe(0);
		expect(io.stderr).toBe("Authenticated as user@example.com\n");
	});
});

async function* cursorMessages(items: CursorSdkMessage[]): AsyncGenerator<CursorSdkMessage> {
	for (const item of items) {
		yield item;
	}
}

interface FakeCursorAgentSpec {
	stream: CursorSdkMessage[];
	waitResult: CursorSdkRunResult;
	onCancel?: () => void;
	dispose?: () => void;
}

function fakeCursorFactory(
	spec: FakeCursorAgentSpec,
	capture: {
		options?: CursorSdkAgentOptions;
		prompts: string[];
		cancels: number;
		disposed: boolean;
	},
): CursorSdkAgentFactory {
	return async (options) => {
		capture.options = options;
		const agent: CursorSdkAgent = {
			agentId: "agent-fake",
			model: options.model,
			async send(prompt: string | CursorSdkUserMessage) {
				capture.prompts.push(typeof prompt === "string" ? prompt : (prompt as CursorSdkUserMessage & { text: string }).text);
				const run: CursorSdkRun = {
					id: "run-fake",
					stream: () => cursorMessages(spec.stream),
					async wait() {
						return spec.waitResult;
					},
					async cancel() {
						capture.cancels += 1;
						spec.onCancel?.();
					},
				} as unknown as CursorSdkRun;
				return run;
			},
			close() {},
			async reload() {},
			[Symbol.asyncDispose]: async () => {
				capture.disposed = true;
				spec.dispose?.();
			},
			async listArtifacts() {
				return [];
			},
			async downloadArtifact() {
				return Buffer.alloc(0);
			},
		} as unknown as CursorSdkAgent;
		return agent;
	};
}

describe("cursor-sdk harness", () => {
	test("creates a local agent with apiKey, model, and settingSources, then streams assistant text", async () => {
		const io = memoryStreams();
		const capture: { options?: CursorSdkAgentOptions; prompts: string[]; cancels: number; disposed: boolean } = { prompts: [], cancels: 0, disposed: false };
		const factory = fakeCursorFactory(
			{
				stream: [
					{
						type: "assistant",
						message: { content: [{ type: "text", text: "hello" }] },
					} as unknown as CursorSdkMessage,
				],
				waitResult: { id: "run-fake", status: "finished" } as CursorSdkRunResult,
			},
			capture,
		);

		const exitCode = await createCursorSdkHarness({ factory }).run("prose run inspector.prose.md", {
			...io.options,
			cwd: "/repo",
			env: { CURSOR_API_KEY: "key-1" },
		});

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("hello");
		expect(capture.options).toEqual({
			apiKey: "key-1",
			model: { id: "composer-2" },
			local: { cwd: "/repo", settingSources: ["project", "user"] },
		});
		expect(capture.prompts).toEqual(["prose run inspector.prose.md"]);
		expect(capture.disposed).toBe(true);
	});

	test("CURSOR_MODEL env override propagates to model.id", async () => {
		const io = memoryStreams();
		const capture: { options?: CursorSdkAgentOptions; prompts: string[]; cancels: number; disposed: boolean } = { prompts: [], cancels: 0, disposed: false };
		const factory = fakeCursorFactory(
			{
				stream: [],
				waitResult: { id: "run-fake", status: "finished" } as CursorSdkRunResult,
			},
			capture,
		);

		await createCursorSdkHarness({ factory }).run("prose status", {
			...io.options,
			env: { CURSOR_API_KEY: "key-1", CURSOR_MODEL: "composer-9" },
		});

		expect(capture.options?.model).toEqual({ id: "composer-9" });
	});

	test("missing CURSOR_API_KEY throws before invoking the factory", async () => {
		const io = memoryStreams();
		let factoryInvoked = false;
		const factory: CursorSdkAgentFactory = async () => {
			factoryInvoked = true;
			throw new Error("should not run");
		};
		// Clear ambient env so process.env.CURSOR_API_KEY does not leak in.
		const originalKey = process.env.CURSOR_API_KEY;
		delete process.env.CURSOR_API_KEY;

		try {
			await expect(
				createCursorSdkHarness({ factory }).run("prose status", {
					...io.options,
					env: {},
				}),
			).rejects.toThrow("CURSOR_API_KEY is required for cursor-sdk.");
			expect(factoryInvoked).toBe(false);
		} finally {
			if (originalKey !== undefined) {
				process.env.CURSOR_API_KEY = originalKey;
			}
		}
	});

	test("failed tool_call event routes to stderr and bumps exit code", async () => {
		const io = memoryStreams();
		const capture: { options?: CursorSdkAgentOptions; prompts: string[]; cancels: number; disposed: boolean } = { prompts: [], cancels: 0, disposed: false };
		const factory = fakeCursorFactory(
			{
				stream: [
					{
						type: "tool_call",
						name: "grep",
						status: "error",
						result: "no match",
					} as unknown as CursorSdkMessage,
				],
				waitResult: { id: "run-fake", status: "finished" } as CursorSdkRunResult,
			},
			capture,
		);

		const exitCode = await createCursorSdkHarness({ factory }).run("prose status", {
			...io.options,
			env: { CURSOR_API_KEY: "key-1" },
		});

		expect(exitCode).toBe(1);
		expect(io.stderr).toBe("[cursor] tool grep failed: no match\n");
	});

	test("status ERROR event routes to stderr with provider message", async () => {
		const io = memoryStreams();
		const capture: { options?: CursorSdkAgentOptions; prompts: string[]; cancels: number; disposed: boolean } = { prompts: [], cancels: 0, disposed: false };
		const factory = fakeCursorFactory(
			{
				stream: [
					{
						type: "status",
						status: "ERROR",
						message: "rate limit",
					} as unknown as CursorSdkMessage,
				],
				waitResult: { id: "run-fake", status: "finished" } as CursorSdkRunResult,
			},
			capture,
		);

		const exitCode = await createCursorSdkHarness({ factory }).run("prose status", {
			...io.options,
			env: { CURSOR_API_KEY: "key-1" },
		});

		expect(exitCode).toBe(1);
		expect(io.stderr).toBe("[cursor] ERROR: rate limit\n");
	});

	test("run.wait() error result writes message to stderr and returns 1", async () => {
		const io = memoryStreams();
		const capture: { options?: CursorSdkAgentOptions; prompts: string[]; cancels: number; disposed: boolean } = { prompts: [], cancels: 0, disposed: false };
		const factory = fakeCursorFactory(
			{
				stream: [],
				waitResult: { id: "run-fake", status: "error", result: "auth failed" } as CursorSdkRunResult,
			},
			capture,
		);

		const exitCode = await createCursorSdkHarness({ factory }).run("prose status", {
			...io.options,
			env: { CURSOR_API_KEY: "key-1" },
		});

		expect(exitCode).toBe(1);
		expect(io.stderr).toBe("auth failed\n");
	});

	test("signal.abort() mid-stream calls run.cancel() once and returns 143", async () => {
		const io = memoryStreams();
		const controller = new AbortController();
		const capture: { options?: CursorSdkAgentOptions; prompts: string[]; cancels: number; disposed: boolean } = { prompts: [], cancels: 0, disposed: false };

		// Build a stream generator that pauses after the first event so we can abort mid-flight.
		async function* abortableStream(): AsyncGenerator<CursorSdkMessage> {
			yield {
				type: "assistant",
				message: { content: [{ type: "text", text: "partial" }] },
			} as unknown as CursorSdkMessage;
			controller.abort();
			// After cancel(), wait() resolves cancelled and the loop exits naturally.
		}

		const factory: CursorSdkAgentFactory = async (options) => {
			capture.options = options;
			return {
				agentId: "agent-fake",
				model: options.model,
				async send(prompt: string | CursorSdkUserMessage) {
					capture.prompts.push(typeof prompt === "string" ? prompt : (prompt as CursorSdkUserMessage & { text: string }).text);
					return {
						id: "run-fake",
						stream: () => abortableStream(),
						async wait() {
							return { id: "run-fake", status: "cancelled" } as CursorSdkRunResult;
						},
						async cancel() {
							capture.cancels += 1;
						},
					} as unknown as CursorSdkRun;
				},
				close() {},
				async reload() {},
				[Symbol.asyncDispose]: async () => {
					capture.disposed = true;
				},
				async listArtifacts() {
					return [];
				},
				async downloadArtifact() {
					return Buffer.alloc(0);
				},
			} as unknown as CursorSdkAgent;
		};

		const exitCode = await createCursorSdkHarness({ factory }).run("prose status", {
			...io.options,
			env: { CURSOR_API_KEY: "key-1" },
			signal: controller.signal,
		});

		expect(exitCode).toBe(143);
		expect(capture.cancels).toBe(1);
		expect(capture.disposed).toBe(true);
	});

	test("agent[Symbol.asyncDispose] runs even when the stream throws", async () => {
		const io = memoryStreams();
		const capture: { options?: CursorSdkAgentOptions; prompts: string[]; cancels: number; disposed: boolean } = { prompts: [], cancels: 0, disposed: false };
		const factory: CursorSdkAgentFactory = async (options) => {
			capture.options = options;
			return {
				agentId: "agent-fake",
				model: options.model,
				async send(prompt: string | CursorSdkUserMessage) {
					capture.prompts.push(typeof prompt === "string" ? prompt : (prompt as CursorSdkUserMessage & { text: string }).text);
					return {
						id: "run-fake",
						async *stream(): AsyncGenerator<CursorSdkMessage> {
							throw new Error("stream blew up");
						},
						async wait() {
							return { id: "run-fake", status: "error" } as CursorSdkRunResult;
						},
						async cancel() {},
					} as unknown as CursorSdkRun;
				},
				close() {},
				async reload() {},
				[Symbol.asyncDispose]: async () => {
					capture.disposed = true;
				},
				async listArtifacts() {
					return [];
				},
				async downloadArtifact() {
					return Buffer.alloc(0);
				},
			} as unknown as CursorSdkAgent;
		};

		await expect(
			createCursorSdkHarness({ factory }).run("prose status", {
				...io.options,
				env: { CURSOR_API_KEY: "key-1" },
			}),
		).rejects.toThrow("stream blew up");
		expect(capture.disposed).toBe(true);
	});

	test("createHarness('cursor-sdk') returns a cursor-sdk harness wired to the factory", async () => {
		const io = memoryStreams();
		const capture: { options?: CursorSdkAgentOptions; prompts: string[]; cancels: number; disposed: boolean } = { prompts: [], cancels: 0, disposed: false };
		const factory = fakeCursorFactory(
			{
				stream: [
					{
						type: "assistant",
						message: { content: [{ type: "text", text: "ok" }] },
					} as unknown as CursorSdkMessage,
				],
				waitResult: { id: "run-fake", status: "finished" } as CursorSdkRunResult,
			},
			capture,
		);

		const harness = createHarness("cursor-sdk", { cursorSdk: { factory } });
		expect(harness.name).toBe("cursor-sdk");

		const exitCode = await harness.run("prose status", {
			...io.options,
			env: { CURSOR_API_KEY: "key-1" },
		});
		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("ok");
	});
});
