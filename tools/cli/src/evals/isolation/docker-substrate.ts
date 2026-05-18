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
const DEFAULT_EGRESS_PROXY_PORT = 3128;
const DEFAULT_EGRESS_PROXY_IMAGE = "ghcr.io/openprose/eval-egress-proxy:0.1.0";

const SAFE_DOCKER_NAME = /^[a-z][a-z0-9-]{0,62}$/;

export interface DockerIsolationPlanOptions {
	artifactHostPath: string;
	harnessImage: string;
	identity: IsolationRunIdentity;
	workspaceHostPath: string;
	artifactTargetPath?: string;
	command?: readonly string[];
	egressNetworkName?: string;
	egressProxyImage?: string;
	egressProxyPort?: number;
	egressProxyServiceName?: string;
	environment?: Readonly<Record<string, string | undefined>>;
	harnessServiceName?: string;
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

	const effectLogPath = join(artifactHostPath, DEFAULT_EFFECT_LOG_FILE_NAME);
	const containerEffectLogPath = posix.join(artifactTargetPath, DEFAULT_EFFECT_LOG_FILE_NAME);
	const egressProxyUrl = `http://${egressProxyServiceName}:${proxyPort}`;
	const readOnlyRootFilesystem = options.readOnlyRootFilesystem ?? true;

	const harnessEnvironment = sortedStringRecord({
		...options.environment,
		ALL_PROXY: egressProxyUrl,
		HTTP_PROXY: egressProxyUrl,
		HTTPS_PROXY: egressProxyUrl,
		NO_PROXY: "localhost,127.0.0.1,::1",
		PROSE_EVAL_EFFECT_LOG_PATH: containerEffectLogPath,
		PROSE_EVAL_EGRESS_PROXY_URL: egressProxyUrl,
		all_proxy: egressProxyUrl,
		http_proxy: egressProxyUrl,
		https_proxy: egressProxyUrl,
		no_proxy: "localhost,127.0.0.1,::1",
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
		expose: [`${proxyPort}`],
		networks: [networkName, egressNetworkName],
		read_only: readOnlyRootFilesystem,
		security_opt: ["no-new-privileges:true"],
		tmpfs: ["/tmp:rw,noexec,nosuid,size=128m"],
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
		networkName,
		workDirectory: workspaceTargetPath,
	};
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
