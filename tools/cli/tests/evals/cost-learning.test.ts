import { describe, expect, test } from "vitest";

import {
	DEFAULT_COST_LEARNING_MODEL,
	ModelCatalogClient,
	generationIdsFromCostRecords,
	runOpenRouterCostLearningBatch,
	type EvalCostRecord,
} from "../../src/evals/index.js";

const API_KEY = "fixture-openrouter-redaction-token";

describe("OpenRouter cost-learning loop", () => {
	test("snapshots catalog/endpoints, brackets credits, and reconciles generation costs without exposing the key", async () => {
		const requests: CapturedRequest[] = [];
		let creditsReads = 0;
		const fetchImpl: typeof fetch = async (input, init) => {
			const url = new URL(input.toString());
			requests.push({
				authorization: authorizationHeader(init?.headers),
				path: `${url.pathname}${url.search}`,
			});

			if (url.pathname === "/api/v1/models") {
				return jsonResponse({
					data: [
						{
							id: DEFAULT_COST_LEARNING_MODEL,
							pricing: { prompt: "0.0000001" },
							echo: API_KEY,
						},
					],
				});
			}

			if (url.pathname === "/api/v1/models/google/gemini-3.1-flash-lite-preview/endpoints") {
				return jsonResponse({
					data: {
						endpoints: [
							{
								provider_name: "Google AI Studio",
								model: DEFAULT_COST_LEARNING_MODEL,
							},
						],
					},
				});
			}

			if (url.pathname === "/api/v1/credits") {
				creditsReads += 1;
				return jsonResponse({
					data: {
						total_credits: 500,
						total_usage: creditsReads === 1 ? 10 : 10.015,
						note: API_KEY,
					},
				});
			}

			if (url.pathname === "/api/v1/generation") {
				const generationId = url.searchParams.get("id");
				return jsonResponse({
					data: {
						created_at: "2026-05-17T12:00:00.000Z",
						model: DEFAULT_COST_LEARNING_MODEL,
						provider_name: "Google",
						tokens_prompt: generationId === "gen-1" ? "11" : "13",
						tokens_completion: generationId === "gen-1" ? 3 : 5,
						total_cost: generationId === "gen-1" ? "0.004" : "0.006",
						echo: API_KEY,
					},
				});
			}

			return jsonResponse({ error: "not found" }, 404);
		};
		const client = new ModelCatalogClient({
			apiKey: API_KEY,
			fetch: fetchImpl,
			now: () => new Date("2026-05-17T12:00:00.000Z"),
		});
		const costRecords: EvalCostRecord[] = [
			inputCostRecord("gen-1", "pi", "quiet-drift-01-a"),
			inputCostRecord("gen-2", "hermes", "quiet-drift-01-a"),
			{
				id: "local-estimate",
				runId: "pilot-run",
				taskId: "no-generation",
				attemptId: "pilot-run:no-generation:1",
				adapterName: "dspy-rlm",
				confidence: "local-token-estimate",
				occurredAt: "2026-05-17T12:00:00.000Z",
				totalCostUsd: 0.001,
			},
		];

		const result = await runOpenRouterCostLearningBatch({
			batchId: "n3-cheap-pilot",
			client,
			costRecords,
			modelIds: [DEFAULT_COST_LEARNING_MODEL],
			now: () => new Date("2026-05-17T12:00:00.000Z"),
			runCount: 3,
			runId: "pilot-run",
			scenarioPairCount: 1,
		});

		expect(requests.map((request) => request.path)).toEqual([
			"/api/v1/models",
			"/api/v1/models/google/gemini-3.1-flash-lite-preview/endpoints",
			"/api/v1/credits",
			"/api/v1/generation?id=gen-1",
			"/api/v1/generation?id=gen-2",
			"/api/v1/credits",
		]);
		expect(requests.every((request) => request.authorization === `Bearer ${API_KEY}`)).toBe(true);
		expect(result.creditDeltaUsd).toBeCloseTo(0.015, 6);
		expect(result.lookedUpGenerationIds).toEqual(["gen-1", "gen-2"]);
		expect(result.reconciledCostRecords.map((record) => record.totalCostUsd)).toEqual([0.004, 0.006]);
		expect(result.costSummary.knownCostUsd).toBeCloseTo(0.01, 6);
		expect(result.learnedCost).toEqual(
			expect.objectContaining({
				confidence: "provider-reconciled",
				dollarsPerRun: expect.closeTo(0.005, 6),
				dollarsPerScenarioPair: expect.closeTo(0.015, 6),
				effectiveSpendUsd: expect.closeTo(0.015, 6),
				groundTruthSpendUsd: expect.closeTo(0.015, 6),
				providerReconciledSpendUsd: expect.closeTo(0.01, 6),
				runCount: 3,
				scenarioPairCount: 1,
				spendBasis: "credit-delta",
			}),
		);
		expect(JSON.stringify(result)).not.toContain(API_KEY);
		expect(result.modelCatalog.raw.data).toEqual([
			expect.objectContaining({
				echo: "[REDACTED]",
			}),
		]);
		expect(result.creditsBefore.raw.data).toEqual(
			expect.objectContaining({
				note: "[REDACTED]",
			}),
		);
	});

	test("deduplicates generation ids from cost records", () => {
		expect(
			generationIdsFromCostRecords([
				inputCostRecord("gen-1", "pi", "case-1"),
				inputCostRecord("gen-1", "pi", "case-1"),
				inputCostRecord("gen-2", "hermes", "case-1"),
			]),
		).toEqual(["gen-1", "gen-2"]);
	});

	test("retries generation lookups for eventually consistent usage records", async () => {
		let generationReads = 0;
		const fetchImpl: typeof fetch = async (input) => {
			const url = new URL(input.toString());
			if (url.pathname === "/api/v1/models") {
				return jsonResponse({ data: [] });
			}
			if (url.pathname.endsWith("/endpoints")) {
				return jsonResponse({ data: { endpoints: [] } });
			}
			if (url.pathname === "/api/v1/credits") {
				return jsonResponse({ data: { total_usage: generationReads === 0 ? 1 : 1.002 } });
			}
			if (url.pathname === "/api/v1/generation") {
				generationReads += 1;
				if (generationReads === 1) {
					return jsonResponse({ error: "not ready" }, 404);
				}
				return jsonResponse({
					data: {
						created_at: "2026-05-17T12:00:00.000Z",
						model: DEFAULT_COST_LEARNING_MODEL,
						provider_name: "Google",
						tokens_prompt: 2,
						tokens_completion: 1,
						total_cost: "0.002",
					},
				});
			}
			return jsonResponse({}, 404);
		};
		const client = new ModelCatalogClient({ apiKey: API_KEY, fetch: fetchImpl });

		const result = await runOpenRouterCostLearningBatch({
			batchId: "retry-batch",
			client,
			costRecords: [inputCostRecord("gen-lagged", "pi", "case-1")],
			generationLookupAttempts: 2,
			runId: "retry-run",
		});

		expect(generationReads).toBe(2);
		expect(result.reconciledCostRecords).toHaveLength(1);
		expect(result.metadata.generationLookupAttempts).toBe(2);
	});

	test("records generation lookup failures and falls back to response-usage costs when allowed", async () => {
		const fetchImpl: typeof fetch = async (input) => {
			const url = new URL(input.toString());
			if (url.pathname === "/api/v1/models") {
				return jsonResponse({ data: [] });
			}
			if (url.pathname.endsWith("/endpoints")) {
				return jsonResponse({ data: { endpoints: [] } });
			}
			if (url.pathname === "/api/v1/credits") {
				return jsonResponse({ data: { total_usage: 2 } });
			}
			if (url.pathname === "/api/v1/generation") {
				return jsonResponse({ error: "not found" }, 404);
			}
			return jsonResponse({}, 404);
		};
		const client = new ModelCatalogClient({ apiKey: API_KEY, fetch: fetchImpl });
		const fallbackRecord = {
			...inputCostRecord("gen-missing", "pi", "case-1"),
			confidence: "response-usage" as const,
			totalCostUsd: 0.003,
		};

		const result = await runOpenRouterCostLearningBatch({
			allowGenerationLookupFailures: true,
			batchId: "fallback-batch",
			client,
			costRecords: [fallbackRecord],
			runId: "fallback-run",
		});

		expect(result.reconciledCostRecords).toEqual([]);
		expect(result.fallbackCostRecords).toEqual([fallbackRecord]);
		expect(result.generationLookupFailures).toEqual([
			expect.objectContaining({
				generationId: "gen-missing",
				message: "OpenRouter request failed with HTTP 404",
			}),
		]);
		expect(result.costSummary.knownCostUsd).toBe(0.003);
		expect(result.learnedCost.confidence).toBe("response-usage");
		expect(result.learnedCost.effectiveSpendUsd).toBe(0.003);
		expect(result.learnedCost.groundTruthSpendUsd).toBe(0);
		expect(result.learnedCost.spendBasis).toBe("cost-records");
	});
});

interface CapturedRequest {
	authorization: string | undefined;
	path: string;
}

function inputCostRecord(generationId: string, adapterName: string, taskId: string): EvalCostRecord {
	return {
		id: `input:${generationId}`,
		runId: "pilot-run",
		taskId,
		attemptId: `pilot-run:${taskId}:1`,
		adapterName,
		confidence: "response-usage",
		generationId,
		occurredAt: "2026-05-17T12:00:00.000Z",
		role: "agent",
		surpriseLabel: "silent-drift",
	};
}

function authorizationHeader(headers: RequestInit["headers"] | undefined): string | undefined {
	if (headers === undefined) {
		return undefined;
	}
	if (headers instanceof Headers) {
		return headers.get("authorization") ?? undefined;
	}
	if (Array.isArray(headers)) {
		return headers.find((entry) => entry[0]?.toLowerCase() === "authorization")?.[1];
	}
	const value = headers.Authorization ?? headers.authorization;
	return typeof value === "string" ? value : undefined;
}

function jsonResponse(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), {
		headers: {
			"content-type": "application/json",
		},
		status,
	});
}
