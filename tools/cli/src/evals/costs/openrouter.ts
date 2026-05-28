import type { EvalCostRecord, JsonObject, SurpriseLabel } from "../types.js";
import { isJsonObject, jsonObjectFromUnknown, redactText } from "./sanitize.js";

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

	let response: Response;
	try {
		response = await fetchImpl(url, {
			headers: {
				Authorization: `Bearer ${clientOptions.apiKey}`,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(redactText(message, [clientOptions.apiKey]));
	}

	if (!response.ok) {
		throw new Error(`OpenRouter generation lookup failed with HTTP ${response.status}`);
	}

	const body = jsonObjectFromUnknown(await response.json(), [clientOptions.apiKey]) as OpenRouterGenerationResponse;
	return openRouterGenerationToCostRecord(body.data ?? {}, {
		...recordOptions,
		generationId,
	});
}

export function openRouterGenerationToCostRecord(
	generation: JsonObject,
	options: OpenRouterCostRecordOptions,
): EvalCostRecord {
	const usage = jsonObjectField(generation, "usage");
	const modelObject = jsonObjectField(generation, "model");
	const providerObject = jsonObjectField(generation, "provider");
	const totalCostUsd =
		nonNegativeNumberField(generation, "total_cost") ??
		nonNegativeNumberField(generation, "totalCost") ??
		nonNegativeNumberField(generation, "total_cost_usd") ??
		nonNegativeNumberField(generation, "cost") ??
		nonNegativeNumberField(generation, "usage") ??
		(usage === undefined
			? undefined
			: nonNegativeNumberField(usage, "total_cost") ??
				nonNegativeNumberField(usage, "totalCost") ??
				nonNegativeNumberField(usage, "total_cost_usd") ??
				nonNegativeNumberField(usage, "cost") ??
				nonNegativeNumberField(usage, "costUsd") ??
				nonNegativeNumberField(usage, "usage"));
	const promptTokens =
		tokenField(generation, "tokens_prompt") ??
		tokenField(generation, "prompt_tokens") ??
		tokenField(generation, "native_tokens_prompt") ??
		tokenField(generation, "input_tokens") ??
		(usage === undefined
			? undefined
			: tokenField(usage, "tokens_prompt") ??
				tokenField(usage, "prompt_tokens") ??
				tokenField(usage, "input_tokens") ??
				tokenField(usage, "prompt"));
	const completionTokens =
		tokenField(generation, "tokens_completion") ??
		tokenField(generation, "completion_tokens") ??
		tokenField(generation, "native_tokens_completion") ??
		tokenField(generation, "output_tokens") ??
		(usage === undefined
			? undefined
			: tokenField(usage, "tokens_completion") ??
				tokenField(usage, "completion_tokens") ??
				tokenField(usage, "output_tokens") ??
				tokenField(usage, "completion"));
	const totalTokens =
		tokenField(generation, "tokens_total") ??
		tokenField(generation, "total_tokens") ??
		tokenField(generation, "native_tokens_total") ??
		(usage === undefined
			? undefined
			: tokenField(usage, "tokens_total") ?? tokenField(usage, "total_tokens") ?? tokenField(usage, "total")) ??
		sumDefined(promptTokens, completionTokens);
	const model =
		stringField(generation, "model") ??
		stringField(generation, "model_slug") ??
		stringField(generation, "model_id") ??
		(modelObject === undefined ? undefined : stringField(modelObject, "id") ?? stringField(modelObject, "slug"));
	const provider =
		stringField(generation, "provider_name") ??
		stringField(generation, "provider") ??
		(providerObject === undefined ? undefined : stringField(providerObject, "name") ?? stringField(providerObject, "id"));
	const occurredAt = stringField(generation, "created_at") ?? stringField(generation, "createdAt") ?? new Date().toISOString();
	const hasUsableProviderFields =
		totalCostUsd !== undefined && (promptTokens !== undefined || completionTokens !== undefined || totalTokens !== undefined);

	return {
		id: `openrouter:${options.generationId}`,
		runId: options.runId,
		taskId: options.taskId,
		attemptId: options.attemptId,
		adapterName: options.adapterName,
		confidence: hasUsableProviderFields ? "provider-reconciled" : "response-usage",
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

function jsonObjectField(object: JsonObject, key: string): JsonObject | undefined {
	const value = object[key];
	return value !== undefined && isJsonObject(value) ? value : undefined;
}

function nonNegativeNumberField(object: JsonObject, key: string): number | undefined {
	const value = numberField(object, key);
	return value !== undefined && value >= 0 ? value : undefined;
}

function tokenField(object: JsonObject, key: string): number | undefined {
	const value = nonNegativeNumberField(object, key);
	return value === undefined ? undefined : Math.floor(value);
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
