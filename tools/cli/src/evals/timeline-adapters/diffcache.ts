import { join } from "node:path";

import type { JsonObject, JsonValue, ReactorTimelineAdapter } from "../types.js";
import {
	type BaselineJudge,
	defaultBaselineJudge,
	eventCanonicalKey,
	isJsonObject,
	readBaselineCache,
	stepResult,
	writeBaselineCache,
} from "./baseline-utils.js";

export interface DiffcacheTimelineAdapterOptions {
	baselineJudge?: BaselineJudge;
}

interface DiffcacheState extends JsonObject {
	lastKey?: string;
	verdicts: JsonObject;
}

const ADAPTER_NAME = "diffcache";
const CACHE_FILE = "diffcache.json";

export function createDiffcacheTimelineAdapter(options: DiffcacheTimelineAdapterOptions = {}): ReactorTimelineAdapter {
	const baselineJudge = options.baselineJudge ?? defaultBaselineJudge;

	return {
		name: ADAPTER_NAME,
		async onEvent(event, context) {
			const cachePath = join(context.scenarioCacheDirectory, CACHE_FILE);
			const state = normalizeState(await readBaselineCache<DiffcacheState>(cachePath, emptyState()));
			const eventKey = eventCanonicalKey(event);
			const cachedVerdict = state.verdicts[eventKey];
			const hasCachedVerdict = Object.hasOwn(state.verdicts, eventKey);

			if (state.lastKey === eventKey || hasCachedVerdict) {
				state.lastKey = eventKey;
				await writeBaselineCache(cachePath, state);

				return stepResult(ADAPTER_NAME, event, "reuse", {
					cacheEntries: Object.keys(state.verdicts).length,
					cachePath,
					eventKey,
					...(cachedVerdict === undefined ? {} : { verdict: cachedVerdict }),
				});
			}

			const verdict = await baselineJudge({ event, eventKey });
			state.verdicts[eventKey] = verdict;
			state.lastKey = eventKey;
			await writeBaselineCache(cachePath, state);

			return stepResult(ADAPTER_NAME, event, "compute", {
				cacheEntries: Object.keys(state.verdicts).length,
				cachePath,
				eventKey,
				verdict,
			});
		},
	};
}

function emptyState(): DiffcacheState {
	return {
		verdicts: {},
	};
}

function normalizeState(state: DiffcacheState): DiffcacheState {
	const verdicts = isJsonObject(state.verdicts) ? state.verdicts : {};
	const lastKey = typeof state.lastKey === "string" ? state.lastKey : undefined;

	return {
		...(lastKey === undefined ? {} : { lastKey }),
		verdicts: normalizeVerdicts(verdicts),
	};
}

function normalizeVerdicts(verdicts: JsonObject): JsonObject {
	return Object.fromEntries(
		Object.entries(verdicts).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined),
	);
}
