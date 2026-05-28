import { isAbsolute, join, relative } from "node:path";

import { describe, expect, test } from "vitest";

import {
	DEFAULT_EGRESS_PROXY_IMAGE,
	createDockerIsolationPlan,
	type DockerIsolationPlanOptions,
} from "../../src/evals/isolation/docker-substrate.js";

const workspaceHostPath = "/tmp/prose-eval-workspace";
const artifactHostPath = "/tmp/prose-eval-artifacts";

describe("Docker isolation substrate planner", () => {
	test("connects the harness to the internal egress proxy network and proxy env", () => {
		const plan = createDockerIsolationPlan(baseOptions());
		const compose = plan.compose as unknown as ComposePlan;
		const harness = service(compose, "harness");
		const proxy = service(compose, "egress-proxy");

		expect(compose.networks[plan.networkName]).toEqual({ internal: true });
		expect(harness.read_only).toBe(true);
		expect(harness.networks).toEqual([plan.networkName]);
		expect(proxy.networks).toContain(plan.networkName);
		expect(proxy.networks).toContain("prose-eval-egress");
		expect(proxy.image).toBe(DEFAULT_EGRESS_PROXY_IMAGE);
		expect(harness.environment).toEqual(
			expect.objectContaining({
				ALL_PROXY: plan.egressProxyUrl,
				HTTP_PROXY: plan.egressProxyUrl,
				HTTPS_PROXY: plan.egressProxyUrl,
				NO_PROXY: "localhost,127.0.0.1,::1,egress-proxy",
				OPENAI_BASE_URL: `${plan.egressProxyUrl}/api/v1`,
				OPENROUTER_BASE_URL: `${plan.egressProxyUrl}/api/v1`,
				PROSE_EVAL_EFFECT_LOG_PATH: "/artifacts/effects.jsonl",
				PROSE_EVAL_DECISION_CID: expect.stringMatching(/^[a-f0-9]{64}$/),
				PROSE_EVAL_EGRESS_PROXY_URL: plan.egressProxyUrl,
				all_proxy: plan.egressProxyUrl,
				http_proxy: plan.egressProxyUrl,
				https_proxy: plan.egressProxyUrl,
				no_proxy: "localhost,127.0.0.1,::1,egress-proxy",
			}),
		);
	});

	test("mounts workspace and artifact host paths into the harness", () => {
		const plan = createDockerIsolationPlan(baseOptions());
		const compose = plan.compose as unknown as ComposePlan;
		const harness = service(compose, "harness");

		expect(harness.volumes).toEqual(
			expect.arrayContaining([
				{
					type: "bind",
					source: workspaceHostPath,
					target: "/workspace",
				},
				{
					type: "bind",
					source: artifactHostPath,
					target: "/artifacts",
				},
			]),
		);
	});

	test("keeps upstream OpenRouter authorization on the proxy service placeholder", () => {
		const plan = createDockerIsolationPlan(baseOptions({ egressProxyToken: "proxy-token" }));
		const compose = plan.compose as unknown as ComposePlan;
		const harness = service(compose, "harness");
		const proxy = service(compose, "egress-proxy");

		expect(harness.environment.OPENROUTER_API_KEY).toBe("proxy-token");
		expect(proxy.environment).toEqual(
			expect.objectContaining({
				PROSE_EVAL_EGRESS_DECISION_CID: expect.stringMatching(/^[a-f0-9]{64}$/),
				PROSE_EVAL_EGRESS_UPSTREAM_AUTHORIZATION: "Bearer ${OPENROUTER_API_KEY}",
				PROSE_EVAL_EGRESS_UPSTREAM_BASE_URL: "https://openrouter.ai",
			}),
		);
	});

	test("keeps the host effect log path under the artifact directory", () => {
		const plan = createDockerIsolationPlan(baseOptions());
		const effectLogRelativePath = relative(artifactHostPath, plan.effectLogPath);

		expect(plan.effectLogPath).toBe(join(artifactHostPath, "effects.jsonl"));
		expect(isAbsolute(plan.effectLogPath)).toBe(true);
		expect(effectLogRelativePath).toBe("effects.jsonl");
		expect(effectLogRelativePath.startsWith("..")).toBe(false);
	});

	test("rejects unsafe Docker names and relative host paths", () => {
		expect(() => createDockerIsolationPlan(baseOptions({ harnessServiceName: "../harness" }))).toThrow(
			"harnessServiceName",
		);
		expect(() => createDockerIsolationPlan(baseOptions({ networkName: "bad network" }))).toThrow("networkName");
		expect(() => createDockerIsolationPlan(baseOptions({ workspaceHostPath: "workspace" }))).toThrow(
			"workspaceHostPath",
		);
		expect(() => createDockerIsolationPlan(baseOptions({ artifactHostPath: "artifacts" }))).toThrow(
			"artifactHostPath",
		);
	});
});

function baseOptions(overrides: Partial<DockerIsolationPlanOptions> = {}): DockerIsolationPlanOptions {
	return {
		artifactHostPath,
		harnessImage: "prose-eval-harness:test",
		identity: {
			adapterName: "mock",
			attemptId: "run-1:case-1:1",
			caseId: "case-1",
			runId: "run-1",
		},
		workspaceHostPath,
		...overrides,
	};
}

interface ComposePlan {
	services: Record<string, ComposeService>;
	networks: Record<string, ComposeNetwork>;
}

interface ComposeService {
	image: string;
	environment: Record<string, string>;
	networks: string[];
	read_only: boolean;
	volumes: ComposeVolume[];
}

interface ComposeNetwork {
	internal?: boolean;
}

interface ComposeVolume {
	source: string;
	target: string;
	type: string;
}

function service(compose: ComposePlan, name: string): ComposeService {
	const found = compose.services[name];
	if (found === undefined) {
		throw new Error(`missing compose service: ${name}`);
	}

	return found;
}
