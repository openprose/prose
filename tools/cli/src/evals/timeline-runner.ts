import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertSafePathSegment } from "./safety.js";
import { validateReactorTimelineCase } from "./schema.js";
import { REACTOR_TIMELINE_CASE_MEDIA_TYPE, type EvalArtifact, type EvalEvent, type JsonObject } from "./types.js";
import type {
	ReactorTimelineAdapter,
	ReactorTimelineAdapterContext,
	ReactorTimelineCase,
	ReactorTimelineRunResult,
	ReactorTimelineStepResult,
} from "./types.js";

export interface ReactorTimelineRunnerOptions {
	artifactStore?: ReactorTimelineAdapterContext["artifactStore"];
	attemptId?: string;
	env?: ReactorTimelineAdapterContext["env"];
	now?: () => Date;
	runId?: string;
	scenarioCacheRoot?: string;
	signal?: AbortSignal;
}

export async function runReactorTimelineCase(
	timelineCaseInput: ReactorTimelineCase,
	adapter: ReactorTimelineAdapter,
	options: ReactorTimelineRunnerOptions = {},
): Promise<ReactorTimelineRunResult> {
	const timelineCase = validateReactorTimelineCase(timelineCaseInput);
	const now = options.now ?? (() => new Date());
	const runId = assertSafePathSegment(options.runId ?? randomUUID(), "runId");
	const adapterName = assertSafePathSegment(adapter.name, "adapter.name");
	const caseId = timelineCase.id;
	const attemptId = options.attemptId ?? `${runId}:${caseId}:timeline`;
	const startedAt = now().toISOString();
	const scenarioCacheRoot = options.scenarioCacheRoot ?? (await mkdtemp(join(tmpdir(), "prose-reactor-timeline-cache-")));
	const scenarioCacheDirectory = join(scenarioCacheRoot, caseId, adapterName);
	const artifactDirectory =
		options.artifactStore === undefined ? undefined : join(options.artifactStore.root, runId, "timeline", caseId, adapterName);
	const context: ReactorTimelineAdapterContext = {
		adapterName,
		...(artifactDirectory === undefined ? {} : { artifactDirectory }),
		...(options.artifactStore === undefined ? {} : { artifactStore: options.artifactStore }),
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
		attemptId,
		caseId,
		runId,
		scenarioCacheDirectory,
		startedAt,
	};
	const artifacts: EvalArtifact[] = [];
	const events: EvalEvent[] = [
		{
			type: "reactor.timeline.started",
			at: startedAt,
			data: {
				adapterName,
				attemptId,
				caseId,
				eventCount: timelineCase.events.length,
				runId,
				scenarioCacheDirectory,
			},
		},
	];
	const steps: ReactorTimelineStepResult[] = [];
	let metadata: JsonObject | undefined;
	let failed = false;

	await mkdir(scenarioCacheDirectory, { recursive: true });
	if (artifactDirectory !== undefined) {
		await mkdir(artifactDirectory, { recursive: true });
	}

	if (options.artifactStore !== undefined) {
		artifacts.push(
			await options.artifactStore.writeText(
				`${runId}/timeline/${caseId}/${adapterName}/timeline-case.json`,
				`${JSON.stringify(timelineCase, null, 2)}\n`,
				REACTOR_TIMELINE_CASE_MEDIA_TYPE,
			),
		);
	}

	try {
		const prepare = await adapter.prepare?.(timelineCase, context);
		if (prepare !== undefined) {
			artifacts.push(...(prepare.artifacts ?? []));
			events.push(...(prepare.events ?? []));
			metadata = mergeMetadata(metadata, prepare.metadata);
		}

		for (const [eventIndex, event] of timelineCase.events.entries()) {
			const stepStartedAt = now().toISOString();
			events.push({
				type: "reactor.timeline.event_started",
				at: stepStartedAt,
				data: {
					attemptId,
					caseId,
					eventId: event.id,
					eventIndex,
					runId,
				},
			});

			try {
				const step = await adapter.onEvent(event, {
					...context,
					eventIndex,
				});
				steps.push(step);
				artifacts.push(...(step.artifacts ?? []));
				events.push(...(step.events ?? []));
				metadata = mergeMetadata(metadata, step.metadata);
				if (step.status === "failed" || step.status === "error") {
					failed = true;
				}
			} catch (error) {
				failed = true;
				const message = error instanceof Error ? error.message : String(error);
				steps.push({
					eventId: event.id,
					status: "error",
					stderr: `${message}\n`,
					stdout: "",
				});
				events.push({
					type: "reactor.timeline.event_error",
					at: now().toISOString(),
					message,
					data: {
						attemptId,
						caseId,
						eventId: event.id,
						eventIndex,
						runId,
					},
				});
				break;
			}
		}
	} finally {
		try {
			const teardown = await adapter.teardown?.(timelineCase, context);
			if (teardown !== undefined) {
				artifacts.push(...(teardown.artifacts ?? []));
				events.push(...(teardown.events ?? []));
				metadata = mergeMetadata(metadata, teardown.metadata);
			}
		} catch (error) {
			failed = true;
			events.push({
				type: "reactor.timeline.teardown_error",
				at: now().toISOString(),
				message: error instanceof Error ? error.message : String(error),
				data: {
					attemptId,
					caseId,
					runId,
				},
			});
		}
	}

	const completedAt = now().toISOString();
	events.push({
		type: "reactor.timeline.completed",
		at: completedAt,
		data: {
			adapterName,
			attemptId,
			caseId,
			runId,
			status: failed ? "failed" : "passed",
			steps: steps.length,
		},
	});

	return {
		adapterName,
		artifacts,
		attemptId,
		caseId,
		completedAt,
		costs: steps.flatMap((step) => step.costs ?? []),
		events,
		...(metadata === undefined ? {} : { metadata }),
		runId,
		scenarioCacheDirectory,
		startedAt,
		status: failed ? "failed" : "passed",
		steps,
	};
}

function mergeMetadata(left: JsonObject | undefined, right: JsonObject | undefined): JsonObject | undefined {
	if (right === undefined) {
		return left;
	}

	return {
		...(left ?? {}),
		...right,
	};
}
