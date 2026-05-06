import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ProseRunStatus = "complete" | "failed";

export interface ProseRunResult {
	command: "run";
	status: ProseRunStatus;
	exitCode: number;
	target?: string;
	runId?: string;
	runPath?: string;
	bindingsPath?: string;
	error?: string;
}

export interface StructuredRunResultRequest {
	path: string;
	env: Record<string, string>;
	systemPromptAppend: string;
	cleanup(): void;
}

export function createStructuredRunResultRequest(): StructuredRunResultRequest {
	const directory = mkdtempSync(join(tmpdir(), "prose-run-result-"));
	const path = join(directory, "result.json");

	return {
		path,
		env: { PROSE_RUN_RESULT_PATH: path },
		systemPromptAppend: [
			"## OpenProse Structured Run Result",
			"",
			"When executing `prose run`, write a structured JSON run result to the",
			"absolute path in `PROSE_RUN_RESULT_PATH` before finishing. Do not print",
			"this JSON in the assistant response.",
			"",
			"Required shape on success:",
			"",
			"```json",
			"{",
			'  "command": "run",',
			'  "status": "complete",',
			'  "target": "<invoked target>",',
			'  "runId": "<durable run id>",',
			'  "runPath": "<absolute durable run path>",',
			'  "bindingsPath": "<absolute bindings path>"',
			"}",
			"```",
			"",
			"Required shape on failure:",
			"",
			"```json",
			"{",
			'  "command": "run",',
			'  "status": "failed",',
			'  "target": "<invoked target>",',
			'  "error": "<failure summary>"',
			"}",
			"```",
		].join("\n"),
		cleanup() {
			rmSync(directory, { recursive: true, force: true });
		},
	};
}

export function readStructuredRunResult(
	path: string,
	fallback: { exitCode: number; target?: string },
): ProseRunResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return missingStructuredRunResult(fallback);
	}

	const result = normalizeStructuredRunResult(parsed, fallback);
	if (result.status === "complete" && result.runId === undefined) {
		return failedRunResult({
			...fallback,
			error: "Harness completed without reporting a run ID.",
		});
	}

	return result;
}

export function failedRunResult(options: { exitCode?: number; target?: string; error: string }): ProseRunResult {
	const result: ProseRunResult = {
		command: "run",
		status: "failed",
		exitCode: options.exitCode === undefined || options.exitCode === 0 ? 1 : options.exitCode,
		error: options.error,
	};
	if (options.target !== undefined) {
		result.target = options.target;
	}
	return result;
}

function missingStructuredRunResult(fallback: { exitCode: number; target?: string }): ProseRunResult {
	const error =
		fallback.exitCode === 0
			? "Harness completed without reporting a run ID."
			: `Harness exited with code ${fallback.exitCode} without reporting a run ID.`;
	return failedRunResult({ ...fallback, error });
}

function normalizeStructuredRunResult(
	value: unknown,
	fallback: { exitCode: number; target?: string },
): ProseRunResult {
	if (typeof value !== "object" || value === null) {
		return failedRunResult({ ...fallback, error: "Structured run result was not a JSON object." });
	}

	const record = value as Record<string, unknown>;
	const status = record.status === "complete" ? "complete" : record.status === "failed" ? "failed" : undefined;
	if (status === undefined) {
		return failedRunResult({ ...fallback, error: "Structured run result is missing status." });
	}

	const result: ProseRunResult = {
		command: "run",
		status,
		exitCode: status === "complete" ? fallback.exitCode : fallback.exitCode === 0 ? 1 : fallback.exitCode,
	};
	const target = stringValue(record.target) ?? fallback.target;
	if (target !== undefined) {
		result.target = target;
	}
	const runId = stringValue(record.runId);
	if (runId !== undefined) {
		result.runId = runId;
	}
	const runPath = stringValue(record.runPath);
	if (runPath !== undefined) {
		result.runPath = runPath;
	}
	const bindingsPath = stringValue(record.bindingsPath);
	if (bindingsPath !== undefined) {
		result.bindingsPath = bindingsPath;
	}
	const error = stringValue(record.error);
	if (error !== undefined) {
		result.error = error;
	}

	return result;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
