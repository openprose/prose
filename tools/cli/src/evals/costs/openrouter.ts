import type { EvalCostRecord, JsonObject, SurpriseLabel } from "../types.js";

export interface OpenRouterGenerationResponse {
	data?: JsonObject;
}

export interface OpenRouterCostRecordOptions {
	adapterName: string;
	attemptId: string;
	generationId: string;
	role?: string;
	runId: string;
	surpriseLabel?: SurpriseLabel;
	taskId: string;
}

export interface OpenRouterCostClientOptions {
	apiKey: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function fetchOpenRouterGenerationCost(
	generationId: string,
	clientOptions: OpenRouterCostClientOptions,
	recordOptions: Omit<OpenRouterCostRecordOptions, "generationId">,
): Promise<EvalCostRecord> {
	const baseUrl = clientOptions.baseUrl ?? "https://openrouter.ai/api/v1";
	const fetchImpl = clientOptions.fetch ?? fetch;
	const url = new URL(`${baseUrl.replace(/\/$/, "")}/generation`);
	url.searchParams.set("id", generationId);

	const response = await fetchImpl(url, {
		headers: {
			Authorization: `Bearer ${clientOptions.apiKey}`,
		},
	});

	if (!response.ok) {
		throw new Error(`OpenRouter generation lookup failed with HTTP ${response.status}`);
	}

	const body = (await response.json()) as OpenRouterGenerationResponse;
	return openRouterGenerationToCostRecord(body.data ?? {}, {
		...recordOptions,
		generationId,
	});
}

export function openRouterGenerationToCostRecord(
	generation: JsonObject,
	options: OpenRouterCostRecordOptions,
): EvalCostRecord {
	const totalCostUsd = numberField(generation, "total_cost") ?? numberField(generation, "totalCost");
	const promptTokens =
		numberField(generation, "tokens_prompt") ??
		numberField(generation, "prompt_tokens") ??
		numberField(generation, "native_tokens_prompt");
	const completionTokens =
		numberField(generation, "tokens_completion") ??
		numberField(generation, "completion_tokens") ??
		numberField(generation, "native_tokens_completion");
	const totalTokens =
		numberField(generation, "tokens_total") ??
		numberField(generation, "total_tokens") ??
		sumDefined(promptTokens, completionTokens);
	const model = stringField(generation, "model");
	const provider = stringField(generation, "provider_name") ?? stringField(generation, "provider");
	const occurredAt = stringField(generation, "created_at") ?? new Date().toISOString();

	return {
		id: `openrouter:${options.generationId}`,
		runId: options.runId,
		taskId: options.taskId,
		attemptId: options.attemptId,
		adapterName: options.adapterName,
		confidence: totalCostUsd === undefined ? "response-usage" : "provider-reconciled",
		occurredAt,
		currency: "USD",
		generationId: options.generationId,
		metadata: generation,
		...(completionTokens === undefined ? {} : { completionTokens }),
		...(model === undefined ? {} : { model }),
		...(promptTokens === undefined ? {} : { promptTokens }),
		...(provider === undefined ? {} : { provider }),
		...(options.role === undefined ? {} : { role: options.role }),
		...(options.surpriseLabel === undefined ? {} : { surpriseLabel: options.surpriseLabel }),
		...(totalCostUsd === undefined ? {} : { totalCostUsd }),
		...(totalTokens === undefined ? {} : { totalTokens }),
	};
}

function numberField(object: JsonObject, key: string): number | undefined {
	const value = object[key];
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return undefined;
}

function stringField(object: JsonObject, key: string): string | undefined {
	const value = object[key];
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function sumDefined(left: number | undefined, right: number | undefined): number | undefined {
	if (left === undefined || right === undefined) {
		return undefined;
	}

	return left + right;
}
