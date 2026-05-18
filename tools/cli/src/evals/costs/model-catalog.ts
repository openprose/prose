import type { EvalCostRecord, JsonObject, JsonValue } from "../types.js";
import { openRouterGenerationToCostRecord, type OpenRouterCostRecordOptions } from "./openrouter.js";
import { isJsonObject, jsonObjectFromUnknown } from "./sanitize.js";

export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_COST_LEARNING_MODEL = "google/gemini-3.1-flash-lite-preview";

export interface ModelCatalogClientOptions {
	apiKey: string;
	baseUrl?: string;
	fetch?: typeof fetch;
	now?: () => Date;
}

export interface OpenRouterModelCatalogSnapshot {
	kind: "openrouter.model-catalog.snapshot.v1";
	fetchedAt: string;
	models: readonly JsonObject[];
	raw: JsonObject;
}

export interface OpenRouterModelEndpointSnapshot {
	kind: "openrouter.model-endpoints.snapshot.v1";
	fetchedAt: string;
	modelId: string;
	endpoints: readonly JsonObject[];
	raw: JsonObject;
}

export interface OpenRouterCreditsSnapshot {
	kind: "openrouter.credits.snapshot.v1";
	fetchedAt: string;
	raw: JsonObject;
	remainingCredits?: number;
	totalCredits?: number;
	totalUsage?: number;
}

export class ModelCatalogClient {
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly now: () => Date;

	constructor(options: ModelCatalogClientOptions) {
		if (options.apiKey.trim() === "") {
			throw new Error("OpenRouter apiKey is required");
		}

		this.apiKey = options.apiKey;
		this.baseUrl = (options.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL).replace(/\/+$/, "");
		this.fetchImpl = options.fetch ?? fetch;
		this.now = options.now ?? (() => new Date());
	}

	async snapshotModels(): Promise<OpenRouterModelCatalogSnapshot> {
		const raw = await this.requestJson("/models");
		const models = jsonObjectArrayField(raw, "data") ?? jsonObjectArrayField(raw, "models") ?? [];

		return {
			kind: "openrouter.model-catalog.snapshot.v1",
			fetchedAt: this.now().toISOString(),
			models,
			raw,
		};
	}

	async snapshotCandidateEndpoints(
		modelIds: readonly string[] = [DEFAULT_COST_LEARNING_MODEL],
	): Promise<OpenRouterModelEndpointSnapshot[]> {
		const snapshots: OpenRouterModelEndpointSnapshot[] = [];
		for (const modelId of modelIds) {
			snapshots.push(await this.snapshotModelEndpoints(modelId));
		}
		return snapshots;
	}

	async snapshotModelEndpoints(modelId: string): Promise<OpenRouterModelEndpointSnapshot> {
		const { author, slug } = splitOpenRouterModelId(modelId);
		const raw = await this.requestJson(`/models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`);
		const data = jsonObjectField(raw, "data") ?? raw;
		const endpoints = jsonObjectArrayField(data, "endpoints") ?? jsonObjectArrayField(raw, "endpoints") ?? [];

		return {
			kind: "openrouter.model-endpoints.snapshot.v1",
			fetchedAt: this.now().toISOString(),
			modelId,
			endpoints,
			raw,
		};
	}

	async readCredits(): Promise<OpenRouterCreditsSnapshot> {
		const raw = await this.requestJson("/credits");
		const data = jsonObjectField(raw, "data") ?? raw;
		const totalCredits =
			numberField(data, "total_credits") ??
			numberField(data, "totalCredits") ??
			numberField(data, "credits_total") ??
			numberField(data, "totalCreditsUsd");
		const totalUsage =
			numberField(data, "total_usage") ??
			numberField(data, "totalUsage") ??
			numberField(data, "usage") ??
			numberField(data, "usageUsd");
		const remainingCredits =
			numberField(data, "remaining_credits") ??
			numberField(data, "remainingCredits") ??
			numberField(data, "credits") ??
			numberField(data, "balance") ??
			(totalCredits === undefined || totalUsage === undefined ? undefined : totalCredits - totalUsage);

		return {
			kind: "openrouter.credits.snapshot.v1",
			fetchedAt: this.now().toISOString(),
			raw,
			...(remainingCredits === undefined ? {} : { remainingCredits }),
			...(totalCredits === undefined ? {} : { totalCredits }),
			...(totalUsage === undefined ? {} : { totalUsage }),
		};
	}

	async fetchGenerationCost(
		generationId: string,
		recordOptions: Omit<OpenRouterCostRecordOptions, "generationId">,
	): Promise<EvalCostRecord> {
		const raw = await this.requestJson("/generation", { id: generationId });
		return openRouterGenerationToCostRecord(jsonObjectField(raw, "data") ?? raw, {
			...recordOptions,
			generationId,
		});
	}

	private async requestJson(path: string, query: Readonly<Record<string, string>> = {}): Promise<JsonObject> {
		const normalizedPath = path.startsWith("/") ? path : `/${path}`;
		const url = new URL(`${this.baseUrl}${normalizedPath}`);
		for (const [key, value] of Object.entries(query)) {
			url.searchParams.set(key, value);
		}

		const response = await this.fetchImpl(url, {
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
		});

		if (!response.ok) {
			throw new Error(`OpenRouter request failed with HTTP ${response.status}`);
		}

		return jsonObjectFromUnknown(await response.json(), [this.apiKey]);
	}
}

export function computeOpenRouterCreditDeltaUsd(
	before: OpenRouterCreditsSnapshot,
	after: OpenRouterCreditsSnapshot,
): number | undefined {
	if (before.totalUsage !== undefined && after.totalUsage !== undefined) {
		return finiteDelta(after.totalUsage - before.totalUsage);
	}

	if (before.remainingCredits !== undefined && after.remainingCredits !== undefined) {
		return finiteDelta(before.remainingCredits - after.remainingCredits);
	}

	return undefined;
}

function splitOpenRouterModelId(modelId: string): { author: string; slug: string } {
	const slash = modelId.indexOf("/");
	if (slash <= 0 || slash === modelId.length - 1) {
		throw new Error(`OpenRouter model id must be author/slug: ${modelId}`);
	}

	return {
		author: modelId.slice(0, slash),
		slug: modelId.slice(slash + 1),
	};
}

function finiteDelta(value: number): number | undefined {
	return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function jsonObjectField(object: JsonObject, key: string): JsonObject | undefined {
	const value = object[key];
	return isJsonValueObject(value) ? value : undefined;
}

function jsonObjectArrayField(object: JsonObject, key: string): JsonObject[] | undefined {
	const value = object[key];
	if (!Array.isArray(value)) {
		return undefined;
	}

	const objects = value.filter(isJsonValueObject);
	return objects.length === value.length ? objects : undefined;
}

function isJsonValueObject(value: JsonValue | undefined): value is JsonObject {
	return value !== undefined && isJsonObject(value);
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
