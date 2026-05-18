import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
	JsonObject,
	JsonValue,
	ReactorTimelineAdapter,
	ReactorTimelineEvent,
	ReactorTimelineStepResult,
} from "../types.js";
import {
	defaultBaselineJudge,
	eventCanonicalKey,
	isJsonObject,
	readBaselineCache,
	stepResult,
	writeBaselineCache,
	type BaselineJudge,
} from "./baseline-utils.js";

export const DEFAULT_DIFFCACHE_PLUS_THRESHOLD = 0.985;

export type DiffcachePlusEmbeddingProvider = (
	event: ReactorTimelineEvent,
) => readonly number[] | null | undefined | Promise<readonly number[] | null | undefined>;

export interface DiffcachePlusTimelineAdapterOptions {
	baselineJudge?: BaselineJudge;
	embeddingProvider?: DiffcachePlusEmbeddingProvider;
	judge?: BaselineJudge;
	threshold?: number;
}

type DiffcachePlusLastEmbedding = JsonObject & {
	embedding: number[];
	eventId: string;
	eventKey: string;
	verdict: JsonValue;
};

type DiffcachePlusState = JsonObject & {
	lastEmbedding: DiffcachePlusLastEmbedding | null;
	verdicts: Record<string, JsonValue>;
};

const ADAPTER_NAME = "diffcache-plus";
const CACHE_FILE_NAME = "diffcache-plus.json";
const EMBEDDING_PROVIDER_METADATA = "fixture-or-injected";

export function createDiffcachePlusTimelineAdapter(
	options: DiffcachePlusTimelineAdapterOptions = {},
): ReactorTimelineAdapter {
	const threshold = options.threshold ?? DEFAULT_DIFFCACHE_PLUS_THRESHOLD;
	if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
		throw new RangeError("diffcache-plus threshold must be a finite cosine value between -1 and 1");
	}

	const baselineJudge = options.baselineJudge ?? options.judge ?? defaultBaselineJudge;

	return {
		name: ADAPTER_NAME,
		async onEvent(event, context) {
			const cachePath = join(context.scenarioCacheDirectory, CACHE_FILE_NAME);
			const state = await readState(cachePath);
			const eventKey = eventCanonicalKey(event);
			const embedding = await resolveEmbedding(event, options.embeddingProvider);
			const lastEmbedding = state.lastEmbedding;
			const similarity =
				embedding !== undefined && lastEmbedding !== null
					? cosineSimilarity(embedding, lastEmbedding.embedding)
					: undefined;

			if (embedding !== undefined && similarity !== undefined && similarity >= threshold && lastEmbedding !== null) {
				const verdict = lastEmbedding.verdict;
				state.verdicts[eventKey] = verdict;
				state.lastEmbedding = lastEmbeddingRecord(event, eventKey, embedding, verdict);
				await writeState(cachePath, state);
				return result(event, "reuse", {
					cacheMode: "semantic",
					cosineSimilarity: similarity,
					embeddingAvailable: true,
					eventKey,
					matchedEventId: lastEmbedding.eventId,
					matchedEventKey: lastEmbedding.eventKey,
					threshold,
				});
			}

			const cachedVerdict = state.verdicts[eventKey];
			if (cachedVerdict !== undefined) {
				if (embedding !== undefined) {
					state.lastEmbedding = lastEmbeddingRecord(event, eventKey, embedding, cachedVerdict);
				}
				await writeState(cachePath, state);
				return result(event, "reuse", {
					cacheMode: "exact",
					embeddingAvailable: embedding !== undefined,
					eventKey,
					threshold,
				});
			}

			const verdict = await baselineJudge({ event, eventKey });
			state.verdicts[eventKey] = verdict;
			if (embedding !== undefined) {
				state.lastEmbedding = lastEmbeddingRecord(event, eventKey, embedding, verdict);
			}
			await writeState(cachePath, state);
			return result(event, "compute", {
				cacheMode: "miss",
				...(similarity === undefined ? {} : { cosineSimilarity: similarity }),
				embeddingAvailable: embedding !== undefined,
				eventKey,
				threshold,
			});
		},
	};
}

