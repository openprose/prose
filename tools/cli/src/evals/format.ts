import type { EvalSuiteRunResult } from "./types.js";

export function formatEvalSuiteSummary(result: EvalSuiteRunResult): string {
	const cost = result.totals.knownCostUsd.toFixed(6);
	const lines = [
		`eval run ${result.runId}`,
		`suite: ${result.suiteId}`,
		`adapter: ${result.adapterName}`,
		`status: ${result.status}`,
		`tasks: ${result.totals.passed}/${result.totals.tasks} passed`,
		`known_cost_usd: ${cost}`,
		`unknown_cost_records: ${result.totals.unknownCostRecords}`,
	];
	const reportUse = inferReportUse(result);
	if (reportUse !== undefined) {
		lines.push(`report_use: ${reportUse}`);
	}
	const debugOnlyAttempts = result.tasks.filter((task) => isDebugOnlyMetadata(task.attempt.metadata)).length;
	if (debugOnlyAttempts > 0) {
		lines.push(`debug_only_attempts: ${debugOnlyAttempts}`);
	}

	return lines.join("\n");
}

function inferReportUse(result: EvalSuiteRunResult): string | undefined {
	const values = new Set<string>();
	addReportUse(values, result.metadata);
	for (const task of result.tasks) {
		addReportUse(values, task.attempt.metadata);
		if (isDebugOnlyMetadata(task.attempt.metadata)) {
			values.add("debug-only");
		}
	}

	if (values.has("debug-only")) {
		return "debug-only";
	}
	if (values.size === 1) {
		return [...values][0];
	}
	if (values.size > 1) {
		return "mixed";
	}

	return undefined;
}

function addReportUse(values: Set<string>, metadata: EvalSuiteRunResult["metadata"]): void {
	const reportUse = metadata?.reportUse;
	if (typeof reportUse === "string" && reportUse.trim() !== "") {
		values.add(reportUse);
	}
}

function isDebugOnlyMetadata(metadata: EvalSuiteRunResult["metadata"]): boolean {
	return metadata?.debugOnly === true || metadata?.reportUse === "debug-only";
}
