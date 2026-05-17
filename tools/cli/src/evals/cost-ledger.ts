import type { CostConfidence, EvalCostRecord } from "./types.js";

export interface CostLedgerSummary {
	byConfidence: Readonly<Record<CostConfidence, number>>;
	knownCostUsd: number;
	records: number;
	unknownCostRecords: number;
}

const COST_CONFIDENCES: readonly CostConfidence[] = [
	"unknown",
	"local-token-estimate",
	"price-projected",
	"response-usage",
	"provider-reconciled",
];

export function summarizeCostLedger(records: readonly EvalCostRecord[]): CostLedgerSummary {
	const byConfidence: Record<CostConfidence, number> = {
		unknown: 0,
		"local-token-estimate": 0,
		"price-projected": 0,
		"response-usage": 0,
		"provider-reconciled": 0,
	};
	let knownCostUsd = 0;
	let unknownCostRecords = 0;

	for (const record of records) {
		if (!COST_CONFIDENCES.includes(record.confidence)) {
			byConfidence.unknown += 1;
		} else {
			byConfidence[record.confidence] += 1;
		}

		if (typeof record.totalCostUsd === "number" && Number.isFinite(record.totalCostUsd)) {
			knownCostUsd += record.totalCostUsd;
		} else {
			unknownCostRecords += 1;
		}
	}

	return {
		byConfidence,
		knownCostUsd,
		records: records.length,
		unknownCostRecords,
	};
}
