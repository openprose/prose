import { mkdir } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

import {
	EVAL_TASK_KIND,
	type EvalAdapter,
	type EvalAdapterContext,
	type EvalAttemptResult,
	type EvalEvent,
	type EvalExpectedOutcome,
	type EvalTask,
	type JsonObject,
	type JsonValue,
	type ReactorTimelineAdapter,
	type ReactorTimelineAdapterContext,
	type ReactorTimelineAdapterEventContext,
	type ReactorTimelineCase,
	type ReactorTimelineEvent,
	type ReactorTimelinePrepareResult,
	type ReactorTimelineStepResult,
	type ReactorTimelineTeardownResult,
} from "../types.js";

export interface TimelineEvalTaskBuilderInput {
	adapterName: string;
	context: ReactorTimelineAdapterEventContext;
	event: ReactorTimelineEvent;
	timelineCase: ReactorTimelineCase;
}

export type TimelineEvalTaskBuilder = (input: TimelineEvalTaskBuilderInput) => EvalTask;

export interface EvalAdapterTimelineAdapterOptions {
	adapter: EvalAdapter;
	buildTask?: TimelineEvalTaskBuilder;
	name?: string;
	taskExpected?: EvalExpectedOutcome;
}

export interface BuildTimelineEventEvalTaskOptions extends TimelineEvalTaskBuilderInput {
	expected?: EvalExpectedOutcome;
}

export interface UnsupportedTimelineAdapterOptions {
	name: string;
	reason: string;
}

interface ArtifactDirectory {
	absolutePath: string;
	relativePath: string;
}

interface ObservationMetrics extends Record<string, number> {
	acted: number;
	durationMs: number;
	escalated: number;
	exitCode: number;
	modelCalls: number;
	rechecked: number;
}

const DEFAULT_TASK_EXPECTED: EvalExpectedOutcome = {
	exitCode: 0,
};

export function createEvalAdapterTimelineAdapter(options: EvalAdapterTimelineAdapterOptions): ReactorTimelineAdapter {
	const name = options.name ?? options.adapter.name;
	const taskExpected = options.taskExpected ?? DEFAULT_TASK_EXPECTED;
	const buildTask =
		options.buildTask ??
		((input: TimelineEvalTaskBuilderInput) =>
			buildTimelineEventEvalTask({
				...input,
				expected: taskExpected,
			}));
	const preparedCases = new Map<string, ReactorTimelineCase>();

	return {
		name,
		async prepare(timelineCase, context): Promise<ReactorTimelinePrepareResult> {
			preparedCases.set(preparedCaseKey(context), timelineCase);
			await mkdir(adapterRunDirectory(context), { recursive: true });

			return {
				events: [
					{
						type: `competitor.${name}.prepared`,
						at: context.startedAt,
						data: {
							adapterName: name,
							adapterRunDirectory: adapterRunDirectory(context),
							caseId: timelineCase.id,
							eventCount: timelineCase.events.length,
						},
					},
				],
				metadata: {
					adapterName: name,
					adapterRunDirectory: adapterRunDirectory(context),
					competitorTimeline: true,
				},
			};
		},
		async onEvent(event, context): Promise<ReactorTimelineStepResult> {
			const timelineCase = preparedCases.get(preparedCaseKey(context));
			if (timelineCase === undefined) {
				return failClosedStep({
					name,
					event,
					context,
					reason: "timeline competitor adapter was not prepared before onEvent",
					status: "error",
					type: "not_prepared",
				});
			}

			const runDirectory = adapterRunDirectory(context);
			await mkdir(runDirectory, { recursive: true });
			const artifactDirectory = eventAttemptArtifactDirectory(context, event);
			if (artifactDirectory !== undefined) {
				await mkdir(artifactDirectory.absolutePath, { recursive: true });
			}

			const task = withoutTaskCwd(
				buildTask({
					adapterName: name,
					context,
					event,
					timelineCase,
				}),
			);
			const attemptContext: EvalAdapterContext = {
				adapterRunDirectory: runDirectory,
				...(artifactDirectory === undefined ? {} : { attemptArtifactDirectory: artifactDirectory.relativePath }),
				...(context.artifactStore === undefined ? {} : { artifactStore: context.artifactStore }),
				...(context.env === undefined ? {} : { env: context.env }),
				attemptId: `${context.attemptId}:${event.id}`,
				runId: context.runId,
				...(context.signal === undefined ? {} : { signal: context.signal }),
				startedAt: event.at,
			};

			try {
				const attempt = await options.adapter.runTask(task, attemptContext);
				return attemptToStepResult({
					attempt,
					attemptContext,
					context,
					event,
					name,
					task,
				});
			} catch (error) {
				return failClosedStep({
					name,
					event,
					context,
					reason: error instanceof Error ? error.message : String(error),
					status: "error",
					type: "run_error",
				});
			}
		},
		async teardown(timelineCase, context): Promise<ReactorTimelineTeardownResult> {
			preparedCases.delete(preparedCaseKey(context));

			return {
				events: [
					{
						type: `competitor.${name}.teardown`,
						at: context.startedAt,
						data: {
							adapterName: name,
							caseId: timelineCase.id,
						},
					},
				],
			};
		},
	};
}

