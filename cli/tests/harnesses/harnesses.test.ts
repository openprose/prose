import { describe, expect, test } from "vitest";

import {
	createClaudeSdkHarness,
	createCodexSdkHarness,
	createHarness,
	nodeProcessRunner,
	resolveHarnessName,
	type CodexThreadEvent,
	type CodexSdkFactory,
	type ProcessRunner,
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

function recordingRunner(calls: Array<{ command: string; args: string[] }>): ProcessRunner {
	return async (command, args, options) => {
		calls.push({ command, args });
		options.stdout.write("tool out");
		options.stderr.write("tool err");
		return { exitCode: 3 };
	};
}

async function* events(items: CodexThreadEvent[]): AsyncGenerator<CodexThreadEvent> {
	for (const item of items) {
		yield item;
	}
}

async function waitFor(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 1000;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for condition.");
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

describe("process harnesses", () => {
	test("codex CLI builds codex exec with the exact prompt", async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const io = memoryStreams();
		const prompt = "prose run inspector.prose.md --flag='two words'";
		const harness = createHarness("codex", { runner: recordingRunner(calls) });

		await harness.run(prompt, { ...io.options });

		expect(calls).toEqual([
			{
				command: "codex",
				args: ["exec", "--skip-git-repo-check", "--ephemeral", prompt],
			},
		]);
	});

	test("codex CLI injects OpenProse bootstrap as developer instructions", async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const io = memoryStreams();
		const prompt = "prose run inspector.prose.md";
		const bootstrap = "OPEN_PROSE_BOOTSTRAP\nwith newline";
		const harness = createHarness("codex", { runner: recordingRunner(calls) });

		await harness.run(prompt, {
			...io.options,
			additionalDirectories: ["/skills/open-prose"],
			env: { HOME: "/home/prose" },
			systemPromptAppend: bootstrap,
		});

			expect(calls).toEqual([
				{
					command: "codex",
					args: [
						"exec",
						"--skip-git-repo-check",
						"--ephemeral",
						"--add-dir",
						"/skills/open-prose",
						"--config",
						`developer_instructions=${JSON.stringify(bootstrap)}`,
						prompt,
					],
				},
			]);
		});

	test("codex CLI maps OPENAI_API_KEY to CODEX_API_KEY", async () => {
		let env: Record<string, string | undefined> | undefined;
		const io = memoryStreams();
		const runner: ProcessRunner = async (_command, _args, options) => {
			env = options.env;
			return { exitCode: 0 };
		};
		const harness = createHarness("codex", { runner });

		await harness.run("prose run inspector.prose.md", {
			...io.options,
			env: { OPENAI_API_KEY: "openai-key" },
		});

		expect(env?.CODEX_API_KEY).toBe("openai-key");
	});

	test("codex CLI forwards requested sandbox and approval settings", async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const io = memoryStreams();
		const prompt = "prose run inspector.prose.md";
		const harness = createHarness("codex", { runner: recordingRunner(calls) });

		await harness.run(prompt, {
			...io.options,
			env: {
				PROSE_CODEX_APPROVAL_POLICY: "never",
				PROSE_CODEX_SANDBOX_MODE: "danger-full-access",
			},
		});

			expect(calls).toEqual([
				{
					command: "codex",
					args: [
						"exec",
						"--skip-git-repo-check",
						"--ephemeral",
						"--sandbox",
						"danger-full-access",
						"--config",
						'approval_policy="never"',
						prompt,
					],
				},
			]);
		});

	test("node runner streams stdout/stderr and reports signal exits", async () => {
		const io = memoryStreams();
		const result = await nodeProcessRunner(process.execPath, ["-e", "console.log('before'); process.kill(process.pid, 'SIGTERM')"], {
			...io.options,
		});

		expect(io.stdout).toContain("before");
		expect(result.exitCode).toBe(143);
	});

	test("node runner resolves aborts with shell-style exit code", async () => {
		const io = memoryStreams();
		const controller = new AbortController();
		const resultPromise = nodeProcessRunner(
			process.execPath,
			["-e", "console.log('started'); setInterval(() => {}, 1000);"],
			{ ...io.options, signal: controller.signal },
		);

		await waitFor(() => io.stdout.includes("started"));
		controller.abort("SIGTERM");

		const result = await resultPromise;
		expect(io.stdout).toContain("started");
		expect(result.exitCode).toBe(143);
	});
});

describe("harness selection", () => {
	test("resolves supported harness names and rejects unknown names", () => {
		expect(resolveHarnessName("codex-sdk")).toBe("codex-sdk");
		expect(resolveHarnessName("claude-sdk")).toBe("claude-sdk");
		expect(() => resolveHarnessName("missing")).toThrow(
			"Unsupported harness: missing. Expected one of: codex-sdk, claude-sdk, codex, mock",
		);
		expect(() => resolveHarnessName("claude")).toThrow(
			"Unsupported harness: claude. Expected one of: codex-sdk, claude-sdk, codex, mock",
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
				PROSE_CODEX_APPROVAL_POLICY: "never",
				PROSE_CODEX_SANDBOX_MODE: "danger-full-access",
			},
		});

		expect(exitCode).toBe(0);
		expect(starts).toEqual([{ approvalPolicy: "never", sandboxMode: "danger-full-access", skipGitRepoCheck: true }]);
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
});