function result(
	event: ReactorTimelineEvent,
	decision: "compute" | "reuse",
	metadata: JsonObject,
): ReactorTimelineStepResult {
	return stepResult(ADAPTER_NAME, event, decision, {
		embeddingProvider: EMBEDDING_PROVIDER_METADATA,
		noLocalModel: true,
		...metadata,
	});
}

async function readState(cachePath: string): Promise<DiffcachePlusState> {
	return normalizeState(await readBaselineCache<DiffcachePlusState>(cachePath, emptyState()));
}

async function writeState(cachePath: string, state: DiffcachePlusState): Promise<void> {
	await mkdir(dirname(cachePath), { recursive: true });
	await writeBaselineCache(cachePath, normalizeState(state));
}

function emptyState(): DiffcachePlusState {
	return {
		lastEmbedding: null,
		verdicts: {},
	};
}

function normalizeState(state: DiffcachePlusState): DiffcachePlusState {
	const verdicts = isJsonObject(state.verdicts)
		? state.verdicts
		: isJsonObject(state.exact)
			? state.exact
			: {};

	return {
		lastEmbedding: normalizeLastEmbedding(state.lastEmbedding),
		verdicts: normalizeVerdicts(verdicts),
	};
}

function normalizeVerdicts(verdicts: JsonObject): Record<string, JsonValue> {
	return Object.fromEntries(
		Object.entries(verdicts).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined),
	);
}

function normalizeLastEmbedding(value: JsonValue | undefined): DiffcachePlusLastEmbedding | null {
	if (!isJsonObject(value)) {
		return null;
	}

	const embedding = normalizeEmbedding(value.embedding);
	if (
		embedding === undefined ||
		typeof value.eventId !== "string" ||
		typeof value.eventKey !== "string" ||
		value.verdict === undefined
	) {
		return null;
	}

	return {
		embedding,
		eventId: value.eventId,
		eventKey: value.eventKey,
		verdict: value.verdict,
	};
}

async function resolveEmbedding(
	event: ReactorTimelineEvent,
	embeddingProvider: DiffcachePlusEmbeddingProvider | undefined,
): Promise<number[] | undefined> {
	if (embeddingProvider !== undefined) {
		const provided = normalizeEmbedding(await embeddingProvider(event));
		if (provided !== undefined) {
			return provided;
		}
	}

	return normalizeEmbedding(event.metadata?.embedding);
}

function normalizeEmbedding(value: unknown): number[] | undefined {
	if (value === undefined || value === null || !Array.isArray(value) || value.length === 0) {
		return undefined;
	}

	const embedding = value.map((item) => (typeof item === "number" && Number.isFinite(item) ? item : undefined));
	return embedding.every((item): item is number => item !== undefined) ? embedding : undefined;
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number | undefined {
	if (left.length === 0 || left.length !== right.length) {
		return undefined;
	}

	let dot = 0;
	let leftMagnitude = 0;
	let rightMagnitude = 0;
	for (const [index, leftValue] of left.entries()) {
		const rightValue = right[index];
		if (rightValue === undefined) {
			return undefined;
		}
		dot += leftValue * rightValue;
		leftMagnitude += leftValue * leftValue;
		rightMagnitude += rightValue * rightValue;
	}

	if (leftMagnitude === 0 || rightMagnitude === 0) {
		return undefined;
	}

	return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function lastEmbeddingRecord(
	event: ReactorTimelineEvent,
	eventKey: string,
	embedding: readonly number[],
	verdict: JsonValue,
): DiffcachePlusLastEmbedding {
	return {
		embedding: [...embedding],
		eventId: event.id,
		eventKey,
		verdict,
	};
}