export function buildTimelineEventEvalTask(options: BuildTimelineEventEvalTaskOptions): EvalTask {
	const caseContext = timelineCasePromptContext(options.timelineCase);
	const eventContext = timelineEventPromptContext(options.event, options.context.eventIndex);
	const contextText = stableJson({
		case: caseContext,
		event: eventContext,
	});
	const query = `Handle timeline event ${options.event.id} (${options.event.type}) for case ${options.timelineCase.id}.`;

	return {
		kind: EVAL_TASK_KIND,
		id: `${options.timelineCase.id}-${options.event.id}`,
		title: `${options.timelineCase.title} / ${options.event.id}`,
		contract: {
			source: {
				path: options.timelineCase.contract.source.path,
				sha256: options.timelineCase.contract.source.sha256,
			},
		},
		prompt: [
			"You are evaluating one Reactor timeline tick for a competitor harness.",
			"Use only the case context and the current event. Report observable behavior for this tick: model call, act, escalate, recheck.",
			"Do not produce Reactor proof graphs or proof verdicts.",
			"",
			contextText,
		].join("\n"),
		expected: options.expected ?? DEFAULT_TASK_EXPECTED,
		metadata: {
			adapterName: options.adapterName,
			context: contextText,
			evalFamily: "competitor-timeline",
			query,
			timelineCase: caseContext,
			timelineEvent: eventContext,
		},
		surpriseLabels: [options.event.label],
		tags: ["reactor-timeline", "competitor", options.adapterName],
	};
}

export function createUnsupportedTimelineAdapter(options: UnsupportedTimelineAdapterOptions): ReactorTimelineAdapter {
	return {
		name: options.name,
		async prepare(_timelineCase, context): Promise<ReactorTimelinePrepareResult> {
			await mkdir(context.scenarioCacheDirectory, { recursive: true });

			return {
				events: [
					{
						type: `competitor.${options.name}.unsupported_prepared`,
						at: context.startedAt,
						data: {
							adapterName: options.name,
							modelCalls: 0,
							reason: options.reason,
						},
					},
				],
				metadata: {
					adapterName: options.name,
					configurationRequired: true,
					reason: options.reason,
					unsupported: true,
				},
			};
		},
		async onEvent(event, context): Promise<ReactorTimelineStepResult> {
			return failClosedStep({
				name: options.name,
				event,
				context,
				reason: options.reason,
				status: "failed",
				type: "unsupported",
			});
		},
		async teardown(_timelineCase, context): Promise<ReactorTimelineTeardownResult> {
			return {
				events: [
					{
						type: `competitor.${options.name}.unsupported_teardown`,
						at: context.startedAt,
						data: {
							adapterName: options.name,
							modelCalls: 0,
						},
					},
				],
			};
		},
	};
}

