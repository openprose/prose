export const EVAL_SUITE_KIND = "prose.eval.suite.v1";
export const EVAL_TASK_KIND = "prose.eval.task.v1";
export const EVAL_CLAIM_ELIGIBILITY_KIND = "prose.eval.claim-eligibility.v1";
export const REACTOR_TIMELINE_CASE_KIND = "prose.reactor.timeline-case.v1";
export const REACTOR_PROOF_KIND = "prose.reactor.proof.v1";
export const REACTOR_TIMELINE_CASE_MEDIA_TYPE = "application/vnd.prose.reactor.timeline-case+json";
export const REACTOR_PROOF_MEDIA_TYPE = "application/vnd.prose.reactor.proof+json";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ReportUse = "debug" | "adapter-canary" | "report-eligible";

export const REPORT_USES: readonly ReportUse[] = ["debug", "adapter-canary", "report-eligible"];

export function normalizeReportUse(value: unknown): ReportUse | undefined {
	if (value === "debug-only") {
		return "debug";
	}

	return REPORT_USES.includes(value as ReportUse) ? (value as ReportUse) : undefined;
}

export type SurpriseLabel =
	| "noop"
	| "relevant-change"
	| "silent-drift"
	| "ambiguity"
	| "escalation"
	| "policy-drift";

export const SURPRISE_LABELS: readonly SurpriseLabel[] = [
	"noop",
	"relevant-change",
	"silent-drift",
	"ambiguity",
	"escalation",
	"policy-drift",
];

export type CostConfidence =
	| "unknown"
	| "local-token-estimate"
	| "price-projected"
	| "response-usage"
	| "provider-reconciled";

export interface EvalExpectedOutcome {
	allowUnknownCost?: boolean;
	exitCode?: number;
	stdoutContains?: readonly string[];
	stdoutExcludes?: readonly string[];
	stderrContains?: readonly string[];
	stderrExcludes?: readonly string[];
	eventTypes?: readonly string[];
	maxKnownCostUsd?: number;
	requiresCost?: boolean;
}

export interface EvalTaskContractSource {
	path: string;
	sha256?: string;
}

export interface EvalTaskContract {
	source: EvalTaskContractSource;
}

export interface EvalTask {
	kind: typeof EVAL_TASK_KIND;
	id: string;
	title: string;
	contract?: EvalTaskContract;
	prompt: string;
	expected: EvalExpectedOutcome;
	cwd?: string;
	metadata?: JsonObject;
	surpriseLabels?: readonly SurpriseLabel[];
	tags?: readonly string[];
	timeoutMs?: number;
}

export interface EvalSuite {
	kind: typeof EVAL_SUITE_KIND;
	id: string;
	title: string;
	tasks: readonly EvalTask[];
	metadata?: JsonObject;
}

export interface EvalArtifact {
	path: string;
	mediaType: string;
	bytes: number;
}

export interface EvalArtifactStore {
	readonly root: string;
	appendJsonl(relativePath: string, value: JsonValue): Promise<EvalArtifact>;
	writeJson(relativePath: string, value: JsonValue): Promise<EvalArtifact>;
	writeText(relativePath: string, value: string, mediaType?: string): Promise<EvalArtifact>;
}

export interface EvalEvent {
	type: string;
	at: string;
	data?: JsonObject;
	message?: string;
	surpriseLabel?: SurpriseLabel;
}

export interface EvalCostRecord {
	id: string;
	runId: string;
	taskId: string;
	attemptId: string;
	adapterName: string;
	confidence: CostConfidence;
	occurredAt: string;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	completionTokens?: number;
	currency?: "USD";
	generationId?: string;
	metadata?: JsonObject;
	model?: string;
	promptTokens?: number;
	provider?: string;
	role?: string;
	surpriseLabel?: SurpriseLabel;
	totalCostUsd?: number;
	totalTokens?: number;
}

export interface EvalAttemptResult {
	adapterName: string;
	durationMs: number;
	exitCode: number;
	stdout: string;
	stderr: string;
	artifacts?: readonly EvalArtifact[];
	costs?: readonly EvalCostRecord[];
	events?: readonly EvalEvent[];
	metadata?: JsonObject;
	metrics?: Readonly<Record<string, number>>;
}

export interface EvalAdapterContext {
	adapterRunDirectory?: string;
	attemptArtifactDirectory?: string;
	artifactStore?: EvalArtifactStore;
	attemptId: string;
	env?: Record<string, string | undefined>;
	runId: string;
	signal?: AbortSignal;
	startedAt: string;
}

export interface EvalAdapter {
	readonly name: string;
	runTask(task: EvalTask, context: EvalAdapterContext): Promise<EvalAttemptResult>;
}

export interface EvalScoreCheck {
	name: string;
	passed: boolean;
	actual?: JsonValue;
	expected?: JsonValue;
	message?: string;
}

export interface EvalScore {
	checks: readonly EvalScoreCheck[];
	maxPoints: number;
	passed: boolean;
	points: number;
}

export type EvalClaimEligibilityReasonCode =
	| "adapter_canary_report_use"
	| "custom_task_cwd"
	| "debug_report_use"
	| "missing_native_validator"
	| "missing_reactor_proof"
	| "missing_reactor_timeline_case"
	| "missing_normalized_trace"
	| "missing_receipts"
	| "missing_replay"
	| "missing_report_use"
	| "missing_source_contract_path"
	| "missing_source_contract_sha"
	| "source_contract_sha_mismatch"
	| "task_failed"
	| "task_missing"
	| "unreadable_source_contract"
	| "mock_adapter";

export interface EvalClaimEligibilityReason {
	code: EvalClaimEligibilityReasonCode;
	message: string;
	actual?: JsonValue;
	expected?: JsonValue;
	scope: "run" | "task";
	taskId?: string;
}

export interface EvalClaimEligibilityGate {
	name: string;
	passed: boolean;
	actual?: JsonValue;
	expected?: JsonValue;
	taskId?: string;
}

export interface EvalClaimEligibilityReport {
	adapterName: string;
	generatedAt: string;
	gates: readonly EvalClaimEligibilityGate[];
	kind: typeof EVAL_CLAIM_ELIGIBILITY_KIND;
	reasons: readonly EvalClaimEligibilityReason[];
	reportEligible: boolean;
	runId: string;
	suiteId: string;
	version: 1;
}

export interface EvalTaskRunResult {
	adapterName: string;
	attempt: EvalAttemptResult;
	attemptId: string;
	completedAt: string;
	contract?: EvalTaskContract;
	metadata?: JsonObject;
	score: EvalScore;
	startedAt: string;
	status: "passed" | "failed";
	taskId: string;
}

export interface EvalSuiteRunResult {
	adapterName: string;
	claimEligibility: EvalClaimEligibilityReport;
	completedAt: string;
	metadata?: JsonObject;
	runId: string;
	startedAt: string;
	status: "passed" | "failed";
	suiteId: string;
	tasks: readonly EvalTaskRunResult[];
	totals: {
		failed: number;
		knownCostUsd: number;
		passed: number;
		tasks: number;
		unknownCostRecords: number;
	};
}
