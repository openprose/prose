import { join } from "node:path";

import type { JsonObject, JsonValue, ReactorTimelineAdapter, SurpriseLabel } from "../types.js";
import {
	defaultBaselineJudge,
	eventCanonicalKey,
	readBaselineCache,
	stepResult,
	writeBaselineCache,
	type BaselineJudge,
} from "./baseline-utils.js";

export const DEFAULT_TUNED_TTL_MS = 24 * 60 * 60 * 1000;
export const TUNED_TTL_ADAPTER_NAME = "tuned-ttl";

export interface TunedTtlTimelineAdapterOptions {
	judge?: BaselineJudge;
	ttlMs?: number;
}

interface TunedTtlState extends JsonObject {
	lastComputedAt: string | null;
	lastEventId: string | null;
	lastEventKey: string | null;
	verdict: JsonValue | null;
}

export function createTunedTtlTimelineAdapter(options: TunedTtlTimelineAdapterOptions = {}): ReactorTimelineAdapter {
	const ttlMs = options.ttlMs ?? DEFAULT_TUNED_TTL_MS;
	if (!Number.isFinite(ttlMs) || ttlMs < 0) {
		throw new Error("tuned-ttl ttlMs must be a non-negative finite number");
	}

	const judge = options.judge ?? defaultBaselineJudge;

	return {
		name: TUNED_TTL_ADAPTER_NAME,
		async onEvent(event, context) {
			const cachePath = join(context.scenarioCacheDirectory, "tuned-ttl.json");
			const rawState = await readBaselineCache<JsonObject>(cachePath, emptyTunedTtlState());
			const state = normalizeTunedTtlState(rawState);
			const eventKey = eventCanonicalKey(event);
			const eventAtMs = epochMs(event.at);
			const lastComputedAtMs = maybeEpochMs(state.lastComputedAt);
			const resetTtl = isImmediateComputeLabel(event.label);

			if (lastComputedAtMs === undefined || resetTtl || eventAtMs - lastComputedAtMs >= ttlMs) {
				const decision = lastComputedAtMs === undefined || resetTtl ? "compute" : "recheck";
				const verdict = await judge({
					event,
					eventKey,
					...(state.verdict === null ? {} : { priorVerdict: state.verdict }),
				});
				const nextState: TunedTtlState = {
					lastComputedAt: event.at,
					lastEventId: event.id,
					lastEventKey: eventKey,
					verdict,
				};
				await writeBaselineCache(cachePath, nextState);

				return stepResult(TUNED_TTL_ADAPTER_NAME, event, decision, {
					eventKey,
					lastComputedAt: nextState.lastComputedAt,
					lastEventId: nextState.lastEventId,
					reason: decisionReason(lastComputedAtMs, resetTtl),
					ttlMs,
				});
			}

			return stepResult(TUNED_TTL_ADAPTER_NAME, event, "reuse", {
				elapsedMs: eventAtMs - lastComputedAtMs,
				eventKey,
				lastComputedAt: state.lastComputedAt,
				lastEventId: state.lastEventId,
				lastEventKey: state.lastEventKey,
				ttlMs,
			});
		},
	};
}

function emptyTunedTtlState(): TunedTtlState {
	return {
		lastComputedAt: null,
		lastEventId: null,
		lastEventKey: null,
		verdict: null,
	};
}

function normalizeTunedTtlState(value: JsonObject): TunedTtlState {
	return {
		lastComputedAt: typeof value.lastComputedAt === "string" ? value.lastComputedAt : null,
		lastEventId: typeof value.lastEventId === "string" ? value.lastEventId : null,
		lastEventKey: typeof value.lastEventKey === "string" ? value.lastEventKey : null,
		verdict: value.verdict === undefined ? null : value.verdict,
	};
}

function isImmediateComputeLabel(label: SurpriseLabel): boolean {
	return label === "relevant-change" || label === "policy-drift";
}

function decisionReason(lastComputedAtMs: number | undefined, resetTtl: boolean): "first-event" | "input-label" | "ttl-expired" {
	if (lastComputedAtMs === undefined) {
		return "first-event";
	}
	if (resetTtl) {
		return "input-label";
	}
	return "ttl-expired";
}

function epochMs(value: string): number {
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Invalid timeline event timestamp: ${value}`);
	}
	return parsed;
}

function maybeEpochMs(value: string | null): number | undefined {
	if (value === null) {
		return undefined;
	}
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}
