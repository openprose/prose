import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import type { JsonObject, JsonValue, ReactorTimelineEvent, ReactorTimelineStepResult } from "../types.js";

export interface BaselineCacheFile<TState extends JsonObject> {
	kind: "prose.eval.timeline-baseline-cache.v1";
	state: TState;
}

export interface BaselineJudgeInput {
	event: ReactorTimelineEvent;
	eventKey: string;
	priorVerdict?: JsonValue;
}

export type BaselineJudge = (input: BaselineJudgeInput) => JsonValue | Promise<JsonValue>;

export function defaultBaselineJudge(input: BaselineJudgeInput): JsonValue {
	return {
		eventId: input.event.id,
		eventKey: input.eventKey,
		status: "computed",
	};
}

export async function readBaselineCache<TState extends JsonObject>(path: string, fallback: TState): Promise<TState> {
	try {
		const parsed = JSON.parse(await readFile(path, "utf8")) as BaselineCacheFile<TState>;
		if (parsed.kind === "prose.eval.timeline-baseline-cache.v1" && isJsonObject(parsed.state)) {
			return parsed.state;
		}
	} catch {
		// Missing or invalid cache files start from the adapter's declared fallback.
	}

	return fallback;
}

export async function writeBaselineCache<TState extends JsonObject>(path: string, state: TState): Promise<void> {
	const payload: BaselineCacheFile<TState> = {
		kind: "prose.eval.timeline-baseline-cache.v1",
		state,
	};
	await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function eventCanonicalKey(event: ReactorTimelineEvent): string {
	return sha256Hex(canonicalJson(eventKeyPayload(event)));
}

export function eventKeyPayload(event: ReactorTimelineEvent): JsonValue {
	return {
		label: event.label,
		payload: event.payload ?? null,
		payloadCid: event.payloadCid ?? null,
		trigger: event.trigger,
		type: event.type,
	};
}

export function stepResult(
	adapterName: string,
	event: ReactorTimelineEvent,
	decision: "compute" | "reuse" | "recheck" | "skip",
	metadata: JsonObject = {},
): ReactorTimelineStepResult {
	return {
		eventId: event.id,
		status: "passed",
		events: [
			{
				type: `baseline.${adapterName}.${decision}`,
				at: event.at,
				data: {
					eventId: event.id,
				},
			},
		],
		metadata: {
			adapterName,
			decision,
			...metadata,
		},
		metrics: {
			cacheHit: decision === "reuse" ? 1 : 0,
			modelCalls: decision === "compute" || decision === "recheck" ? 1 : 0,
		},
		stdout: `${adapterName}:${decision}:${event.id}\n`,
	};
}

export function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: JsonValue): string {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
	}

	const entries = Object.entries(value).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined);
	return `{${entries
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
		.join(",")}}`;
}

export function isJsonObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