function attemptToStepResult(options: {
	attempt: EvalAttemptResult;
	attemptContext: EvalAdapterContext;
	context: ReactorTimelineAdapterEventContext;
	event: ReactorTimelineEvent;
	name: string;
	task: EvalTask;
}): ReactorTimelineStepResult {
	const metrics = observationMetrics(options.attempt, options.event);
	const observable: JsonObject = {
		acted: metrics.acted > 0,
		escalated: metrics.escalated > 0,
		modelCall: metrics.modelCalls > 0,
		rechecked: metrics.rechecked > 0,
	};
	const eventData: JsonObject = {
		adapterName: options.name,
		adapterRunDirectory: options.attemptContext.adapterRunDirectory ?? "",
		attemptAdapterName: options.attempt.adapterName,
		attemptId: options.attemptContext.attemptId,
		eventId: options.event.id,
		eventIndex: options.context.eventIndex,
		exitCode: options.attempt.exitCode,
		observable,
		taskId: options.task.id,
	};
	if (options.attemptContext.attemptArtifactDirectory !== undefined) {
		eventData.attemptArtifactDirectory = options.attemptContext.attemptArtifactDirectory;
	}

	const events: EvalEvent[] = [
		...(metrics.modelCalls > 0
			? [
					{
						type: `competitor.${options.name}.model_call`,
						at: options.event.at,
						data: eventData,
					},
				]
			: []),
		...(options.attempt.events ?? []),
		{
			type: `competitor.${options.name}.step_completed`,
			at: options.event.at,
			data: eventData,
		},
	];
	const metadata: JsonObject = {
		adapterName: options.name,
		adapterRunDirectory: options.attemptContext.adapterRunDirectory ?? "",
		attemptAdapterName: options.attempt.adapterName,
		attemptId: options.attemptContext.attemptId,
		eventId: options.event.id,
		eventIndex: options.context.eventIndex,
		exitCode: options.attempt.exitCode,
		observable,
		taskId: options.task.id,
	};
	if (options.attemptContext.attemptArtifactDirectory !== undefined) {
		metadata.attemptArtifactDirectory = options.attemptContext.attemptArtifactDirectory;
	}
	if (options.attempt.metadata !== undefined) {
		metadata.attemptMetadata = options.attempt.metadata;
	}

	return {
		eventId: options.event.id,
		status: options.attempt.exitCode === 0 ? "passed" : "failed",
		...(options.attempt.artifacts === undefined ? {} : { artifacts: options.attempt.artifacts }),
		...(options.attempt.costs === undefined ? {} : { costs: options.attempt.costs }),
		events,
		metadata,
		metrics,
		stderr: options.attempt.stderr,
		stdout: options.attempt.stdout,
	};
}

function failClosedStep(options: {
	context: ReactorTimelineAdapterEventContext;
	event: ReactorTimelineEvent;
	name: string;
	reason: string;
	status: "failed" | "error";
	type: "not_prepared" | "run_error" | "unsupported";
}): ReactorTimelineStepResult {
	return {
		eventId: options.event.id,
		status: options.status,
		events: [
			{
				type: `competitor.${options.name}.${options.type}`,
				at: options.event.at,
				message: options.reason,
				data: {
					adapterName: options.name,
					eventId: options.event.id,
					eventIndex: options.context.eventIndex,
					modelCalls: 0,
					reason: options.reason,
				},
			},
		],
		metadata: {
			adapterName: options.name,
			configurationRequired: options.type === "unsupported",
			eventId: options.event.id,
			eventIndex: options.context.eventIndex,
			reason: options.reason,
			unsupported: options.type === "unsupported",
		},
		metrics: {
			acted: 0,
			escalated: 0,
			modelCalls: 0,
			rechecked: 0,
		},
		stderr: `${options.reason}\n`,
		stdout: "",
	};
}

function observationMetrics(attempt: EvalAttemptResult, event: ReactorTimelineEvent): ObservationMetrics {
	const inherited = numericMetrics(attempt.metrics);
	const output = `${attempt.stdout}\n${attempt.stderr}`;
	const eventText = attempt.events?.map((item) => `${item.type}\n${item.message ?? ""}`).join("\n") ?? "";
	const observableText = `${output}\n${eventText}`;
	const eventType = event.type.toLowerCase();
	const modelCalls = inherited.modelCalls ?? eventCount(attempt.events, /^model[._:-]?call$/i) ?? 1;
	const acted =
		inherited.acted ??
		boolMetric(
			matchesWord(observableText, ["act", "acted", "action", "tool", "effect", "executed", "patched", "wrote"]) ||
				eventTypeMatches(attempt.events, ["act", "action", "tool", "effect", "exec", "write"]),
		);
	const escalated =
		inherited.escalated ??
		boolMetric(
			matchesWord(observableText, ["escalate", "escalated", "escalation"]) ||
				eventTypeMatches(attempt.events, ["escalate", "escalation"]),
		);
	const rechecked =
		inherited.rechecked ??
		boolMetric(
			event.trigger === "scheduled" ||
				eventType.includes("recheck") ||
				matchesWord(observableText, ["recheck", "rechecked", "rechecking"]) ||
				eventTypeMatches(attempt.events, ["recheck", "rechecked"]),
		);

	return {
		...inherited,
		acted,
		durationMs: attempt.durationMs,
		escalated,
		exitCode: attempt.exitCode,
		modelCalls,
		rechecked,
	};
}

