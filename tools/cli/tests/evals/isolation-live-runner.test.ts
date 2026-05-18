import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { appendKernelEffect } from "../../src/evals/isolation/effect-log.js";
import {
	appendProxyModelCallRecord,
	type ProxyModelCallRecord,
} from "../../src/evals/isolation/egress-proxy.js";
import {
	runDockerIsolation,
	type DockerComposeRunOptions,
	type DockerComposeRunner,
	type DockerIsolationLiveRunnerOptions,
} from "../../src/evals/isolation/live-runner.js";
import type { KernelEffectLogEntry } from "../../src/evals/isolation/types.js";

const PROXY_TOKEN = "test-proxy-token";
const PROJECT_NAME = "prose-live-runner";

describe("Docker isolation live runner", () => {
	test("runs compose up and down around a generated compose file", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-live-runner-"));
		try {
			const paths = createPaths(root);
			const composeRunner = new FakeComposeRunner();

			const result = await runDockerIsolation({
				...baseOptions(paths),
				composeProjectName: PROJECT_NAME,
				composeRunner,
			});

			expect(composeRunner.calls.map((call) => subcommand(call.args))).toEqual(["up", "down"]);
			expect(composeRunner.calls[0]?.args).toEqual([
				"--project-name",
				PROJECT_NAME,
				"-f",
				result.composeFilePath,
				"up",
				"--abort-on-container-exit",
				"--exit-code-from",
				"harness",
			]);
			expect(composeRunner.calls[1]?.args).toEqual([
				"--project-name",
				PROJECT_NAME,
				"-f",
				result.composeFilePath,
				"down",
				"--volumes",
				"--remove-orphans",
			]);
			expect(readFileSync(result.composeFilePath, "utf8")).toContain("services:");
			expect(result.status).toBe("passed");
			expect(result.exitCode).toBe(0);
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	});

	test("injects proxy auth and model-call log env into the harness and proxy services", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-live-runner-auth-"));
		try {
			const paths = createPaths(root);
			const result = await runDockerIsolation({
				...baseOptions(paths),
				composeProjectName: PROJECT_NAME,
				composeRunner: new FakeComposeRunner(),
			});
			const compose = result.plan.compose as unknown as ComposePlan;
			const harness = service(compose, "harness");
			const proxy = service(compose, "egress-proxy");

			expect(harness.environment).toEqual(
				expect.objectContaining({
					ALL_PROXY: result.plan.egressProxyUrl,
					PROSE_EVAL_EGRESS_PROXY_AUTHORIZATION: `Bearer ${PROXY_TOKEN}`,
					PROSE_EVAL_EGRESS_PROXY_TOKEN: PROXY_TOKEN,
					PROSE_EVAL_EGRESS_PROXY_URL: result.plan.egressProxyUrl,
				}),
			);
			expect(proxy.environment).toEqual(
				expect.objectContaining({
					PROSE_EVAL_EGRESS_PROXY_PORT: "3128",
					PROSE_EVAL_EGRESS_PROXY_TOKEN: PROXY_TOKEN,
					PROSE_EVAL_MODEL_CALL_LOG_PATH: "/artifacts/model-calls.jsonl",
				}),
			);
			expect(proxy.volumes).toEqual([
				{
					type: "bind",
					source: paths.artifactHostPath,
					target: "/artifacts",
				},
			]);
			expect(result.plan.modelCallLogPath).toBe(join(paths.artifactHostPath, "model-calls.jsonl"));
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	});

	test("ingests proxy-minted ModelCall records from the artifact log", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-live-runner-model-calls-"));
		try {
			const paths = createPaths(root);
			const modelCall = modelCallRecord();
			const composeRunner = new FakeComposeRunner((args) => {
				if (subcommand(args) === "up") {
					appendProxyModelCallRecord(join(paths.artifactHostPath, "model-calls.jsonl"), modelCall);
				}
			});

			const result = await runDockerIsolation({
				...baseOptions(paths),
				composeProjectName: PROJECT_NAME,
				composeRunner,
			});

			expect(result.status).toBe("passed");
			expect(result.modelCalls).toEqual([modelCall]);
			expect(result.effects).toEqual([]);
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	});

	test("fails closed when kernel effects are not covered by allowed Action cids", async () => {
		const root = mkdtempSync(join(tmpdir(), "prose-live-runner-effects-"));
		try {
			const paths = createPaths(root);
			const allowedActionCid = "a".repeat(64);
			const covered = effect({ id: "covered", actionCid: allowedActionCid, effectTag: "network.request" });
			const uncovered = effect({ id: "uncovered", actionCid: "b".repeat(64), effectTag: "file.write" });
			const composeRunner = new FakeComposeRunner((args) => {
				if (subcommand(args) === "up") {
					appendKernelEffect(join(paths.artifactHostPath, "effects.jsonl"), covered);
					appendKernelEffect(join(paths.artifactHostPath, "effects.jsonl"), uncovered);
				}
			});

			const result = await runDockerIsolation({
				...baseOptions(paths),
				allowedActionCids: [allowedActionCid],
				composeProjectName: PROJECT_NAME,
				composeRunner,
			});

			expect(result.status).toBe("failed");
			expect(result.exitCode).toBe(1);
			expect(result.effectReconciliation.reconciled).toEqual([covered]);
			expect(result.effectReconciliation.unreconciled).toEqual([uncovered]);
			expect(result.failureReasons).toContain("unreconciled kernel effects: 1");
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	});
});

interface TestPaths {
	artifactHostPath: string;
	workspaceHostPath: string;
}

interface ComposePlan {
	services: Record<string, ComposeService>;
}

interface ComposeService {
	environment: Record<string, string>;
	volumes?: ComposeVolume[];
}

interface ComposeVolume {
	source: string;
	target: string;
	type: string;
}

interface ComposeCall {
	args: string[];
	options: DockerComposeRunOptions;
}

type ComposeHook = (args: readonly string[], options: DockerComposeRunOptions) => void | Promise<void>;

class FakeComposeRunner implements DockerComposeRunner {
	readonly calls: ComposeCall[] = [];

	constructor(private readonly hook?: ComposeHook) {}

	async run(args: readonly string[], options: DockerComposeRunOptions): Promise<{ exitCode: number }> {
		this.calls.push({ args: [...args], options });
		await this.hook?.(args, options);
		return { exitCode: 0 };
	}
}

function createPaths(root: string): TestPaths {
	const workspaceHostPath = join(root, "workspace");
	const artifactHostPath = join(root, "artifacts");
	mkdirSync(workspaceHostPath, { recursive: true });

	return { artifactHostPath, workspaceHostPath };
}

function baseOptions(paths: TestPaths): DockerIsolationLiveRunnerOptions {
	return {
		artifactHostPath: paths.artifactHostPath,
		egressProxyToken: PROXY_TOKEN,
		harnessImage: "prose-eval-harness:test",
		identity: {
			adapterName: "mock",
			attemptId: "run-1:case-1:1",
			caseId: "case-1",
			runId: "run-1",
		},
		workspaceHostPath: paths.workspaceHostPath,
	};
}

function service(compose: ComposePlan, name: string): ComposeService {
	const found = compose.services[name];
	if (found === undefined) {
		throw new Error(`missing compose service: ${name}`);
	}

	return found;
}

function subcommand(args: readonly string[]): string | undefined {
	return args.find((arg) => arg === "up" || arg === "down");
}

function modelCallRecord(): ProxyModelCallRecord {
	return {
		cid: "1".repeat(64),
		completion_tokens: 7,
		decision_cid: "2".repeat(64),
		metadata: {
			request: {
				body_bytes: 42,
				headers: {
					authorization: "[REDACTED]",
					"content-type": "application/json",
				},
				method: "POST",
				url: "https://api.openai.com/v1/chat/completions",
			},
			response: {
				body_bytes: 84,
				headers: {
					"content-type": "application/json",
				},
				status: 200,
				status_text: "OK",
			},
		},
		model_version: "gpt-test-2026-05-17",
		prompt_tokens: 12,
		provider: "openai",
		request_cid: "3".repeat(64),
		response_cid: "4".repeat(64),
		type: "ModelCall",
	};
}

function effect(overrides: Partial<KernelEffectLogEntry>): KernelEffectLogEntry {
	return {
		at: "2026-05-17T12:00:00.000Z",
		effectTag: "exec.spawn",
		id: "effect",
		kind: "network",
		...overrides,
	};
}
