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

describe("process harnesses", () => {
	test("claude preserves prompt as a single -p argument and streams output", async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const io = memoryStreams();
		const prompt = "prose run inspector.md\nkeep whitespace  ";
		const harness = createHarness("claude", { runner: recordingRunner(calls) });

		const exitCode = await harness.run(prompt, { ...io.options });

		expect(exitCode).toBe(3);
		expect(calls).toEqual([{ command: "claude", args: ["-p", prompt] }]);
		expect(io.stdout).toBe("tool out");
		expect(io.stderr).toBe("tool err");
	});

	test("codex CLI builds codex exec with the exact prompt", async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const io = memoryStreams();
		const prompt = "prose run inspector.md --flag='two words'";
		const harness = createHarness("codex", { runner: recordingRunner(calls) });

		await harness.run(prompt, { ...io.options, env: { HOME: "/home/prose" } });

		expect(calls).toEqual([
			{
				command: "codex",
				args: [
					"exec",
					"--skip-git-repo-check",
					"--sandbox",
					"workspace-write",
					"--config",
					'approval_policy="never"',
					"--add-dir",
					"/home/prose/.codex",
					"--config",
					"sandbox_workspace_write.network_access=true",
					"--config",
					"shell_environment_policy.inherit=all",
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

		await harness.run("prose run inspector.md", {
			...io.options,
			env: { OPENAI_API_KEY: "openai-key" },
		});

		expect(env?.CODEX_API_KEY).toBe("openai-key");
	});

	test("codex CLI forwards requested sandbox and approval settings", async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const io = memoryStreams();
		const prompt = "prose run inspector.md";
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
					"--sandbox",
					"danger-full-access",
					"--config",
					'approval_policy="never"',
					"--config",
					"shell_environment_policy.inherit=all",
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

		await new Promise((resolve) => setTimeout(resolve, 50));
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
			"Unsupported harness: missing. Expected one of: codex-sdk, claude-sdk, codex, claude, mock",
		);
	});

	test("selects mock harness", async () => {
		const io = memoryStreams();
		const harness = createHarness("mock", { mock: { response: "ok" } });

		await expect(harness.run("prose run inspector.md", { ...io.options })).resolves.toBe(0);
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
							expect(prompt).toBe("prose run inspector.md");
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

		const exitCode = await createCodexSdkHarness({ factory }).run("prose run inspector.md", {
			...io.options,
			cwd: "/repo",
			env: { OPENAI_API_KEY: "test", HOME: "/home/prose", EMPTY: undefined },
			signal,
		});

		expect(exitCode).toBe(0);
		expect(io.stdout).toBe("sdk output\n");
		expect(starts).toEqual([
			{
				additionalDirectories: ["/home/prose/.codex"],
				approvalPolicy: "never",
				networkAccessEnabled: true,
				sandboxMode: "workspace-write",
				skipGitRepoCheck: true,
				workingDirectory: "/repo",
			},
		]);
		expect(factoryOptions).toEqual([
			{
				apiKey: "test",
				config: { shell_environment_policy: { inherit: "all" } },
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

		const exitCode = await createCodexSdkHarness({ factory }).run("prose run inspector.md", {
			...io.options,
			env: {
				PROSE_CODEX_APPROVAL_POLICY: "never",
				PROSE_CODEX_SANDBOX_MODE: "danger-full-access",
			},
		});

		expect(exitCode).toBe(0);
		expect(starts).toEqual([
			{
				approvalPolicy: "never",
				sandboxMode: "danger-full-access",
				skipGitRepoCheck: true,
			},
		]);
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
