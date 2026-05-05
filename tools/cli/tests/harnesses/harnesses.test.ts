import { describe, expect, test } from "vitest";

import {
	createClaudeSdkHarness,
	createCodexSdkHarness,
	createHarness,
	resolveHarnessName,
	type CodexThreadEvent,
	type CodexSdkFactory,
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
			"Unsupported harness: missing. Expected one of: codex-sdk, claude-sdk, mock",
		);
		expect(() => resolveHarnessName("claude")).toThrow(
			"Unsupported harness: claude. Expected one of: codex-sdk, claude-sdk, mock",
		);
		expect(() => resolveHarnessName("codex")).toThrow(
			"Unsupported harness: codex. Expected one of: codex-sdk, claude-sdk, mock",
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
		expect(starts).toEqual([
			{
				approvalPolicy: "never",
				sandboxMode: "danger-full-access",
				skipGitRepoCheck: true,
				workingDirectory: "/repo",
			},
		]);
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
				approvalPolicy: "never",
				sandboxMode: "danger-full-access",
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

	test("forwards requested sandbox and approval settings to Codex SDK threads", async () => {
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
			env: {
				PROSE_CODEX_APPROVAL_POLICY: "on-request",
				PROSE_CODEX_SANDBOX_MODE: "workspace-write",
			},
		});

		expect(exitCode).toBe(0);
		expect(starts).toEqual([{ approvalPolicy: "on-request", sandboxMode: "workspace-write", skipGitRepoCheck: true }]);
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

	test("selects Claude model from env and defaults to permissive non-interactive mode", async () => {
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

		const exitCode = await harness.run("prose run inspector.prose.md", {
			...io.options,
			env: { ANTHROPIC_MODEL: "claude-sonnet-4-6" },
		});

		expect(exitCode).toBe(0);
		expect(calls).toEqual([
			{
				prompt: "prose run inspector.prose.md",
				options: expect.objectContaining({
					env: { ANTHROPIC_MODEL: "claude-sonnet-4-6" },
					allowedTools: ["Read(*)", "Glob(*)", "Grep(*)", "Write(*)", "Edit(*)", "MultiEdit(*)"],
					model: "claude-sonnet-4-6",
					permissionMode: "bypassPermissions",
					allowDangerouslySkipPermissions: true,
					settings: {
						permissions: {
							allow: ["Read(*)", "Glob(*)", "Grep(*)", "Write(*)", "Edit(*)", "MultiEdit(*)"],
							defaultMode: "bypassPermissions",
						},
					},
				}),
			},
		]);
	});

	test("honors Claude permission overrides from env", async () => {
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

		const exitCode = await harness.run("prose status", {
			...io.options,
			env: {
				ANTHROPIC_MODEL: "claude-sonnet-4-6",
				PROSE_CLAUDE_PERMISSION_MODE: "acceptEdits",
			},
		});

		expect(exitCode).toBe(0);
		expect(calls).toEqual([
			{
				prompt: "prose status",
				options: expect.objectContaining({
					allowedTools: ["Read(*)", "Glob(*)", "Grep(*)", "Write(*)", "Edit(*)", "MultiEdit(*)"],
					permissionMode: "acceptEdits",
					settings: {
						permissions: {
							allow: ["Read(*)", "Glob(*)", "Grep(*)", "Write(*)", "Edit(*)", "MultiEdit(*)"],
							defaultMode: "acceptEdits",
						},
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
});
