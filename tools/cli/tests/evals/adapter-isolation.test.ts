import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	EVAL_TASK_KIND,
	createDspyRlmEvalAdapter,
	createHermesEvalAdapter,
	createPiEvalAdapter,
	createProcessEvalAdapter,
	type EvalAdapterContext,
	type EvalTask,
} from "../../src/evals/index.js";

const task: EvalTask = {
	kind: EVAL_TASK_KIND,
	id: "adapter-isolation",
	title: "Adapter isolation",
	prompt: "echo isolation",
	expected: {
		exitCode: 0,
	},
};

const runDirectory = "/tmp/prose-adapter-isolation";

describe("eval adapter isolation", () => {
	test("keeps protected isolation env from caller overrides", async () => {
		const piCalls: PiCall[] = [];
		const pi = createPiEvalAdapter({
			env: {
				PI_CODING_AGENT_DIR: "/caller/options/pi-agent",
				PI_CODING_AGENT_SESSION_DIR: "/caller/options/pi-sessions",
				PI_OFFLINE: "0",
				PI_SKIP_VERSION_CHECK: "0",
			},
			rpcRunner: async (_command, _args, options) => {
				piCalls.push({ cwd: options.cwd, env: options.env });
				return {
					exitCode: 0,
					lastAssistantText: "ok",
					records: [],
					stderr: "",
					stdout: "",
				};
			},
			writeTranscript: false,
		});

		await pi.runTask(
			task,
			context({
				env: {
					PI_CODING_AGENT_DIR: "/caller/context/pi-agent",
					PI_CODING_AGENT_SESSION_DIR: "/caller/context/pi-sessions",
					PI_OFFLINE: "0",
					PI_SKIP_VERSION_CHECK: "0",
				},
			}),
		);

		expect(piCalls[0]?.cwd).toBe(runDirectory);
		expect(piCalls[0]?.env).toEqual(
			expect.objectContaining({
				PI_CODING_AGENT_DIR: join(runDirectory, "pi-agent"),
				PI_CODING_AGENT_SESSION_DIR: join(runDirectory, "pi-sessions"),
				PI_OFFLINE: "1",
				PI_SKIP_VERSION_CHECK: "1",
			}),
		);

		const hermesCalls: ProcessCall[] = [];
		const hermes = createHermesEvalAdapter({
			env: {
				HERMES_HOME: "/caller/options/hermes",
				HERMES_REDACT_SECRETS: "0",
			},
			runner: async (_command, _args, options) => {
				hermesCalls.push({ cwd: options.cwd, env: options.env });
				options.stdout.write("ok");
				return { exitCode: 0 };
			},
		});

		await hermes.runTask(
			task,
			context({
				env: {
					HERMES_HOME: "/caller/context/hermes",
					HERMES_REDACT_SECRETS: "0",
				},
			}),
		);

		expect(hermesCalls[0]?.cwd).toBe(runDirectory);
		expect(hermesCalls[0]?.env).toEqual(
			expect.objectContaining({
				HERMES_HOME: join(runDirectory, "hermes-home"),
				HERMES_REDACT_SECRETS: "1",
			}),
		);

		const dspyCalls: ProcessCall[] = [];
		const dspy = createDspyRlmEvalAdapter({
			env: {
				DENO_DIR: "/caller/options/deno",
				DSPY_CACHEDIR: "/caller/options/dspy",
				DSPY_DISABLE_LOGGING: "0",
			},
			runner: async (_command, _args, options) => {
				dspyCalls.push({ cwd: options.cwd, env: options.env });
				options.stdout.write("ok");
				return { exitCode: 0 };
			},
		});

		await dspy.runTask(
			task,
			context({
				env: {
					DENO_DIR: "/caller/context/deno",
					DSPY_CACHEDIR: "/caller/context/dspy",
					DSPY_DISABLE_LOGGING: "0",
				},
			}),
		);

		expect(dspyCalls[0]?.cwd).toBe(runDirectory);
		expect(dspyCalls[0]?.env).toEqual(
			expect.objectContaining({
				DENO_DIR: join(runDirectory, "deno-cache"),
				DSPY_CACHEDIR: join(runDirectory, "dspy-cache"),
				DSPY_DISABLE_LOGGING: "1",
			}),
		);
	});

	test("defaults process adapter cwd to the adapter run directory", async () => {
		let observedCwd: string | undefined;
		const adapter = createProcessEvalAdapter({
			command: "agent-cli",
			name: "process-isolation",
			runner: async (_command, _args, options) => {
				observedCwd = options.cwd;
				options.stdout.write("ok");
				return { exitCode: 0 };
			},
		});

		await adapter.runTask(task, context());

		expect(observedCwd).toBe(runDirectory);
	});

	test("redacts inherited process env secrets echoed by process adapters", async () => {
		const key = "PROSE_EVAL_INHERITED_SECRET_TOKEN";
		const secret = "inherited-env-secret-value-12345";
		const previous = process.env[key];
		process.env[key] = secret;
		try {
			const adapter = createProcessEvalAdapter({
				args: ["-e", `process.stdout.write(process.env[${JSON.stringify(key)}] ?? "")`],
				command: process.execPath,
				name: "node-echo",
			});

			const result = await adapter.runTask(task, context({ adapterRunDirectory: undefined }));

			expect(result.stdout).toBe("[REDACTED]");
			expect(result.stdout).not.toContain(secret);
		} finally {
			if (previous === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = previous;
			}
		}
	});
});

interface PiCall {
	cwd?: string | undefined;
	env?: Record<string, string | undefined> | undefined;
}

interface ProcessCall {
	cwd?: string | undefined;
	env?: Record<string, string | undefined> | undefined;
}

function context(options: ContextOptions = {}): EvalAdapterContext {
	const adapterRunDirectory = Object.hasOwn(options, "adapterRunDirectory")
		? options.adapterRunDirectory
		: runDirectory;
	return {
		...(adapterRunDirectory === undefined ? {} : { adapterRunDirectory }),
		...(options.env === undefined ? {} : { env: options.env }),
		attemptId: "run-1:adapter-isolation:1",
		runId: "run-1",
		startedAt: "2026-05-17T12:00:00.000Z",
	};
}

interface ContextOptions {
	adapterRunDirectory?: string | undefined;
	env?: Record<string, string | undefined>;
}
