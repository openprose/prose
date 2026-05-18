import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { isAbsolute, join, posix } from "node:path";

import type { JsonObject } from "../types.js";
import type { IsolationRunIdentity, IsolationSubstratePlan } from "./types.js";

const DEFAULT_HARNESS_SERVICE_NAME = "harness";
const DEFAULT_EGRESS_PROXY_SERVICE_NAME = "egress-proxy";
const DEFAULT_INTERNAL_NETWORK_NAME = "prose-eval-internal";
const DEFAULT_EGRESS_NETWORK_NAME = "prose-eval-egress";
const DEFAULT_WORKSPACE_TARGET_PATH = "/workspace";
const DEFAULT_ARTIFACT_TARGET_PATH = "/artifacts";
const DEFAULT_EFFECT_LOG_FILE_NAME = "effects.jsonl";
const DEFAULT_MODEL_CALL_LOG_FILE_NAME = "model-calls.jsonl";
const DEFAULT_EGRESS_PROXY_PORT = 3128;
export const DEFAULT_EGRESS_PROXY_IMAGE = "eval-egress-proxy:local";
const DEFAULT_EGRESS_PROXY_UPSTREAM_BASE_URL = "https://openrouter.ai";
const DEFAULT_EGRESS_PROXY_UPSTREAM_AUTHORIZATION = "Bearer ${OPENROUTER_API_KEY}";

const SAFE_DOCKER_NAME = /^[a-z][a-z0-9-]{0,62}$/;
const SAFE_ARTIFACT_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface DockerIsolationPlanOptions {
	artifactHostPath: string;
	harnessImage: string;
	identity: IsolationRunIdentity;
	workspaceHostPath: string;
	artifactTargetPath?: string;
	command?: readonly string[];
	egressNetworkName?: string;
	egressProxyImage?: string;
	egressProxyDecisionCid?: string;
	egressProxyPort?: number;
	egressProxyServiceName?: string;
	egressProxyToken?: string;
	egressProxyUpstreamAuthorization?: string;
	egressProxyUpstreamBaseUrl?: string;
	environment?: Readonly<Record<string, string | undefined>>;
	harnessServiceName?: string;
	modelCallLogFileName?: string;
	networkName?: string;
	readOnlyRootFilesystem?: boolean;
	workspaceTargetPath?: string;
}

