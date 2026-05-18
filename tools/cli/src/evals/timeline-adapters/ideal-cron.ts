import { join } from "node:path";

import type {
	JsonObject,
	JsonValue,
	ReactorTimelineAdapter,
	ReactorTimelineAdapterContext,
	ReactorTimelineCase,
} from "../types.js";
import {
	type BaselineJudge,
	type BaselineJudgeInput,
	defaultBaselineJudge,
	eventCanonicalKey,
	readBaselineCache,
	stepResult,
	writeBaselineCache,
} from "./baseline-utils.js";

const ADAPTER_NAME = "ideal-cron";
const CACHE_FILE = "ideal-cron.json";

export interface IdealCronTimelineAdapterOptions {
	judge?: BaselineJudge;
}

interface IdealCronTimelineState extends JsonObject {
	recheckSchedule: string[];
	nextScheduleIndex: number;
	hasVerdict: boolean;
	lastEventKey: string | null;
	lastVerdict: JsonValue;
	rechecks: JsonObject[];
}

export function createIdealCronTimelineAdapter(
	options: IdealCronTimelineAdapterOptions = {},
): ReactorTimelineAdapter {
	const judge = options.judge ?? defaultBaselineJudge;
	let state: IdealCronTimelineState | undefined;

	return {
		name: ADAPTER_NAME,
		async prepare(timelineCase, context) {
			state = await readBaselineCache(
				cachePath(context),
				initialState(timelineCase),
			);
			state = normalizeState(state, timelineCase);
			await writeState(context, state);
			return {
				metadata: {
					adapterName: ADAPTER_NAME,
					nextScheduleIndex: state.nextScheduleIndex,
					recheckSchedule: state.recheckSchedule,
				},
			};
		},
		async onEvent(event, context) {
			const current = await readBaselineCache(
				cachePath(context),
				state ?? emptyState(),
			);
			state = current;

			const nextTick = state.recheckSchedule[state.nextScheduleIndex];
			if (nextTick === undefined || compareIso(event.at, nextTick) < 0) {
				await writeState(context, state);
				return stepResult(ADAPTER_NAME, event, "skip", {
					nextScheduleIndex: state.nextScheduleIndex,
					nextScheduleTick: nextTick ?? null,
				});
			}

			const eventKey = eventCanonicalKey(event);
			const judgeInput: BaselineJudgeInput = {
				event,
				eventKey,
				...(state.hasVerdict ? { priorVerdict: state.lastVerdict } : {}),
			};
			const verdict = await judge(judgeInput);
			const checkedTick = nextTick;
			const previousScheduleIndex = state.nextScheduleIndex;
			const nextScheduleIndex = advanceScheduleIndex(state.recheckSchedule, state.nextScheduleIndex, event.at);
			state = {
				...state,
				nextScheduleIndex,
				hasVerdict: true,
				lastEventKey: eventKey,
				lastVerdict: verdict,
				rechecks: [
					...state.rechecks,
					{
						eventId: event.id,
						eventKey,
						eventAt: event.at,
						scheduleIndex: previousScheduleIndex,
						scheduleTick: checkedTick,
					},
				],
			};
			await writeState(context, state);

			return stepResult(ADAPTER_NAME, event, "recheck", {
				eventKey,
				nextScheduleIndex,
				nextScheduleTick: state.recheckSchedule[nextScheduleIndex] ?? null,
				previousScheduleIndex,
				scheduleTick: checkedTick,
				verdict,
			});
		},
	};
}

function cachePath(context: ReactorTimelineAdapterContext): string {
	return join(context.scenarioCacheDirectory, CACHE_FILE);
}

function initialState(timelineCase: ReactorTimelineCase): IdealCronTimelineState {
	return {
		recheckSchedule: [...timelineCase.oracle.recheckSchedule],
		nextScheduleIndex: 0,
		hasVerdict: false,
		lastEventKey: null,
		lastVerdict: null,
		rechecks: [],
	};
}

function emptyState(): IdealCronTimelineState {
	return {
		recheckSchedule: [],
		nextScheduleIndex: 0,
		hasVerdict: false,
		lastEventKey: null,
		lastVerdict: null,
		rechecks: [],
	};
}

function normalizeState(
	state: IdealCronTimelineState,
	timelineCase: ReactorTimelineCase,
): IdealCronTimelineState {
	const recheckSchedule = [...timelineCase.oracle.recheckSchedule];
	const cachedSchedule = Array.isArray(state.recheckSchedule)
		? state.recheckSchedule.filter((tick): tick is string => typeof tick === "string")
		: [];
	const nextScheduleIndex =
		schedulesMatch(cachedSchedule, recheckSchedule)
			? clampScheduleIndex(state.nextScheduleIndex, recheckSchedule)
			: 0;

	return {
		recheckSchedule,
		nextScheduleIndex,
		hasVerdict: state.hasVerdict === true,
		lastEventKey: typeof state.lastEventKey === "string" ? state.lastEventKey : null,
		lastVerdict: state.lastVerdict ?? null,
		rechecks: Array.isArray(state.rechecks) ? state.rechecks : [],
	};
}

async function writeState(
	context: ReactorTimelineAdapterContext,
	state: IdealCronTimelineState,
): Promise<void> {
	await writeBaselineCache(cachePath(context), state);
}

function schedulesMatch(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((tick, index) => tick === right[index]);
}

function clampScheduleIndex(index: number, schedule: readonly string[]): number {
	if (!Number.isInteger(index)) {
		return 0;
	}
	return Math.min(Math.max(index, 0), schedule.length);
}

function advanceScheduleIndex(
	schedule: readonly string[],
	startIndex: number,
	eventAt: string,
): number {
	let nextIndex = startIndex;
	while (nextIndex < schedule.length && compareIso(eventAt, schedule[nextIndex]!) >= 0) {
		nextIndex += 1;
	}
	return nextIndex;
}

function compareIso(left: string, right: string): number {
	return Date.parse(left) - Date.parse(right);
}
