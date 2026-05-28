import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { JsonObject, JsonValue, ReactorTimelineAdapter, ReactorTimelineEvent } from "../types.js";
import {
	type BaselineJudge,
	defaultBaselineJudge,
	eventCanonicalKey,
	readBaselineCache,
	stepResult,
	writeBaselineCache,
} from "./baseline-utils.js";

export const ADAPTIVE_CRON_CACHE_FILE = "adaptive-cron.json";
export const DEFAULT_ADAPTIVE_CRON_INITIAL_INTERVAL_MS = 60 * 60 * 1000;
export const DEFAULT_ADAPTIVE_CRON_MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ADAPTIVE_CRON_BACKOFF_FACTOR = 2;

export interface AdaptiveCronTimelineAdapterOptions {
	backoffFactor?: number;
	baselineJudge?: BaselineJudge;
	initialIntervalMs?: number;
	maxIntervalMs?: number;
	name?: string;
}

interface AdaptiveCronState extends JsonObject {
	hasVerdict: boolean;
	intervalMs: number;
	lastEventKey: string | null;
	lastVerdict: JsonValue;
	nextDueAt: string;
}

const RESET_LABELS = new Set(["ambiguity", "escalation", "policy-drift", "relevant-change"]);
const SCHEDULED_LABELS = new Set(["noop", "silent-drift"]);

export function createAdaptiveCronTimelineAdapter(options: AdaptiveCronTimelineAdapterOptions = {}): ReactorTimelineAdapter {
	const name = options.name ?? "adaptive-cron";
	const baselineJudge = options.baselineJudge ?? defaultBaselineJudge;
	const initialIntervalMs = positiveNumber(
		options.initialIntervalMs ?? DEFAULT_ADAPTIVE_CRON_INITIAL_INTERVAL_MS,
		"initialIntervalMs",
	);
	const maxIntervalMs = positiveNumber(options.maxIntervalMs ?? DEFAULT_ADAPTIVE_CRON_MAX_INTERVAL_MS, "maxIntervalMs");
	if (maxIntervalMs < initialIntervalMs) {
		throw new Error("adaptive-cron maxIntervalMs must be greater than or equal to initialIntervalMs");
	}
	const backoffFactor = atLeastOne(
		options.backoffFactor ?? DEFAULT_ADAPTIVE_CRON_BACKOFF_FACTOR,
		"backoffFactor",
	);

	return {
		name,
		async onEvent(event, context) {
			await mkdir(context.scenarioCacheDirectory, { recursive: true });
			const cachePath = join(context.scenarioCacheDirectory, ADAPTIVE_CRON_CACHE_FILE);
			const state = await readBaselineCache(cachePath, fallbackState(event, initialIntervalMs));

			if (RESET_LABELS.has(event.label)) {
				const eventKey = eventCanonicalKey(event);
				const verdict = await baselineJudge({
					event,
					eventKey,
					...(state.hasVerdict ? { priorVerdict: state.lastVerdict } : {}),
				});
				const nextState = computedState({
					event,
					eventKey,
					intervalMs: initialIntervalMs,
					verdict,
				});
				await writeBaselineCache(cachePath, nextState);

				return stepResult(name, event, "compute", {
					eventKey,
					intervalMs: nextState.intervalMs,
					nextDueAt: nextState.nextDueAt,
					resetInterval: true,
				});
			}

			if (SCHEDULED_LABELS.has(event.label) && eventTime(event) >= timestamp(state.nextDueAt)) {
				const eventKey = eventCanonicalKey(event);
				const verdict = await baselineJudge({
					event,
					eventKey,
					...(state.hasVerdict ? { priorVerdict: state.lastVerdict } : {}),
				});
				const intervalMs = Math.min(Math.ceil(state.intervalMs * backoffFactor), maxIntervalMs);
				const nextState = computedState({
					event,
					eventKey,
					intervalMs,
					verdict,
				});
				await writeBaselineCache(cachePath, nextState);

				return stepResult(name, event, state.hasVerdict ? "recheck" : "compute", {
					eventKey,
					intervalMs: nextState.intervalMs,
					nextDueAt: nextState.nextDueAt,
				});
			}

			return stepResult(name, event, "skip", {
				intervalMs: state.intervalMs,
				nextDueAt: state.nextDueAt,
			});
		},
	};
}

function fallbackState(event: ReactorTimelineEvent, initialIntervalMs: number): AdaptiveCronState {
	return {
		hasVerdict: false,
		intervalMs: initialIntervalMs,
		lastEventKey: null,
		lastVerdict: null,
		nextDueAt: event.at,
	};
}

function computedState(options: {
	event: ReactorTimelineEvent;
	eventKey: string;
	intervalMs: number;
	verdict: JsonValue;
}): AdaptiveCronState {
	return {
		hasVerdict: true,
		intervalMs: options.intervalMs,
		lastEventKey: options.eventKey,
		lastVerdict: options.verdict,
		nextDueAt: addMs(options.event.at, options.intervalMs),
	};
}

function addMs(isoTimestamp: string, intervalMs: number): string {
	return new Date(timestamp(isoTimestamp) + intervalMs).toISOString();
}

function eventTime(event: ReactorTimelineEvent): number {
	return timestamp(event.at);
}

function timestamp(value: string): number {
	const parsed = Date.parse(value);
	if (Number.isNaN(parsed)) {
		throw new Error(`adaptive-cron received invalid timestamp: ${value}`);
	}
	return parsed;
}

function positiveNumber(value: number, name: string): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`adaptive-cron ${name} must be a positive finite number`);
	}
	return value;
}

function atLeastOne(value: number, name: string): number {
	if (!Number.isFinite(value) || value < 1) {
		throw new Error(`adaptive-cron ${name} must be greater than or equal to 1`);
	}
	return value;
}