export function createDockerIsolationPlan(options: DockerIsolationPlanOptions): IsolationSubstratePlan {
	const harnessServiceName = assertSafeDockerName(
		options.harnessServiceName ?? DEFAULT_HARNESS_SERVICE_NAME,
		"harnessServiceName",
	);
	const egressProxyServiceName = assertSafeDockerName(
		options.egressProxyServiceName ?? DEFAULT_EGRESS_PROXY_SERVICE_NAME,
		"egressProxyServiceName",
	);
	const networkName = assertSafeDockerName(options.networkName ?? DEFAULT_INTERNAL_NETWORK_NAME, "networkName");
	const egressNetworkName = assertSafeDockerName(
		options.egressNetworkName ?? DEFAULT_EGRESS_NETWORK_NAME,
		"egressNetworkName",
	);
	assertDistinct(harnessServiceName, egressProxyServiceName, "harnessServiceName", "egressProxyServiceName");
	assertDistinct(networkName, egressNetworkName, "networkName", "egressNetworkName");

	const workspaceHostPath = assertAbsoluteHostPath(options.workspaceHostPath, "workspaceHostPath");
	const artifactHostPath = assertAbsoluteHostPath(options.artifactHostPath, "artifactHostPath");
	const workspaceTargetPath = assertAbsoluteContainerPath(
		options.workspaceTargetPath ?? DEFAULT_WORKSPACE_TARGET_PATH,
		"workspaceTargetPath",
	);
	const artifactTargetPath = assertAbsoluteContainerPath(
		options.artifactTargetPath ?? DEFAULT_ARTIFACT_TARGET_PATH,
		"artifactTargetPath",
	);
	const proxyPort = options.egressProxyPort ?? DEFAULT_EGRESS_PROXY_PORT;
	if (!Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65_535) {
		throw new Error(`egressProxyPort must be an integer TCP port: ${proxyPort}`);
	}
	const egressProxyToken = assertNonEmptyString(
		options.egressProxyToken ?? randomBytes(32).toString("hex"),
		"egressProxyToken",
	);
	const decisionCid = assertHexCid(options.egressProxyDecisionCid ?? defaultDecisionCid(options.identity), "egressProxyDecisionCid");
	const modelCallLogFileName = assertSafeArtifactFileName(
		options.modelCallLogFileName ?? DEFAULT_MODEL_CALL_LOG_FILE_NAME,
		"modelCallLogFileName",
	);

	const effectLogPath = join(artifactHostPath, DEFAULT_EFFECT_LOG_FILE_NAME);
	const modelCallLogPath = join(artifactHostPath, modelCallLogFileName);
	const containerEffectLogPath = posix.join(artifactTargetPath, DEFAULT_EFFECT_LOG_FILE_NAME);
	const containerModelCallLogPath = posix.join(artifactTargetPath, modelCallLogFileName);
	const egressProxyUrl = `http://${egressProxyServiceName}:${proxyPort}`;
	const egressProxyApiBaseUrl = `${egressProxyUrl}/api/v1`;
	const readOnlyRootFilesystem = options.readOnlyRootFilesystem ?? true;
	const noProxy = `localhost,127.0.0.1,::1,${egressProxyServiceName}`;

	const harnessEnvironment = sortedStringRecord({
		...options.environment,
		ALL_PROXY: egressProxyUrl,
		HTTP_PROXY: egressProxyUrl,
		HTTPS_PROXY: egressProxyUrl,
		NO_PROXY: noProxy,
		OPENAI_API_BASE: egressProxyApiBaseUrl,
		OPENAI_API_KEY: egressProxyToken,
		OPENAI_BASE_URL: egressProxyApiBaseUrl,
		OPENROUTER_API_BASE: egressProxyApiBaseUrl,
		OPENROUTER_API_KEY: egressProxyToken,
		OPENROUTER_BASE_URL: egressProxyApiBaseUrl,
		PROSE_EVAL_DECISION_CID: decisionCid,
		PROSE_EVAL_EFFECT_LOG_PATH: containerEffectLogPath,
		PROSE_EVAL_EGRESS_PROXY_AUTHORIZATION: `Bearer ${egressProxyToken}`,
		PROSE_EVAL_EGRESS_PROXY_TOKEN: egressProxyToken,
		PROSE_EVAL_EGRESS_PROXY_URL: egressProxyUrl,
		all_proxy: egressProxyUrl,
		http_proxy: egressProxyUrl,
		https_proxy: egressProxyUrl,
		no_proxy: noProxy,
	});

	const harnessService: JsonObject = {
		image: options.harnessImage,
		...(options.command === undefined ? {} : { command: [...options.command] }),
		cap_drop: ["ALL"],
		depends_on: [egressProxyServiceName],
		environment: harnessEnvironment,
		networks: [networkName],
		read_only: readOnlyRootFilesystem,
		security_opt: ["no-new-privileges:true"],
		tmpfs: ["/tmp:rw,noexec,nosuid,size=256m"],
		volumes: [
			{
				type: "bind",
				source: workspaceHostPath,
				target: workspaceTargetPath,
			},
			{
				type: "bind",
				source: artifactHostPath,
				target: artifactTargetPath,
			},
		],
		working_dir: workspaceTargetPath,
	};

	const egressProxyService: JsonObject = {
		image: options.egressProxyImage ?? DEFAULT_EGRESS_PROXY_IMAGE,
		cap_drop: ["ALL"],
		environment: sortedStringRecord({
			PROSE_EVAL_EGRESS_DECISION_CID: decisionCid,
			PROSE_EVAL_EGRESS_PROXY_PORT: `${proxyPort}`,
			PROSE_EVAL_EGRESS_PROXY_TOKEN: egressProxyToken,
			PROSE_EVAL_EGRESS_UPSTREAM_AUTHORIZATION:
				options.egressProxyUpstreamAuthorization ?? DEFAULT_EGRESS_PROXY_UPSTREAM_AUTHORIZATION,
			PROSE_EVAL_EGRESS_UPSTREAM_BASE_URL:
				options.egressProxyUpstreamBaseUrl ?? DEFAULT_EGRESS_PROXY_UPSTREAM_BASE_URL,
			PROSE_EVAL_MODEL_CALL_LOG_PATH: containerModelCallLogPath,
		}),
		expose: [`${proxyPort}`],
		networks: [networkName, egressNetworkName],
		read_only: readOnlyRootFilesystem,
		security_opt: ["no-new-privileges:true"],
		tmpfs: ["/tmp:rw,noexec,nosuid,size=128m"],
		volumes: [
			{
				type: "bind",
				source: artifactHostPath,
				target: artifactTargetPath,
			},
		],
	};

	return {
		compose: {
			services: {
				[harnessServiceName]: harnessService,
				[egressProxyServiceName]: egressProxyService,
			},
			networks: {
				[networkName]: {
					internal: true,
				},
				[egressNetworkName]: {},
			},
		},
		effectLogPath,
		egressProxyUrl,
		identity: options.identity,
		kind: "docker-compose",
		modelCallLogPath,
		networkName,
		workDirectory: workspaceTargetPath,
	};
}

function defaultDecisionCid(identity: IsolationRunIdentity): string {
	return createHash("sha256")
		.update(`${identity.runId}\0${identity.caseId}\0${identity.attemptId}\0${identity.adapterName}`)
		.digest("hex");
}

function assertHexCid(value: string, path: string): string {
	if (!/^[a-f0-9]{64}$/.test(value)) {
		throw new Error(`${path} must be a 64-character lowercase hex cid: ${value}`);
	}

	return value;
}

function assertSafeDockerName(value: string, path: string): string {
	if (!SAFE_DOCKER_NAME.test(value)) {
		throw new Error(`${path} must be a safe Docker service or network name: ${value}`);
	}

	return value;
}

function assertAbsoluteHostPath(value: string, path: string): string {
	if (!isAbsolute(value)) {
		throw new Error(`${path} must be an absolute host path: ${value}`);
	}

	return value;
}

function assertAbsoluteContainerPath(value: string, path: string): string {
	if (!value.startsWith("/")) {
		throw new Error(`${path} must be an absolute container path: ${value}`);
	}

	return value;
}

function assertSafeArtifactFileName(value: string, path: string): string {
	if (!SAFE_ARTIFACT_FILE_NAME.test(value)) {
		throw new Error(`${path} must be a safe artifact file name: ${value}`);
	}

	return value;
}

function assertNonEmptyString(value: string, path: string): string {
	if (value.trim() === "") {
		throw new Error(`${path} must be a non-empty string`);
	}

	return value;
}

function assertDistinct(left: string, right: string, leftPath: string, rightPath: string): void {
	if (left === right) {
		throw new Error(`${leftPath} and ${rightPath} must be distinct: ${left}`);
	}
}

function sortedStringRecord(input: Readonly<Record<string, string | undefined>>): Record<string, string> {
	const output: Record<string, string> = {};
	for (const key of Object.keys(input).sort()) {
		const value = input[key];
		if (value !== undefined) {
			output[key] = value;
		}
	}

	return output;
}
