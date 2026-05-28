import { isAbsolute, win32 } from "node:path";

import {
	EVAL_SUITE_KIND,
	EVAL_TASK_KIND,
	REACTOR_CLAIMS,
	REACTOR_ORACLE_SPEC_KIND,
	REACTOR_TIMELINE_CASE_KIND,
	REACTOR_TIMELINE_EVENT_TRIGGERS,
	REPORT_USES,
	SURPRISE_LABELS,
	normalizeReportUse,
	type EvalSuite,
	type ReactorClaim,
	type ReactorTimelineCase,
	type ReactorTimelineEventTrigger,
	type SurpriseLabel,
} from "./types.js";
import { assertSafePathSegment } from "./safety.js";

export class EvalSchemaError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EvalSchemaError";
	}
}

export function validateEvalSuite(value: unknown): EvalSuite {
	const suite = objectAt(value, "suite");
	if (suite.kind !== EVAL_SUITE_KIND) {
		throw new EvalSchemaError(`suite.kind must be ${EVAL_SUITE_KIND}`);
	}

	assertSafePathSegment(requireNonEmptyString(suite.id, "suite.id"), "suite.id");
	requireNonEmptyString(suite.title, "suite.title");
	requireMetadataReportUse(suite.metadata, "suite.metadata");

	if (!Array.isArray(suite.tasks) || suite.tasks.length === 0) {
		throw new EvalSchemaError("suite.tasks must contain at least one task");
	}

	const ids = new Set<string>();
	for (let index = 0; index < suite.tasks.length; index += 1) {
		const task = objectAt(suite.tasks[index], `suite.tasks[${index}]`);
		if (task.kind !== EVAL_TASK_KIND) {
			throw new EvalSchemaError(`suite.tasks[${index}].kind must be ${EVAL_TASK_KIND}`);
		}

		const id = assertSafePathSegment(requireNonEmptyString(task.id, `suite.tasks[${index}].id`), `suite.tasks[${index}].id`);
		if (ids.has(id)) {
			throw new EvalSchemaError(`suite.tasks contains duplicate id: ${id}`);
		}
		ids.add(id);

		requireNonEmptyString(task.title, `suite.tasks[${index}].title`);
		requireNonEmptyString(task.prompt, `suite.tasks[${index}].prompt`);
		requireExpectedOutcome(task.expected, `suite.tasks[${index}].expected`);
		requireMetadataReportUse(task.metadata, `suite.tasks[${index}].metadata`);

		if (task.contract !== undefined) {
			requireTaskContract(task.contract, `suite.tasks[${index}].contract`);
		}

		if (task.cwd !== undefined) {
			const cwd = requireNonEmptyString(task.cwd, `suite.tasks[${index}].cwd`);
			if (cwd.includes("\0")) {
				throw new EvalSchemaError(`suite.tasks[${index}].cwd must not contain NUL`);
			}
		}

		if (task.timeoutMs !== undefined) {
			requirePositiveNumber(task.timeoutMs, `suite.tasks[${index}].timeoutMs`);
		}

		if (task.surpriseLabels !== undefined) {
			requireSurpriseLabels(task.surpriseLabels, `suite.tasks[${index}].surpriseLabels`);
		}
	}

	return suite as unknown as EvalSuite;
}

export function validateReactorTimelineCase(value: unknown): ReactorTimelineCase {
	const timelineCase = objectAt(value, "timelineCase");
	requireAllowedKeys(
		timelineCase,
		new Set(["claims", "contract", "events", "id", "kind", "limits", "metadata", "oracle", "title", "version"]),
		"timelineCase",
	);

	if (timelineCase.kind !== REACTOR_TIMELINE_CASE_KIND) {
		throw new EvalSchemaError(`timelineCase.kind must be ${REACTOR_TIMELINE_CASE_KIND}`);
	}
	if (timelineCase.version !== 1) {
		throw new EvalSchemaError("timelineCase.version must be 1");
	}

	assertSafePathSegment(requireNonEmptyString(timelineCase.id, "timelineCase.id"), "timelineCase.id");
	requireNonEmptyString(timelineCase.title, "timelineCase.title");
	requireTimelineContract(timelineCase.contract, "timelineCase.contract");
	requireTimelineOracle(timelineCase.oracle, "timelineCase.oracle");
	requireTimelineEvents(timelineCase.events, "timelineCase.events");

	if (timelineCase.claims !== undefined) {
		requireReactorClaims(timelineCase.claims, "timelineCase.claims");
	}
	if (timelineCase.limits !== undefined) {
		requireTimelineLimits(timelineCase.limits, "timelineCase.limits");
	}
	if (timelineCase.metadata !== undefined) {
		objectAt(timelineCase.metadata, "timelineCase.metadata");
	}

	return timelineCase as unknown as ReactorTimelineCase;
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new EvalSchemaError(`${path} must be an object`);
	}

	return value as Record<string, unknown>;
}

function requireAllowedKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			throw new EvalSchemaError(`${path}.${key} is not supported`);
		}
	}
}

function requireNonEmptyString(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new EvalSchemaError(`${path} must be a non-empty string`);
	}

	return value;
}

function requirePositiveNumber(value: unknown, path: string): void {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new EvalSchemaError(`${path} must be a positive finite number`);
	}
}

function requireNonNegativeNumber(value: unknown, path: string): void {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new EvalSchemaError(`${path} must be a non-negative finite number`);
	}
}

function requireBoolean(value: unknown, path: string): void {
	if (typeof value !== "boolean") {
		throw new EvalSchemaError(`${path} must be a boolean`);
	}
}

function requireExpectedOutcome(value: unknown, path: string): void {
	const expected = objectAt(value, path);
	const allowed = new Set([
		"allowUnknownCost",
		"eventTypes",
		"exitCode",
		"maxKnownCostUsd",
		"requiresCost",
		"stderrContains",
		"stderrExcludes",
		"stdoutContains",
		"stdoutExcludes",
	]);

	for (const key of Object.keys(expected)) {
		if (!allowed.has(key)) {
			throw new EvalSchemaError(`${path}.${key} is not supported`);
		}
	}

	if (Object.keys(expected).length === 0) {
		throw new EvalSchemaError(`${path} must define at least one assertion`);
	}

	if (expected.allowUnknownCost !== undefined) {
		requireBoolean(expected.allowUnknownCost, `${path}.allowUnknownCost`);
	}
	if (expected.exitCode !== undefined) {
		if (!Number.isInteger(expected.exitCode) || (expected.exitCode as number) < 0) {
			throw new EvalSchemaError(`${path}.exitCode must be a non-negative integer`);
		}
	}
	if (expected.maxKnownCostUsd !== undefined) {
		requireNonNegativeNumber(expected.maxKnownCostUsd, `${path}.maxKnownCostUsd`);
	}
	if (expected.requiresCost !== undefined) {
		requireBoolean(expected.requiresCost, `${path}.requiresCost`);
	}

	requireStringArray(expected.eventTypes, `${path}.eventTypes`);
	requireStringArray(expected.stderrContains, `${path}.stderrContains`);
	requireStringArray(expected.stderrExcludes, `${path}.stderrExcludes`);
	requireStringArray(expected.stdoutContains, `${path}.stdoutContains`);
	requireStringArray(expected.stdoutExcludes, `${path}.stdoutExcludes`);
}

function requireTaskContract(value: unknown, path: string): void {
	const contract = objectAt(value, path);
	const allowed = new Set(["source"]);
	for (const key of Object.keys(contract)) {
		if (!allowed.has(key)) {
			throw new EvalSchemaError(`${path}.${key} is not supported`);
		}
	}

	const source = objectAt(contract.source, `${path}.source`);
	const sourceAllowed = new Set(["path", "sha256"]);
	for (const key of Object.keys(source)) {
		if (!sourceAllowed.has(key)) {
			throw new EvalSchemaError(`${path}.source.${key} is not supported`);
		}
	}

	requireSafeMarkdownSourcePath(source.path, `${path}.source.path`);
	if (source.sha256 !== undefined) {
		const sha256 = requireNonEmptyString(source.sha256, `${path}.source.sha256`);
		requireSha256(sha256, `${path}.source.sha256`);
	}
}

