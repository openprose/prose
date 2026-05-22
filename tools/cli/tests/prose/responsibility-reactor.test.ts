import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	POLICY_ARTIFACT_VERSION,
	POLICY_AUTHOR_HISTORY_QUERY_SCHEMA,
	type ReactorAgentSdkAdapterV0,
	type ReactorAgentRequestV0,
	type ReactorModelGatewayAdapterV0,
} from "@openprose/reactor";
import { describe, expect, it } from "vitest";

import {
	ACTIVE_REPOSITORY_IR_PATH,
	buildReactorPolicyNamespace,
	ingestRepositoryTriggerThroughReactor,
	loadActiveRepositoryIr,
	loadResponsibilityReactor,
} from "../../src/prose/index.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const stargazerFixture = join(repoRoot, "tests/open-prose/compiler/expected/stargazer.manifest.next.json");
const responsibilityId = "067NC4KG01RG50R40M30E20918";
const triggerId = "high-intent-stargazer-outreach.periodic-check";

describe("responsibility reactor bridge", () => {
	it("ingests a trigger through Reactor receipts without judge-written status JSON", async () => {
		const temp = mkdtempSync(join(tmpdir(), "prose-responsibility-reactor-"));

		try {
			writeActiveManifest(temp);
			const loaded = await loadActiveRepositoryIr({ cwd: temp });
			const bridge = loadResponsibilityReactor({
				loaded,
				responsibilityId,
				modelGateway: makeModelGateway("down"),
				agentSdk: makePolicyAuthorAgent(),
				clock: { now: () => "2026-05-19T12:00:00.000Z" },
			});

			const result = ingestRepositoryTriggerThroughReactor({
				bridge,
				loaded,
				event: { triggerId },
			});

			expect(result.result.accepted).toBe(true);
			expect(result.result.outcome).toBe("fresh-judge-receipt");
			expect(result.receipt?.cost.surprise_cause).toBe("real-input");
			expect(result.receipt?.verdict.status).toBe("down");
			expect(result.projection?.token_truth.surprise_cause).toBe("real-input");
			expect(result.projection?.token_truth.fresh).toBe(13);
			expect(result.projection?.token_truth.reused).toBe(2);

			const receiptsPath = join(temp, `state/reactor/${responsibilityId}/receipts.json`);
			const persisted = JSON.parse(readFileSync(receiptsPath, "utf8")) as unknown[];
			expect(persisted).toHaveLength(1);
			expect(persisted[0]).toEqual(result.receipt);
			expect(existsSync(join(temp, `state/responsibilities/${responsibilityId}/latest.json`))).toBe(false);

			expect(result.pressure).toMatchObject({
				status: "down",
				recommendedActivationKind: "fulfillment",
				activationId: "high-intent-stargazer-outreach.fulfillment",
			});
			expect(result.pressure?.evidence.join("\n")).toContain(result.receipt?.content_hash);
			expect(result.pressure?.dedupeKey).toMatch(/^sha256:/);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});
});

function writeActiveManifest(temp: string): void {
	const activePath = join(temp, ACTIVE_REPOSITORY_IR_PATH);
	mkdirSync(dirname(activePath), { recursive: true });
	copyFileSync(stargazerFixture, activePath);
}

function makeModelGateway(status: "up" | "drifting" | "down" | "blocked"): ReactorModelGatewayAdapterV0 {
	return {
		invoke: () => ({
			payload: {
				status,
				confidence: {
					value: 0.74,
					derivation_method: "cli-bridge-test",
					calibration_grade: "authored",
					label_source: "fixture",
				},
				cost_tags: {
					tags: ["cli-bridge"],
				},
			},
			usage: {
				provider: "cli-test",
				model: "fixture-shallow-judge",
				tokens: {
					fresh: 13,
					reused: 2,
				},
			},
		}),
	};
}

function makePolicyAuthorAgent(): ReactorAgentSdkAdapterV0 {
	return {
		launch: (request) => ({
			payload: policyAuthorPayload(request),
		}),
	};
}

function policyAuthorPayload(request: ReactorAgentRequestV0): unknown {
	const payload = request.payload as { readonly step?: string; readonly responsibility_id?: string };
	if (payload.step === "history-query") {
		return {
			schema: POLICY_AUTHOR_HISTORY_QUERY_SCHEMA,
			v: POLICY_ARTIFACT_VERSION,
			selected_receipt_hashes: [],
		};
	}

	const policyNamespace = buildReactorPolicyNamespace(payload.responsibility_id ?? responsibilityId);
	return {
		registry_id: policyNamespace,
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
