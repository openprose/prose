import type { JsonObject } from "../types.js";

export type IsolationSubstrateKind = "docker-compose";

export interface IsolationRunIdentity {
	adapterName: string;
	attemptId: string;
	caseId: string;
	runId: string;
}

export interface IsolationDockerService {
	command?: readonly string[];
	environment?: Readonly<Record<string, string>>;
	image: string;
	name: string;
	networkMode?: "none" | "egress-proxy";
	readOnlyRootFilesystem?: boolean;
	volumes?: readonly IsolationDockerVolume[];
}

export interface IsolationDockerVolume {
	readOnly?: boolean;
	source: string;
	target: string;
}

export interface IsolationSubstratePlan {
	compose: JsonObject;
	effectLogPath: string;
	egressProxyUrl: string;
	identity: IsolationRunIdentity;
	kind: IsolationSubstrateKind;
	networkName: string;
	workDirectory: string;
}

export type IsolationEffectKind = "exec" | "file" | "network" | "process";

export interface KernelEffectLogEntry {
	actionCid?: string;
	at: string;
	command?: readonly string[];
	effectTag: string;
	id: string;
	kind: IsolationEffectKind;
	metadata?: JsonObject;
	path?: string;
	process?: string;
}

export interface KernelEffectReconciliation {
	reconciled: readonly KernelEffectLogEntry[];
	unreconciled: readonly KernelEffectLogEntry[];
}

export interface ProxyModelCallNode {
	cid: string;
	completion_tokens: number;
	decision_cid: string;
	model_version: string;
	prompt_tokens: number;
	provider: string;
	request_cid: string;
	response_cid: string;
	type: "ModelCall";
}