function requireTimelineContract(value: unknown, path: string): void {
	const contract = objectAt(value, path);
	requireAllowedKeys(contract, new Set(["source"]), path);

	const source = objectAt(contract.source, `${path}.source`);
	requireAllowedKeys(
		source,
		new Set(["path", "responsibilityId", "revision", "sha256", "signerTrustContext"]),
		`${path}.source`,
	);
	requireSafeMarkdownSourcePath(source.path, `${path}.source.path`);
	requireSha256(requireNonEmptyString(source.sha256, `${path}.source.sha256`), `${path}.source.sha256`);
	assertSafePathSegment(
		requireNonEmptyString(source.responsibilityId, `${path}.source.responsibilityId`),
		`${path}.source.responsibilityId`,
	);
	if (source.revision !== undefined) {
		requireNonEmptyString(source.revision, `${path}.source.revision`);
	}
	if (source.signerTrustContext !== undefined) {
		requireNonEmptyString(source.signerTrustContext, `${path}.source.signerTrustContext`);
	}
}

function requireTimelineOracle(value: unknown, path: string): void {
	const oracle = objectAt(value, path);
	requireAllowedKeys(
		oracle,
		new Set(["cid", "forecastModelId", "kind", "policyCid", "preconditionSet", "recheckSchedule", "recheckTolerance"]),
		path,
	);
	if (oracle.kind !== REACTOR_ORACLE_SPEC_KIND) {
		throw new EvalSchemaError(`${path}.kind must be ${REACTOR_ORACLE_SPEC_KIND}`);
	}
	requireSha256(requireNonEmptyString(oracle.cid, `${path}.cid`), `${path}.cid`);
	requireSha256(requireNonEmptyString(oracle.policyCid, `${path}.policyCid`), `${path}.policyCid`);
	requireNonEmptyString(oracle.forecastModelId, `${path}.forecastModelId`);
	requireStringArray(oracle.recheckSchedule, `${path}.recheckSchedule`);
	requireNonNegativeNumber(oracle.recheckTolerance, `${path}.recheckTolerance`);
	requireSha256Array(oracle.preconditionSet, `${path}.preconditionSet`);
}

function requireTimelineEvents(value: unknown, path: string): void {
	if (!Array.isArray(value) || value.length === 0) {
		throw new EvalSchemaError(`${path} must contain at least one event`);
	}

	const ids = new Set<string>();
	for (const [index, item] of value.entries()) {
		const event = objectAt(item, `${path}[${index}]`);
		requireAllowedKeys(
			event,
			new Set(["at", "id", "label", "metadata", "payload", "payloadCid", "trigger", "type"]),
			`${path}[${index}]`,
		);

		const id = assertSafePathSegment(requireNonEmptyString(event.id, `${path}[${index}].id`), `${path}[${index}].id`);
		if (ids.has(id)) {
			throw new EvalSchemaError(`${path} contains duplicate id: ${id}`);
		}
		ids.add(id);

		requireIsoDateTime(event.at, `${path}[${index}].at`);
		requireNonEmptyString(event.type, `${path}[${index}].type`);
		if (!SURPRISE_LABELS.includes(event.label as SurpriseLabel)) {
			throw new EvalSchemaError(`${path}[${index}].label must be one of: ${SURPRISE_LABELS.join(", ")}`);
		}
		if (!REACTOR_TIMELINE_EVENT_TRIGGERS.includes(event.trigger as ReactorTimelineEventTrigger)) {
			throw new EvalSchemaError(
				`${path}[${index}].trigger must be one of: ${REACTOR_TIMELINE_EVENT_TRIGGERS.join(", ")}`,
			);
		}
		if (event.payloadCid !== undefined) {
			requireSha256(requireNonEmptyString(event.payloadCid, `${path}[${index}].payloadCid`), `${path}[${index}].payloadCid`);
		}
		if (event.payload !== undefined) {
			requireJsonValue(event.payload, `${path}[${index}].payload`);
		}
		if (event.metadata !== undefined) {
			objectAt(event.metadata, `${path}[${index}].metadata`);
		}
	}
}

function requireReactorClaims(value: unknown, path: string): void {
	if (!Array.isArray(value) || value.length === 0) {
		throw new EvalSchemaError(`${path} must be a non-empty claim array`);
	}

	const claims = new Set<string>();
	for (const [index, claim] of value.entries()) {
		if (!REACTOR_CLAIMS.includes(claim as ReactorClaim)) {
			throw new EvalSchemaError(`${path}[${index}] must be one of: ${REACTOR_CLAIMS.join(", ")}`);
		}
		if (claims.has(claim as string)) {
			throw new EvalSchemaError(`${path} contains duplicate claim: ${String(claim)}`);
		}
		claims.add(claim as string);
	}
}

