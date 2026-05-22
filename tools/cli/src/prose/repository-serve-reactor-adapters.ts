import {
	POLICY_ARTIFACT_VERSION,
	POLICY_AUTHOR_HISTORY_QUERY_SCHEMA,
	type ReactorAgentRequestV0,
	type ReactorAgentSdkAdapterV0,
	type ReactorModelGatewayAdapterV0,
	type ReactorModelGatewayRequestV0,
} from "@openprose/reactor";
import type { RepositoryServeReactorOptions } from "./repository-serve.js";
import { buildReactorPolicyNamespace } from "./responsibility-reactor.js";
import type { ResponsibilityStatusValue } from "./responsibility-status.js";

export const REPOSITORY_SERVE_LOCAL_REACTOR_PROVIDER = "openprose-cli-local";
export const REPOSITORY_SERVE_LOCAL_REACTOR_MODEL = "deterministic-shallow-v0";
export const REPOSITORY_SERVE_LOCAL_REACTOR_STATUS_ENV = "PROSE_REACTOR_LOCAL_STATUS";

export interface LocalRepositoryServeReactorOptionsInput {
	env?: Readonly<Record<string, string | undefined>>;
	now?: () => string;
}

export function createLocalRepositoryServeReactorOptions(
	input: LocalRepositoryServeReactorOptionsInput = {},
): RepositoryServeReactorOptions {
	return {
		clock: { now: input.now ?? (() => new Date().toISOString()) },
		modelGateway: createLocalModelGateway(input.env ?? {}),
		agentSdk: createLocalPolicyAuthorAgent(),
	};
}

function createLocalModelGateway(
	env: Readonly<Record<string, string | undefined>>,
): ReactorModelGatewayAdapterV0 {
	return {
		invoke(request: ReactorModelGatewayRequestV0) {
			const status = readLocalStatus(env[REPOSITORY_SERVE_LOCAL_REACTOR_STATUS_ENV]);
			const tokenEstimate = estimateFreshTokens(request);
			return {
				payload: {
					status,
					confidence: {
						value: 0.5,
						derivation_method: "local-deterministic-v0",
						calibration_grade: "authored",
						label_source: "openprose-cli-local",
					},
					...(status === "blocked"
						? {
								blocked: {
									reason: "Local Reactor adapter returned blocked.",
									fix_target: "configure-reactor-model-gateway",
									interrupt_cause: "needs-judgment",
								},
							}
						: {}),
					cost_tags: {
						tags: ["cli-serve", "local-deterministic"],
					},
				},
				usage: {
					provider: REPOSITORY_SERVE_LOCAL_REACTOR_PROVIDER,
					model: REPOSITORY_SERVE_LOCAL_REACTOR_MODEL,
					tokens: {
						fresh: tokenEstimate,
						reused: 0,
					},
					provider_norm: {
						schema: "openprose.cli.local-token-estimate.v0",
						tokenizer: "utf8-char-div4-ceil",
						serialized_request_bytes: JSON.stringify(request).length,
					},
				},
			};
		},
	};
}

function createLocalPolicyAuthorAgent(): ReactorAgentSdkAdapterV0 {
	return {
		launch: (request) => ({
			payload: localPolicyAuthorPayload(request),
		}),
	};
}

function localPolicyAuthorPayload(request: ReactorAgentRequestV0): unknown {
	const payload = isRecord(request.payload) ? request.payload : {};
	if (payload.step === "history-query") {
		return {
			schema: POLICY_AUTHOR_HISTORY_QUERY_SCHEMA,
			v: POLICY_ARTIFACT_VERSION,
			selected_receipt_hashes: [],
		};
	}

	const responsibilityId = readNonEmptyString(payload.responsibility_id) ?? "responsibility";
	return {
		registry_id: buildReactorPolicyNamespace(responsibilityId),
		policy_revision: "1",
		cadence: {
			shallow_recheck_ms: 86_400_000,
			plan_audit_ms: 604_800_000,
			deep_revalidation_ms: 604_800_000,
		},
		hysteresis: {
			min_recompile_interval_ms: 3_600_000,
			enter_degraded_threshold: 0.8,
			exit_degraded_threshold: 0.6,
			warmup_judged_activations: 3,
		},
		thresholds: {
			max_calibration_divergence_multiplier: 2,
			escalation_precision_floor: 0.6,
			backstop_deep_contradiction_count: 2,
			stale_brief_minutes: 1_440,
			fresh_tokens_per_day_ceiling: 50_000,
		},
		falsification_predicate: {
			kind: "greater-than-or-equal",
			fact: "cost.fresh_tokens_per_maintained_day",
			value: 50_000,
		},
		backstop_divergence_predicate: {
			kind: "greater-than-or-equal",
			fact: "kernel.deep_shallow_contradiction_count_7d",
			value: 2,
		},
	};
}

function readLocalStatus(value: string | undefined): ResponsibilityStatusValue {
	if (value === "up" || value === "drifting" || value === "down" || value === "blocked") {
		return value;
	}
	return "up";
}

function estimateFreshTokens(request: ReactorModelGatewayRequestV0): number {
	return Math.max(1, Math.ceil(JSON.stringify(request).length / 4));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
