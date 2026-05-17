import type { EvalSuiteRunResult } from "./types.js";

export function formatEvalSuiteSummary(result: EvalSuiteRunResult): string {
	const cost = result.totals.knownCostUsd.toFixed(6);
	return [
		`eval run ${result.runId}`,
		`suite: ${result.suiteId}`,
		`adapter: ${result.adapterName}`,
		`status: ${result.status}`,
		`tasks: ${result.totals.passed}/${result.totals.tasks} passed`,
		`known_cost_usd: ${cost}`,
		`unknown_cost_records: ${result.totals.unknownCostRecords}`,
	].join("\n");
}