function requireTimelineLimits(value: unknown, path: string): void {
	const limits = objectAt(value, path);
	requireAllowedKeys(limits, new Set(["maxCostUsd", "maxModelCalls", "maxWallTimeMs"]), path);
	for (const key of ["maxCostUsd", "maxModelCalls", "maxWallTimeMs"] as const) {
		if (limits[key] !== undefined) {
			requirePositiveNumber(limits[key], `${path}.${key}`);
		}
	}
}

function requireSafeMarkdownSourcePath(value: unknown, path: string): void {
	const sourcePath = requireNonEmptyString(value, path);
	if (sourcePath.includes("\0")) {
		throw new EvalSchemaError(`${path} must not contain NUL`);
	}
	if (sourcePath.includes("\\") || isAbsolute(sourcePath) || win32.isAbsolute(sourcePath)) {
		throw new EvalSchemaError(`${path} must be a relative POSIX path`);
	}
	if (sourcePath.includes("://") || sourcePath.startsWith("file:")) {
		throw new EvalSchemaError(`${path} must not be a URL`);
	}
	if (!sourcePath.endsWith(".prose.md")) {
		throw new EvalSchemaError(`${path} must point to a *.prose.md Markdown source`);
	}

	for (const [index, segment] of sourcePath.split("/").entries()) {
		if (segment === "" || segment === "." || segment === "..") {
			throw new EvalSchemaError(`${path} contains unsafe segment at index ${index}`);
		}
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)) {
			throw new EvalSchemaError(`${path} contains unsafe segment: ${segment}`);
		}
	}
}

function requireIsoDateTime(value: unknown, path: string): void {
	const text = requireNonEmptyString(value, path);
	if (Number.isNaN(Date.parse(text))) {
		throw new EvalSchemaError(`${path} must be an ISO-8601 date-time string`);
	}
}

function requireSha256(value: string, path: string): void {
	if (!/^[a-f0-9]{64}$/i.test(value)) {
		throw new EvalSchemaError(`${path} must be a 64-character hex sha256`);
	}
}

function requireSha256Array(value: unknown, path: string): void {
	if (!Array.isArray(value)) {
		throw new EvalSchemaError(`${path} must be an array`);
	}

	for (const [index, item] of value.entries()) {
		requireSha256(requireNonEmptyString(item, `${path}[${index}]`), `${path}[${index}]`);
	}
}

function requireJsonValue(value: unknown, path: string): void {
	if (value === null || typeof value === "string" || typeof value === "boolean") {
		return;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new EvalSchemaError(`${path} must be JSON-serializable`);
		}
		return;
	}
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			requireJsonValue(item, `${path}[${index}]`);
		}
		return;
	}
	if (typeof value === "object") {
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			if (item === undefined) {
				throw new EvalSchemaError(`${path}.${key} must be JSON-serializable`);
			}
			requireJsonValue(item, `${path}.${key}`);
		}
		return;
	}

	throw new EvalSchemaError(`${path} must be JSON-serializable`);
}

function requireStringArray(value: unknown, path: string): void {
	if (value === undefined) {
		return;
	}

	if (!Array.isArray(value) || value.length === 0) {
		throw new EvalSchemaError(`${path} must be a non-empty string array`);
	}

	for (const [index, item] of value.entries()) {
		requireNonEmptyString(item, `${path}[${index}]`);
	}
}

function requireMetadataReportUse(value: unknown, path: string): void {
	if (value === undefined) {
		return;
	}

	const metadata = objectAt(value, path);
	if (metadata.reportUse !== undefined && normalizeReportUse(metadata.reportUse) === undefined) {
		throw new EvalSchemaError(
			`${path}.reportUse must be one of: ${REPORT_USES.join(", ")} (legacy debug-only is accepted)`,
		);
	}
}

function requireSurpriseLabels(value: unknown, path: string): void {
	if (!Array.isArray(value)) {
		throw new EvalSchemaError(`${path} must be an array`);
	}

	for (const [index, label] of value.entries()) {
		if (!SURPRISE_LABELS.includes(label as SurpriseLabel)) {
			throw new EvalSchemaError(`${path}[${index}] must be one of: ${SURPRISE_LABELS.join(", ")}`);
		}
	}
}
