import { summarizeCostLedger } from "./cost-ledger.js";
import type { EvalAttemptResult, EvalCostRecord, EvalExpectedOutcome, EvalScore, EvalScoreCheck } from "./types.js";

export function scoreAttempt(attempt: EvalAttemptResult, expected: EvalExpectedOutcome): EvalScore {
	const checks: EvalScoreCheck[] = [];

	if (expected.exitCode !== undefined) {
		checks.push({
			name: "exitCode",
			passed: attempt.exitCode === expected.exitCode,
			actual: attempt.exitCode,
			expected: expected.exitCode,
		});
	}

	pushContainsChecks(checks, "stdoutContains", attempt.stdout, expected.stdoutContains);
	pushExcludesChecks(checks, "stdoutExcludes", attempt.stdout, expected.stdoutExcludes);
	pushContainsChecks(checks, "stderrContains", attempt.stderr, expected.stderrContains);
	pushExcludesChecks(checks, "stderrExcludes", attempt.stderr, expected.stderrExcludes);

	if (expected.eventTypes !== undefined) {
		const actual = new Set((attempt.events ?? []).map((event) => event.type));
		for (const type of expected.eventTypes) {
			checks.push({
				name: `eventTypes:${type}`,
				passed: actual.has(type),
				actual: [...actual].sort(),
				expected: type,
			});
		}
	}

	if (expected.maxKnownCostUsd !== undefined) {
		const costs = attempt.costs ?? [];
		const summary = summarizeCostLedger(costs);
		checks.push({
			name: "costRecordsPresent",
			passed: costs.length > 0,
			actual: costs.length,
			expected: "at least one cost record",
			message: "Cost limits require at least one cost ledger record.",
		});
		checks.push({
			name: "maxKnownCostUsd",
			passed: costs.length > 0 && summary.knownCostUsd <= expected.maxKnownCostUsd,
			actual: summary.knownCostUsd,
			expected: expected.maxKnownCostUsd,
		});
		checks.push({
			name: "unknownCostRecords",
			passed: expected.allowUnknownCost === true || summary.unknownCostRecords === 0,
			actual: summary.unknownCostRecords,
			expected: expected.allowUnknownCost === true ? "allowed" : 0,
		});
	} else if (expected.requiresCost === true) {
		const costs = attempt.costs ?? [];
		const missingCostEvidence = costs.filter((cost) => !hasCostEvidence(cost)).length;
		const hasRequiredCostEvidence = costs.some(hasCostEvidence) || (expected.allowUnknownCost === true && costs.length > 0);
		checks.push({
			name: "costRecordsPresent",
			passed: costs.length > 0,
			actual: costs.length,
			expected: "at least one cost record",
		});
		checks.push({
			name: "costEvidencePresent",
			passed: hasRequiredCostEvidence,
			actual: costs.map((cost) => cost.confidence),
			expected:
				expected.allowUnknownCost === true
					? "at least one known cost/token record or explicitly allowed unknown record"
					: "at least one non-unknown cost or token record",
		});
		checks.push({
			name: "unknownCostRecords",
			passed: expected.allowUnknownCost === true || missingCostEvidence === 0,
			actual: missingCostEvidence,
			expected: expected.allowUnknownCost === true ? "allowed" : 0,
			message: "requiresCost needs known cost or token evidence unless allowUnknownCost is true.",
		});
	}

	const maxPoints = checks.length;
	const points = checks.filter((check) => check.passed).length;

	return {
		checks,
		maxPoints,
		passed: checks.every((check) => check.passed),
		points,
	};
}

function hasCostEvidence(cost: EvalCostRecord): boolean {
	if (cost.confidence === "unknown") {
		return false;
	}

	return [
		cost.cacheReadTokens,
		cost.cacheWriteTokens,
		cost.completionTokens,
		cost.promptTokens,
		cost.totalCostUsd,
		cost.totalTokens,
	].some((value) => typeof value === "number" && Number.isFinite(value));
}

function pushContainsChecks(
	checks: EvalScoreCheck[],
	name: "stdoutContains" | "stderrContains",
	haystack: string,
	needles: readonly string[] | undefined,
): void {
	if (needles === undefined) {
		return;
	}

	for (const needle of needles) {
		checks.push({
			name: `${name}:${needle}`,
			passed: haystack.includes(needle),
			actual: haystack,
			expected: needle,
		});
	}
}

function pushExcludesChecks(
	checks: EvalScoreCheck[],
	name: "stdoutExcludes" | "stderrExcludes",
	haystack: string,
	needles: readonly string[] | undefined,
): void {
	if (needles === undefined) {
		return;
	}

	for (const needle of needles) {
		checks.push({
			name: `${name}:${needle}`,
			passed: !haystack.includes(needle),
			actual: haystack,
			expected: needle,
		});
	}
}
