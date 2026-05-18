export { createFilesystemArtifactStore } from "./artifact-store.js";
export type { FilesystemArtifactStoreOptions } from "./artifact-store.js";
export {
	createNamedEvalAdapter,
	EVAL_ADAPTER_NAMES,
	isEvalAdapterName,
	resolveEvalAdapterName,
} from "./adapter-registry.js";
export type { EvalAdapterName, EvalAdapterRegistryOptions } from "./adapter-registry.js";
export { runEvalCli } from "./cli.js";
export type { EvalCliIo, EvalCliOptions } from "./cli.js";
export { summarizeCostLedger } from "./cost-ledger.js";
export type { CostLedgerSummary } from "./cost-ledger.js";
export { fetchOpenRouterGenerationCost, openRouterGenerationToCostRecord } from "./costs/openrouter.js";
export type {
	OpenRouterCostClientOptions,
	OpenRouterCostRecordOptions,
	OpenRouterGenerationResponse,
} from "./costs/openrouter.js";
export {
	mcnemarExact,
	wilcoxonSignedRank,
} from "./results/statistics.js";
export type {
	McNemarExactResult,
	WilcoxonSignedRankResult,
} from "./results/statistics.js";
export {
	createPhase1bBaselineAdapters,
	notRunPhase1bCompetitorRows,
	phase1bStatisticalPilot,
	runPhase1bBaselinePilot,
	scorePhase1bTimelineRun,
	summarizePhase1bResults,
} from "./results/phase-1b.js";
export type {
	Phase1bBaselineRunOptions,
	Phase1bDecisionClass,
	Phase1bResultRow,
	Phase1bResultStatus,
	Phase1bResultsTableRow,
	Phase1bStatisticalPilotResult,
	Phase1bStepScore,
} from "./results/phase-1b.js";
export {
	generationIdsFromCostRecords,
	runOpenRouterCostLearningBatch,
} from "./costs/cost-learning.js";
export type {
	OpenRouterCostLearningBatchInput,
	OpenRouterCostLearningBatchOptions,
	OpenRouterCostLearningBatchResult,
	OpenRouterGenerationLookupFailure,
	OpenRouterLearnedCostEstimate,
} from "./costs/cost-learning.js";
export {
	DEFAULT_COST_LEARNING_MODEL,
	DEFAULT_OPENROUTER_BASE_URL,
	ModelCatalogClient,
	computeOpenRouterCreditDeltaUsd,
} from "./costs/model-catalog.js";
export type {
	ModelCatalogClientOptions,
	OpenRouterCreditsSnapshot,
	OpenRouterModelCatalogSnapshot,
	OpenRouterModelEndpointSnapshot,
} from "./costs/model-catalog.js";
export { runEvalSuite } from "./runner.js";
export type { EvalRunnerOptions } from "./runner.js";
export { scoreAttempt } from "./scorer.js";
export {
	computeCacheKeyCid,
	computeEdgeCid,
	computeNodeCid,
	validateReactorProofGraph,
	verdict,
} from "./proof-graph.js";
export type {
	ReactorProofAttestation,
	ReactorProofEdge,
	ReactorProofExternalEffect,
	ReactorProofGraphV1,
	ReactorProofIngressObservation,
	ReactorProofMetamorphicPair,
	ReactorProofNode,
	ReactorProofValidationResult,
	ReactorProofVerdict,
	ReactorProofVerdictStatus,
} from "./proof-graph.js";
export { EvalSchemaError, validateEvalSuite, validateReactorTimelineCase } from "./schema.js";
export { loadEvalSuite } from "./suite-loader.js";
export {
	BUILT_IN_EVAL_SUITE_NAMES,
	getBuiltInEvalSuite,
	isBuiltInEvalSuiteName,
	loadEvalSuiteByNameOrPath,
} from "./suite-registry.js";
export type { BuiltInEvalSuiteName } from "./suite-registry.js";
export { reactorNativeTinySuite } from "./suites/reactor-native-tiny.js";
export {
	PUBLIC_BENCHMARK_CANARY_SPECS,
	PUBLIC_BENCHMARK_COMPETITORS,
	PUBLIC_BENCHMARK_STACK_ORDER,
	createPublicBenchmarkCanarySuite,
	generatePublicBenchmarkCanaryTasks,
	publicBenchmarkCanarySuite,
} from "./public-benchmarks/index.js";
export type {
	GeneratePublicBenchmarkCanaryTasksOptions,
	PublicBenchmarkCanarySpec,
	PublicBenchmarkCompetitorId,
	PublicBenchmarkCompetitorSpec,
	PublicBenchmarkId,
} from "./public-benchmarks/index.js";
export {
	PHASE_1B_REACTOR_SCENARIO_CORPUS,
	PHASE_1B_REACTOR_SCENARIO_CORPUS_ID,
	PHASE_1B_REACTOR_SCENARIO_FAMILIES,
	PHASE_1B_REACTOR_SCENARIO_FAMILY_IDS,
	PHASE_1B_SCENARIOS_PER_FAMILY,
	computePhase1bOracleCid,
	computePhase1bPreregistrationHash,
	getPhase1bScenarioMetadata,
} from "./scenarios/phase-1b-corpus.js";
export type {
	Phase1bGoldTraceEntry,
	Phase1bPreregistration,
	Phase1bScenarioFamily,
	Phase1bScenarioFamilyId,
	Phase1bScenarioMetadata,
	Phase1bScenarioRole,
} from "./scenarios/phase-1b-corpus.js";
export { runReactorTimelineCase } from "./timeline-runner.js";
export type { ReactorTimelineRunnerOptions } from "./timeline-runner.js";
export { createAdaptiveCronTimelineAdapter } from "./timeline-adapters/adaptive-cron.js";
export type { AdaptiveCronTimelineAdapterOptions } from "./timeline-adapters/adaptive-cron.js";
export { createDiffcacheTimelineAdapter } from "./timeline-adapters/diffcache.js";
export type { DiffcacheTimelineAdapterOptions } from "./timeline-adapters/diffcache.js";
export {
	DEFAULT_DIFFCACHE_PLUS_THRESHOLD,
	createDiffcachePlusTimelineAdapter,
} from "./timeline-adapters/diffcache-plus.js";
export type {
	DiffcachePlusEmbeddingProvider,
	DiffcachePlusTimelineAdapterOptions,
} from "./timeline-adapters/diffcache-plus.js";
export { createIdealCronTimelineAdapter } from "./timeline-adapters/ideal-cron.js";
export type { IdealCronTimelineAdapterOptions } from "./timeline-adapters/ideal-cron.js";
export { createTunedTtlTimelineAdapter } from "./timeline-adapters/tuned-ttl.js";
export type { TunedTtlTimelineAdapterOptions } from "./timeline-adapters/tuned-ttl.js";
export {
	DEFAULT_DSPY_OPENROUTER_COMPETITOR_MODEL,
	DEFAULT_OPENROUTER_COMPETITOR_MODEL,
	createCodexTimelineAdapter,
	createDspyRlmTimelineAdapter,
	createHermesTimelineAdapter,
	createOpenClawTimelineAdapter,
	createPiTimelineAdapter,
} from "./timeline-adapters/competitors.js";
export type {
	CodexTimelineAdapterOptions,
	DspyRlmTimelineAdapterOptions,
	HermesTimelineAdapterOptions,
	OpenClawTimelineAdapterOptions,
	PiTimelineAdapterOptions,
} from "./timeline-adapters/competitors.js";
export {
	buildTimelineEventEvalTask,
	createDockerIsolatedTimelineAdapter,
	createEvalAdapterTimelineAdapter,
	createUnsupportedTimelineAdapter,
} from "./timeline-adapters/competitor-wrapper.js";
export type {
	BuildTimelineEventEvalTaskOptions,
	DockerIsolatedTimelineAdapterOptions,
	EvalAdapterTimelineAdapterOptions,
	TimelineDockerIsolationOptions,
	TimelineEvalTaskBuilder,
	TimelineEvalTaskBuilderInput,
	UnsupportedTimelineAdapterOptions,
} from "./timeline-adapters/competitor-wrapper.js";
export { createDockerIsolationPlan } from "./isolation/docker-substrate.js";
export type { DockerIsolationPlanOptions } from "./isolation/docker-substrate.js";
export {
	appendProxyModelCallRecord,
	createAuthenticatedEgressProxy,
	readProxyModelCallRecords,
} from "./isolation/egress-proxy.js";
export type {
	AuthenticatedEgressProxy,
	AuthenticatedEgressProxyOptions,
	AuthenticatedEgressProxyRequestContext,
	EgressProxyFetch,
	ProxyHttpRequestMetadata,
	ProxyHttpResponseMetadata,
	ProxyModelCallRecord,
} from "./isolation/egress-proxy.js";
export {
	appendKernelEffect,
	createKernelEffectLog,
	readKernelEffects,
	reconcileKernelEffects,
} from "./isolation/effect-log.js";
export type { KernelEffectLog, KernelEffectLogOptions } from "./isolation/effect-log.js";
export {
	createDockerComposeCommandRunner,
	dockerComposeRunner,
	runDockerIsolation,
} from "./isolation/live-runner.js";
export type {
	DockerComposeCommandRunnerOptions,
	DockerComposeRunOptions,
	DockerComposeRunResult,
	DockerComposeRunner,
	DockerIsolationLiveRunnerOptions,
	DockerIsolationLiveRunResult,
} from "./isolation/live-runner.js";
export type {
	IsolationDockerService,
	IsolationDockerVolume,
	IsolationEffectKind,
	IsolationRunIdentity,
	IsolationSubstrateKind,
	IsolationSubstratePlan,
	KernelEffectLogEntry,
	KernelEffectReconciliation,
	ProxyModelCallNode,
} from "./isolation/types.js";
export { formatEvalSuiteSummary } from "./format.js";
export { createMockEvalAdapter } from "./adapters/mock.js";
export type { MockEvalAdapterOptions, MockEvalAdapterResponse } from "./adapters/mock.js";
export { createProcessEvalAdapter } from "./adapters/process.js";
export type { ProcessEvalAdapterOptions } from "./adapters/process.js";
export {
	DEFAULT_DSPY_PACKAGE_SPEC,
	DEFAULT_DSPY_RLM_MODEL,
	buildDspyRlmCommand,
	createDspyRlmEvalAdapter,
} from "./adapters/dspy-rlm.js";
export type { DspyRlmEvalAdapterOptions } from "./adapters/dspy-rlm.js";
export { DEFAULT_HERMES_PACKAGE_SPEC, buildHermesCommand, createHermesEvalAdapter } from "./adapters/hermes.js";
export type { HermesEvalAdapterOptions } from "./adapters/hermes.js";
export { DEFAULT_PI_PACKAGE_SPEC, buildPiCommand, createPiEvalAdapter, createPiPrintEvalAdapter } from "./adapters/pi.js";
export type { PiEvalAdapterMode, PiEvalAdapterOptions, PiRpcRunner, PiRpcRunOptions, PiRpcRunResult } from "./adapters/pi.js";
export {
	EVAL_SUITE_KIND,
	EVAL_TASK_KIND,
	EVAL_CLAIM_ELIGIBILITY_KIND,
	REACTOR_CLAIMS,
	REACTOR_ORACLE_SPEC_KIND,
	REACTOR_PROOF_KIND,
	REACTOR_PROOF_MEDIA_TYPE,
	REACTOR_TIMELINE_CASE_KIND,
	REACTOR_TIMELINE_EVENT_TRIGGERS,
	REACTOR_TIMELINE_CASE_MEDIA_TYPE,
	REPORT_USES,
	SURPRISE_LABELS,
	normalizeReportUse,
	type CostConfidence,
	type EvalAdapter,
	type EvalAdapterContext,
	type EvalArtifact,
	type EvalArtifactStore,
	type EvalAttemptResult,
	type EvalClaimEligibilityGate,
	type EvalClaimEligibilityRecord,
	type EvalClaimEligibilityReason,
	type EvalClaimEligibilityReasonCode,
	type EvalClaimEligibilityReport,
	type EvalClaimEligibilityVerdict,
	type EvalCostRecord,
	type EvalEvent,
	type EvalExpectedOutcome,
	type EvalScore,
	type EvalScoreCheck,
	type EvalSuite,
	type EvalSuiteRunResult,
	type EvalTask,
	type EvalTaskContract,
	type EvalTaskContractSource,
	type EvalTaskRunResult,
	type JsonObject,
	type JsonPrimitive,
	type JsonValue,
	type ReportUse,
	type SurpriseLabel,
	type ReactorClaim,
	type ReactorTimelineAdapter,
	type ReactorTimelineAdapterContext,
	type ReactorTimelineAdapterEventContext,
	type ReactorTimelineCase,
	type ReactorTimelineContract,
	type ReactorTimelineContractSource,
	type ReactorTimelineEvent,
	type ReactorTimelineEventTrigger,
	type ReactorTimelineLimits,
	type ReactorTimelineOracleSpec,
	type ReactorTimelinePrepareResult,
	type ReactorTimelineRunResult,
	type ReactorTimelineStepResult,
	type ReactorTimelineTeardownResult,
} from "./types.js";