function numericMetrics(metrics: Readonly<Record<string, number>> | undefined): Record<string, number> {
	if (metrics === undefined) {
		return {};
	}

	return Object.fromEntries(Object.entries(metrics).filter((entry) => Number.isFinite(entry[1])));
}

function eventCount(events: readonly EvalEvent[] | undefined, pattern: RegExp): number | undefined {
	if (events === undefined) {
		return undefined;
	}

	const count = events.filter((event) => pattern.test(event.type)).length;
	return count === 0 ? undefined : count;
}

function boolMetric(value: boolean): number {
	return value ? 1 : 0;
}

function matchesWord(value: string, words: readonly string[]): boolean {
	const lower = value.toLowerCase();
	return words.some((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(lower));
}

function eventTypeMatches(events: readonly EvalEvent[] | undefined, words: readonly string[]): boolean {
	return (
		events?.some((event) =>
			words.some((word) => new RegExp(`(^|[._:-])${escapeRegExp(word)}($|[._:-])`, "i").test(event.type)),
		) ?? false
	);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function adapterRunDirectory(context: ReactorTimelineAdapterContext): string {
	return join(context.scenarioCacheDirectory, "adapter-run");
}

function eventAttemptArtifactDirectory(
	context: ReactorTimelineAdapterContext,
	event: ReactorTimelineEvent,
): ArtifactDirectory | undefined {
	if (context.artifactStore === undefined || context.artifactDirectory === undefined) {
		return undefined;
	}

	const absolutePath = join(context.artifactDirectory, "attempts", event.id);
	const relativePath = relative(context.artifactStore.root, absolutePath);
	if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
		throw new Error("timeline attemptArtifactDirectory must be under artifactStore.root");
	}

	return {
		absolutePath,
		relativePath,
	};
}

function withoutTaskCwd(task: EvalTask): EvalTask {
	if (task.cwd === undefined) {
		return task;
	}

	const { cwd: _cwd, ...taskWithoutCwd } = task;
	return taskWithoutCwd;
}

function preparedCaseKey(context: ReactorTimelineAdapterContext): string {
	return `${context.runId}:${context.caseId}:${context.scenarioCacheDirectory}`;
}

function timelineCasePromptContext(timelineCase: ReactorTimelineCase): JsonObject {
	const source = timelineCase.contract.source;
	const context: JsonObject = {
		contract: {
			source: {
				path: source.path,
				responsibilityId: source.responsibilityId,
				sha256: source.sha256,
				...(source.revision === undefined ? {} : { revision: source.revision }),
				...(source.signerTrustContext === undefined ? {} : { signerTrustContext: source.signerTrustContext }),
			},
		},
		eventCount: timelineCase.events.length,
		id: timelineCase.id,
		oracle: {
			cid: timelineCase.oracle.cid,
			forecastModelId: timelineCase.oracle.forecastModelId,
			kind: timelineCase.oracle.kind,
			policyCid: timelineCase.oracle.policyCid,
			preconditionSet: [...timelineCase.oracle.preconditionSet],
			recheckSchedule: [...timelineCase.oracle.recheckSchedule],
			recheckTolerance: timelineCase.oracle.recheckTolerance,
		},
		title: timelineCase.title,
	};
	if (timelineCase.claims !== undefined) {
		context.claims = [...timelineCase.claims];
	}
	if (timelineCase.limits !== undefined) {
		const limits: JsonObject = {};
		if (timelineCase.limits.maxCostUsd !== undefined) {
			limits.maxCostUsd = timelineCase.limits.maxCostUsd;
		}
		if (timelineCase.limits.maxModelCalls !== undefined) {
			limits.maxModelCalls = timelineCase.limits.maxModelCalls;
		}
		if (timelineCase.limits.maxWallTimeMs !== undefined) {
			limits.maxWallTimeMs = timelineCase.limits.maxWallTimeMs;
		}
		context.limits = limits;
	}
	if (timelineCase.metadata !== undefined) {
		context.metadata = timelineCase.metadata;
	}

	return context;
}

function timelineEventPromptContext(event: ReactorTimelineEvent, index: number): JsonObject {
	const context: JsonObject = {
		at: event.at,
		id: event.id,
		index,
		label: event.label,
		trigger: event.trigger,
		type: event.type,
	};
	if (event.payload !== undefined) {
		context.payload = event.payload;
	}
	if (event.payloadCid !== undefined) {
		context.payloadCid = event.payloadCid;
	}
	if (event.metadata !== undefined) {
		context.metadata = event.metadata;
	}

	return context;
}

function stableJson(value: JsonValue): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}
