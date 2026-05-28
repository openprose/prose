import { createHash } from "node:crypto";

import {
	REACTOR_ORACLE_SPEC_KIND,
	REACTOR_TIMELINE_CASE_KIND,
	type JsonObject,
	type ReactorClaim,
	type ReactorTimelineCase,
	type ReactorTimelineEvent,
	type ReactorTimelineEventTrigger,
	type ReactorTimelineLimits,
	type ReactorTimelineOracleSpec,
	type SurpriseLabel,
} from "../types.js";

export const PHASE_1B_REACTOR_SCENARIO_CORPUS_ID = "phase-1b-reactor-scenarios";
export const PHASE_1B_SCENARIOS_PER_FAMILY = 20;

export const PHASE_1B_REACTOR_SCENARIO_FAMILY_IDS = [
	"family-2-quiet-drift",
	"family-5-fail-safe-interrupt",
	"family-7-provenance",
	"family-8-cost-attribution",
] as const;

export type Phase1bScenarioFamilyId = (typeof PHASE_1B_REACTOR_SCENARIO_FAMILY_IDS)[number];
export type Phase1bScenarioRole = "control" | "twin";

export interface Phase1bScenarioFamily {
	id: Phase1bScenarioFamilyId;
	familyNumber: number;
	slug: string;
	title: string;
	claims: readonly ReactorClaim[];
	source: {
		path: string;
		sha256: string;
	};
}

export interface Phase1bGoldTraceEntry extends JsonObject {
	eventId: string;
	expected: string;
	label: SurpriseLabel;
	ordinal: number;
	rationale: string;
}

export interface Phase1bPreregistration extends JsonObject {
	algorithm: "sha256-canonical-json-v1";
	hash: string;
}

export interface Phase1bScenarioMetadata extends JsonObject {
	corpus: typeof PHASE_1B_REACTOR_SCENARIO_CORPUS_ID;
	familyId: Phase1bScenarioFamilyId;
	familyNumber: number;
	familyTitle: string;
	goldTrace: Phase1bGoldTraceEntry[];
	metamorphicIngredient: string;
	metamorphicPairId: string;
	metamorphicRole: Phase1bScenarioRole;
	metamorphicTwinId: string;
	oracleData: JsonObject;
	preregistration: Phase1bPreregistration;
	reportUse: "report-eligible";
	responsibilityFixturePath: string;
	scenarioOrdinal: number;
}

interface FamilySpec extends Phase1bScenarioFamily {
	invariant: string;
	predicateId: string;
	pairs: readonly ScenarioPairSeed[];
	recheckTolerance: number;
}

interface ScenarioPairSeed {
	baseline: string;
	ingredient: string;
	key: string;
	left: ScenarioVariantSeed;
	right: ScenarioVariantSeed;
	subject: string;
}

interface ScenarioVariantSeed {
	code: "a" | "b";
	expectedAction: string;
	missingPrecondition?: string;
	observed: string;
	primaryLabel: SurpriseLabel;
	mutation: string;
	reconciledCostUsd?: number;
}

interface EventDraft {
	expected: string;
	id: string;
	label: SurpriseLabel;
	payload: JsonObject;
	rationale: string;
	trigger: ReactorTimelineEventTrigger;
	type: string;
}

const SOURCE_BY_FAMILY: Record<Phase1bScenarioFamilyId, Phase1bScenarioFamily["source"]> = {
	"family-2-quiet-drift": {
		path: "src/evals/scenarios/quiet-drift-responsibilities.prose.md",
		sha256: "eef0f07bb3aebaabb84d2937176be2885dc0fb97d1a388a143c9135aa1cedd48",
	},
	"family-5-fail-safe-interrupt": {
		path: "src/evals/scenarios/fail-safe-interrupt-responsibilities.prose.md",
		sha256: "7ebeb88e5719977fed2f868a57f885caec29ec188b06ce319678173a17ea7142",
	},
	"family-7-provenance": {
		path: "src/evals/scenarios/provenance-responsibilities.prose.md",
		sha256: "d89d1fa232cea163447858102fbf0eb28df602a41d842a35622564b86bd04297",
	},
	"family-8-cost-attribution": {
		path: "src/evals/scenarios/cost-attribution-responsibilities.prose.md",
		sha256: "c85d95889b1970fa1c1fe06e3eb96a71465a57922ad92b8f11ea91f3e1084d20",
	},
};

const QUIET_DRIFT_PAIRS: readonly ScenarioPairSeed[] = [
	{
		key: "settlement-cutoff",
		subject: "public ACH settlement cutoff",
		baseline: "same-day settlement remains open until 17:00 UTC",
		ingredient: "forecast-observed-value",
		left: {
			code: "a",
			mutation: "holiday calendar moves the cutoff earlier",
			observed: "same-day settlement closes at 15:00 UTC",
			primaryLabel: "silent-drift",
			expectedAction: "invalidate the stale payment-window decision",
		},
		right: {
			code: "b",
			mutation: "maintenance bulletin moves the cutoff earlier",
			observed: "same-day settlement closes at 16:00 UTC",
			primaryLabel: "silent-drift",
			expectedAction: "invalidate the stale routing-window decision",
		},
	},
	{
		key: "service-level-window",
		subject: "public support service-level page",
		baseline: "premium queue response target is four hours",
		ingredient: "forecast-policy-cid",
		left: {
			code: "a",
			mutation: "status page changes the target to six hours",
			observed: "premium queue response target is six hours",
			primaryLabel: "silent-drift",
			expectedAction: "refresh the escalation forecast before reusing the answer",
		},
		right: {
			code: "b",
			mutation: "regional appendix changes the target to next business day",
			observed: "premium queue response target is next business day",
			primaryLabel: "policy-drift",
			expectedAction: "replace the reused service-level decision",
		},
	},
	{
		key: "compliance-effective-date",
		subject: "public compliance effective date",
		baseline: "new disclosure rule starts on 2026-07-01",
		ingredient: "forecast-schedule",
		left: {
			code: "a",
			mutation: "public notice advances the start date",
			observed: "new disclosure rule starts on 2026-06-15",
			primaryLabel: "silent-drift",
			expectedAction: "schedule an earlier compliance review",
		},
		right: {
			code: "b",
			mutation: "public notice delays the start date",
			observed: "new disclosure rule starts on 2026-08-01",
			primaryLabel: "silent-drift",
			expectedAction: "revise the deadline-dependent recommendation",
		},
	},
	{
		key: "feature-flag-default",
		subject: "hosted feature-flag default",
		baseline: "public beta exports are disabled by default",
		ingredient: "ingress-presence-bit",
		left: {
			code: "a",
			mutation: "flag registry flips the public default",
			observed: "public beta exports are enabled by default",
			primaryLabel: "silent-drift",
			expectedAction: "stop reusing the old rollout decision",
		},
		right: {
			code: "b",
			mutation: "flag registry introduces an account-tier override",
			observed: "public beta exports are enabled for enterprise tier",
			primaryLabel: "ambiguity",
			expectedAction: "require a tier-specific recheck before reuse",
		},
	},
	{
		key: "inventory-state",
		subject: "public inventory availability feed",
		baseline: "replacement unit is in stock",
		ingredient: "observed-value-cid",
		left: {
			code: "a",
			mutation: "availability feed marks the unit backordered",
			observed: "replacement unit is backordered",
			primaryLabel: "silent-drift",
			expectedAction: "replace the fulfillment decision",
		},
		right: {
			code: "b",
			mutation: "availability feed marks the unit discontinued",
			observed: "replacement unit is discontinued",
			primaryLabel: "silent-drift",
			expectedAction: "escalate the fulfillment decision for human review",
		},
	},
	{
		key: "policy-page-status",
		subject: "public retention policy page",
		baseline: "export retention is 30 days",
		ingredient: "policy-cid",
		left: {
			code: "a",
			mutation: "policy page changes retention to 14 days",
			observed: "export retention is 14 days",
			primaryLabel: "policy-drift",
			expectedAction: "update the retention answer and cache key",
		},
		right: {
			code: "b",
			mutation: "policy page adds a plan-specific 7-day retention",
			observed: "export retention is 7 days for starter plans",
			primaryLabel: "policy-drift",
			expectedAction: "avoid reuse until the plan is bound",
		},
	},
	{
		key: "exchange-rate-band",
		subject: "published exchange-rate band",
		baseline: "conversion band remains under two percent",
		ingredient: "forecast-threshold",
		left: {
			code: "a",
			mutation: "rate feed crosses the two percent band",
			observed: "conversion band is 2.6 percent",
			primaryLabel: "silent-drift",
			expectedAction: "rerun the quote decision with fresh rates",
		},
		right: {
			code: "b",
			mutation: "rate feed crosses the five percent exception band",
			observed: "conversion band is 5.2 percent",
			primaryLabel: "escalation",
			expectedAction: "escalate the quote before reuse",
		},
	},
	{
		key: "routing-table",
		subject: "public webhook routing table",
		baseline: "webhook v2 routes to region us-east",
		ingredient: "cache-key-route",
		left: {
			code: "a",
			mutation: "routing table moves v2 to region us-west",
			observed: "webhook v2 routes to region us-west",
			primaryLabel: "silent-drift",
			expectedAction: "invalidate the cached endpoint decision",
		},
		right: {
			code: "b",
			mutation: "routing table adds a regional exception for eu-central",
			observed: "webhook v2 routes eu accounts to eu-central",
			primaryLabel: "ambiguity",
			expectedAction: "require account-region evidence before reuse",
		},
	},
	{
		key: "incident-status",
		subject: "public incident status",
		baseline: "incident is monitoring-only",
		ingredient: "forecast-breach",
		left: {
			code: "a",
			mutation: "status page reopens the incident",
			observed: "incident is active again",
			primaryLabel: "silent-drift",
			expectedAction: "replace the calm-state recommendation",
		},
		right: {
			code: "b",
			mutation: "status page expands the impacted component list",
			observed: "incident impacts the billing component",
			primaryLabel: "silent-drift",
			expectedAction: "rerun the component-specific decision",
		},
	},
	{
		key: "downstream-deadline",
		subject: "public downstream filing deadline",
		baseline: "filing closes at 23:59 UTC",
		ingredient: "scheduled-recheck",
		left: {
			code: "a",
			mutation: "public portal closes filing at 18:00 UTC",
			observed: "filing closes at 18:00 UTC",
			primaryLabel: "silent-drift",
			expectedAction: "warn before the earlier deadline",
		},
		right: {
			code: "b",
			mutation: "public portal pauses filing during a maintenance window",
			observed: "filing pauses from 19:00 UTC to 21:00 UTC",
			primaryLabel: "ambiguity",
			expectedAction: "split the deadline recommendation around the pause",
		},
	},
];

const FAIL_SAFE_INTERRUPT_PAIRS: readonly ScenarioPairSeed[] = [
	{
		key: "deployment-freeze",
		subject: "production deployment during change freeze",
		baseline: "freeze waiver must be present before deploy",
		ingredient: "missing-precondition-cid",
		left: {
			code: "a",
			mutation: "waiver receipt is absent",
			observed: "no waiver receipt is attached",
			primaryLabel: "escalation",
			missingPrecondition: "freeze waiver receipt",
			expectedAction: "interrupt deployment and escalate",
		},
		right: {
			code: "b",
			mutation: "waiver receipt is stale",
			observed: "waiver expired before the deployment window",
			primaryLabel: "policy-drift",
			missingPrecondition: "current freeze waiver receipt",
			expectedAction: "interrupt deployment until a current waiver exists",
		},
	},
	{
		key: "medical-review",
		subject: "clinical-review handoff",
		baseline: "licensed reviewer approval must be present",
		ingredient: "signer-trust-context",
		left: {
			code: "a",
			mutation: "approval is unsigned",
			observed: "review note has no licensed signer",
			primaryLabel: "escalation",
			missingPrecondition: "licensed reviewer signature",
			expectedAction: "halt the handoff and escalate",
		},
		right: {
			code: "b",
			mutation: "approval signer is outside trust context",
			observed: "review note is signed by an untrusted role",
			primaryLabel: "ambiguity",
			missingPrecondition: "trusted licensed reviewer signature",
			expectedAction: "halt until signer trust is verified",
		},
	},
	{
		key: "refund-approval",
		subject: "high-value refund approval",
		baseline: "manager approval must be attached for refunds over the limit",
		ingredient: "amount-threshold",
		left: {
			code: "a",
			mutation: "refund amount exceeds limit without approval",
			observed: "refund is above limit and has no approval",
			primaryLabel: "escalation",
			missingPrecondition: "manager approval",
			expectedAction: "interrupt refund issue",
		},
		right: {
			code: "b",
			mutation: "approval amount does not cover amended refund",
			observed: "refund is amended above approved amount",
			primaryLabel: "policy-drift",
			missingPrecondition: "approval for amended amount",
			expectedAction: "interrupt refund until approval matches",
		},
	},
	{
		key: "legal-hold",
		subject: "record purge under legal hold",
		baseline: "legal hold clearance must be present",
		ingredient: "policy-cid",
		left: {
			code: "a",
			mutation: "hold clearance is missing",
			observed: "no clearance receipt exists",
			primaryLabel: "escalation",
			missingPrecondition: "legal hold clearance",
			expectedAction: "block the purge and escalate",
		},
		right: {
			code: "b",
			mutation: "hold policy changes to require counsel approval",
			observed: "clearance lacks counsel approval",
			primaryLabel: "policy-drift",
			missingPrecondition: "counsel-approved clearance",
			expectedAction: "block the purge under the updated policy",
		},
	},
	{
		key: "safety-confirmation",
		subject: "operator safety confirmation",
		baseline: "two-person confirmation must be present",
		ingredient: "presence-bit",
		left: {
			code: "a",
			mutation: "second confirmation is absent",
			observed: "only one operator confirmation is present",
			primaryLabel: "escalation",
			missingPrecondition: "second operator confirmation",
			expectedAction: "interrupt the operation",
		},
		right: {
			code: "b",
			mutation: "second confirmation conflicts with first",
			observed: "operators disagree on readiness",
			primaryLabel: "ambiguity",
			missingPrecondition: "consistent two-person confirmation",
			expectedAction: "interrupt until confirmations agree",
		},
	},
	{
		key: "account-recovery",
		subject: "account recovery reset",
		baseline: "verified identity challenge must be complete",
		ingredient: "identity-proof",
		left: {
			code: "a",
			mutation: "identity challenge failed",
			observed: "challenge status is failed",
			primaryLabel: "escalation",
			missingPrecondition: "successful identity challenge",
			expectedAction: "block account recovery",
		},
		right: {
			code: "b",
			mutation: "identity challenge is incomplete",
			observed: "challenge status is pending",
			primaryLabel: "ambiguity",
			missingPrecondition: "completed identity challenge",
			expectedAction: "pause account recovery",
		},
	},
	{
		key: "data-deletion",
		subject: "data deletion request",
		baseline: "retention exception check must be complete",
		ingredient: "retention-check",
		left: {
			code: "a",
			mutation: "exception check has not run",
			observed: "retention exception check is missing",
			primaryLabel: "escalation",
			missingPrecondition: "retention exception check",
			expectedAction: "interrupt deletion",
		},
		right: {
			code: "b",
			mutation: "exception check reports a conflict",
			observed: "retention exception check returns conflict",
			primaryLabel: "policy-drift",
			missingPrecondition: "clear retention exception check",
			expectedAction: "interrupt deletion and escalate conflict",
		},
	},
	{
		key: "procurement-approval",
		subject: "procurement purchase order",
		baseline: "budget owner approval must be present",
		ingredient: "budget-owner",
		left: {
			code: "a",
			mutation: "budget owner approval is missing",
			observed: "purchase order has no budget owner approval",
			primaryLabel: "escalation",
			missingPrecondition: "budget owner approval",
			expectedAction: "block purchase order issue",
		},
		right: {
			code: "b",
			mutation: "budget owner approval is for the wrong cost center",
			observed: "approval cost center differs from purchase order",
			primaryLabel: "ambiguity",
			missingPrecondition: "matching budget owner approval",
			expectedAction: "interrupt purchase order issue",
		},
	},
	{
		key: "oncall-override",
		subject: "on-call override action",
		baseline: "incident commander acknowledgement must be present",
		ingredient: "commander-ack",
		left: {
			code: "a",
			mutation: "acknowledgement is absent",
			observed: "no incident commander acknowledgement exists",
			primaryLabel: "escalation",
			missingPrecondition: "incident commander acknowledgement",
			expectedAction: "block the override action",
		},
		right: {
			code: "b",
			mutation: "acknowledgement applies to another incident",
			observed: "acknowledgement incident id does not match",
			primaryLabel: "ambiguity",
			missingPrecondition: "matching incident commander acknowledgement",
			expectedAction: "interrupt the override action",
		},
	},
	{
		key: "rollback-decision",
		subject: "release rollback decision",
		baseline: "rollback impact check must be complete",
		ingredient: "impact-check",
		left: {
			code: "a",
			mutation: "impact check is missing",
			observed: "rollback impact check has no result",
			primaryLabel: "escalation",
			missingPrecondition: "rollback impact check",
			expectedAction: "interrupt rollback automation",
		},
		right: {
			code: "b",
			mutation: "impact check shows unresolved dependency",
			observed: "rollback impact check reports dependency risk",
			primaryLabel: "policy-drift",
			missingPrecondition: "clear rollback impact check",
			expectedAction: "escalate rollback dependency risk",
		},
	},
];

const PROVENANCE_PAIRS: readonly ScenarioPairSeed[] = [
	{
		key: "documentation-citation",
		subject: "product documentation citation",
		baseline: "answer cites the current public documentation page",
		ingredient: "source-cid",
		left: {
			code: "a",
			mutation: "citation points to an older documentation revision",
			observed: "cited revision is older than the answer",
			primaryLabel: "silent-drift",
			expectedAction: "reject replay until citation revision matches",
		},
		right: {
			code: "b",
			mutation: "citation points to the right page but wrong section",
			observed: "cited anchor does not contain the asserted field",
			primaryLabel: "ambiguity",
			expectedAction: "reject replay until section provenance matches",
		},
	},
	{
		key: "policy-update",
		subject: "public policy update",
		baseline: "policy answer cites version 2026-05",
		ingredient: "policy-receipt",
		left: {
			code: "a",
			mutation: "policy answer cites version 2026-04",
			observed: "cited policy version predates the answer",
			primaryLabel: "policy-drift",
			expectedAction: "mark receipt replay unsound",
		},
		right: {
			code: "b",
			mutation: "policy answer omits the version field",
			observed: "receipt has no policy version",
			primaryLabel: "ambiguity",
			expectedAction: "require a versioned policy receipt",
		},
	},
	{
		key: "release-notes",
		subject: "release-note comparison",
		baseline: "answer cites release notes with checksum R1",
		ingredient: "replay-recipe-cid",
		left: {
			code: "a",
			mutation: "release-note checksum changes after answer",
			observed: "receipt checksum differs from cited checksum",
			primaryLabel: "silent-drift",
			expectedAction: "replay from the captured checksum only",
		},
		right: {
			code: "b",
			mutation: "release-note recipe omits normalized headings",
			observed: "replay recipe cannot locate the cited heading",
			primaryLabel: "ambiguity",
			expectedAction: "reject replay until recipe is complete",
		},
	},
	{
		key: "public-filing",
		subject: "public filing reference",
		baseline: "answer cites the signed public filing",
		ingredient: "signer-trust-context",
		left: {
			code: "a",
			mutation: "filing receipt is unsigned",
			observed: "receipt lacks trusted filing signature",
			primaryLabel: "escalation",
			expectedAction: "reject provenance and request trusted signature",
		},
		right: {
			code: "b",
			mutation: "filing receipt is signed by an untrusted role",
			observed: "receipt signer is outside trust context",
			primaryLabel: "ambiguity",
			expectedAction: "reject replay under signer mismatch",
		},
	},
	{
		key: "standards-reference",
		subject: "standards clause reference",
		baseline: "answer cites public standard clause 4.2",
		ingredient: "clause-anchor",
		left: {
			code: "a",
			mutation: "citation resolves to clause 4.1",
			observed: "clause anchor differs from asserted clause",
			primaryLabel: "ambiguity",
			expectedAction: "require exact clause provenance",
		},
		right: {
			code: "b",
			mutation: "citation resolves to draft text",
			observed: "cited standard is draft status",
			primaryLabel: "policy-drift",
			expectedAction: "reject replay against final-standard requirement",
		},
	},
	{
		key: "package-checksum",
		subject: "package checksum attestation",
		baseline: "answer cites package checksum sha256:alpha",
		ingredient: "artifact-checksum",
		left: {
			code: "a",
			mutation: "package checksum is sha256:beta",
			observed: "artifact checksum differs from receipt",
			primaryLabel: "silent-drift",
			expectedAction: "reject cached artifact decision",
		},
		right: {
			code: "b",
			mutation: "package checksum is absent",
			observed: "artifact receipt has no checksum",
			primaryLabel: "escalation",
			expectedAction: "escalate missing checksum provenance",
		},
	},
	{
		key: "support-transcript",
		subject: "support transcript citation",
		baseline: "answer cites redacted public transcript receipt",
		ingredient: "redaction-recipe",
		left: {
			code: "a",
			mutation: "transcript receipt omits the cited message",
			observed: "cited message id is absent",
			primaryLabel: "ambiguity",
			expectedAction: "reject replay until message id is present",
		},
		right: {
			code: "b",
			mutation: "redaction recipe changes message boundaries",
			observed: "cited message text cannot be replayed",
			primaryLabel: "silent-drift",
			expectedAction: "rerun provenance binding",
		},
	},
	{
		key: "changelog-comparison",
		subject: "public changelog comparison",
		baseline: "answer compares changelog entries A and B",
		ingredient: "comparison-inputs",
		left: {
			code: "a",
			mutation: "entry B is replaced by entry C",
			observed: "comparison receipt references A and C",
			primaryLabel: "silent-drift",
			expectedAction: "reject replay because comparison inputs changed",
		},
		right: {
			code: "b",
			mutation: "entry B has no timestamp",
			observed: "comparison order cannot be reproduced",
			primaryLabel: "ambiguity",
			expectedAction: "require timestamped comparison provenance",
		},
	},
	{
		key: "signed-statement",
		subject: "signed public statement",
		baseline: "answer cites statement signed by public-relations owner",
		ingredient: "attestation-cid",
		left: {
			code: "a",
			mutation: "statement signature is missing",
			observed: "statement receipt is unsigned",
			primaryLabel: "escalation",
			expectedAction: "reject replay until attestation exists",
		},
		right: {
			code: "b",
			mutation: "statement signature timestamp is after the answer",
			observed: "signature timestamp postdates answer timestamp",
			primaryLabel: "ambiguity",
			expectedAction: "reject replay under temporal provenance mismatch",
		},
	},
	{
		key: "research-abstract",
		subject: "public research abstract",
		baseline: "answer cites abstract version 1",
		ingredient: "abstract-version",
		left: {
			code: "a",
			mutation: "abstract version 2 revises the conclusion",
			observed: "cited conclusion differs from current abstract",
			primaryLabel: "silent-drift",
			expectedAction: "rerun answer against versioned abstract",
		},
		right: {
			code: "b",
			mutation: "abstract source has no stable version",
			observed: "receipt omits version and retrieval time",
			primaryLabel: "ambiguity",
			expectedAction: "reject replay until version provenance is bound",
		},
	},
];

const COST_ATTRIBUTION_PAIRS: readonly ScenarioPairSeed[] = [
	{
		key: "token-estimate",
		subject: "local token estimate before model call",
		baseline: "estimated cost remains below 0.020 USD",
		ingredient: "local-token-estimate",
		left: {
			code: "a",
			mutation: "prompt expansion raises the estimate",
			observed: "estimated cost is 0.028 USD",
			primaryLabel: "policy-drift",
			reconciledCostUsd: 0.028,
			expectedAction: "stop before the cost cap is exceeded",
		},
		right: {
			code: "b",
			mutation: "tool schema expansion raises the estimate",
			observed: "estimated cost is 0.031 USD",
			primaryLabel: "policy-drift",
			reconciledCostUsd: 0.031,
			expectedAction: "attribute the over-cap estimate to schema expansion",
		},
	},
	{
		key: "hosted-embedding",
		subject: "hosted embedding attribution",
		baseline: "embedding call is attributed to fixture provider",
		ingredient: "embedding-provider",
		left: {
			code: "a",
			mutation: "embedding call is missing provider attribution",
			observed: "embedding usage has unknown provider",
			primaryLabel: "ambiguity",
			reconciledCostUsd: 0.006,
			expectedAction: "mark cost evidence incomplete",
		},
		right: {
			code: "b",
			mutation: "embedding call is attributed to local model",
			observed: "embedding usage says local model despite fixture provider",
			primaryLabel: "policy-drift",
			reconciledCostUsd: 0.006,
			expectedAction: "reject local-model attribution for DIFFCACHE+ fixture",
		},
	},
	{
		key: "cache-write",
		subject: "cache write cost attribution",
		baseline: "cache write is charged once",
		ingredient: "cache-write-tokens",
		left: {
			code: "a",
			mutation: "cache write tokens are omitted",
			observed: "cache write has no token count",
			primaryLabel: "ambiguity",
			reconciledCostUsd: 0.012,
			expectedAction: "require write-token attribution",
		},
		right: {
			code: "b",
			mutation: "cache write tokens are double counted",
			observed: "cache write is charged twice",
			primaryLabel: "policy-drift",
			reconciledCostUsd: 0.024,
			expectedAction: "dedupe the write cost before reporting",
		},
	},
	{
		key: "cache-read",
		subject: "cache read cost attribution",
		baseline: "cache read avoids model completion cost",
		ingredient: "cache-read-tokens",
		left: {
			code: "a",
			mutation: "cache read is billed as completion",
			observed: "reuse decision carries completion tokens",
			primaryLabel: "policy-drift",
			reconciledCostUsd: 0.017,
			expectedAction: "reject reuse cost attribution",
		},
		right: {
			code: "b",
			mutation: "cache read has unknown confidence",
			observed: "reuse cost confidence is unknown",
			primaryLabel: "ambiguity",
			reconciledCostUsd: 0.003,
			expectedAction: "require confidence before report eligibility",
		},
	},
	{
		key: "provider-reconciliation",
		subject: "provider reconciliation record",
		baseline: "provider record reconciles to 0.010 USD",
		ingredient: "provider-generation-id",
		left: {
			code: "a",
			mutation: "provider generation id is absent",
			observed: "cost record has no generation id",
			primaryLabel: "ambiguity",
			reconciledCostUsd: 0.01,
			expectedAction: "mark reconciliation incomplete",
		},
		right: {
			code: "b",
			mutation: "provider total differs from local ledger",
			observed: "provider record reconciles to 0.019 USD",
			primaryLabel: "silent-drift",
			reconciledCostUsd: 0.019,
			expectedAction: "prefer provider-reconciled cost with audit note",
		},
	},
	{
		key: "retry-budget",
		subject: "retry budget attribution",
		baseline: "retry budget permits one retry",
		ingredient: "retry-budget",
		left: {
			code: "a",
			mutation: "second retry is attempted",
			observed: "two retries are charged",
			primaryLabel: "policy-drift",
			reconciledCostUsd: 0.034,
			expectedAction: "stop after the preregistered retry budget",
		},
		right: {
			code: "b",
			mutation: "retry cost is attributed to the original attempt",
			observed: "retry attempt id is missing",
			primaryLabel: "ambiguity",
			reconciledCostUsd: 0.018,
			expectedAction: "split retry cost by attempt id",
		},
	},
	{
		key: "tool-call-ceiling",
		subject: "tool-call cost ceiling",
		baseline: "tool call ceiling is three calls",
		ingredient: "tool-call-count",
		left: {
			code: "a",
			mutation: "fourth tool call is requested",
			observed: "tool call count is four",
			primaryLabel: "policy-drift",
			reconciledCostUsd: 0.021,
			expectedAction: "interrupt before the fourth tool call",
		},
		right: {
			code: "b",
			mutation: "tool call count excludes hosted embedding call",
			observed: "ledger reports three calls but event stream has four",
			primaryLabel: "silent-drift",
			reconciledCostUsd: 0.023,
			expectedAction: "attribute hosted embedding as a costed call",
		},
	},
	{
		key: "fixture-embedding",
		subject: "fixture embedding reuse",
		baseline: "fixture embedding has zero local model cost",
		ingredient: "fixture-embedding",
		left: {
			code: "a",
			mutation: "fixture embedding is charged as local inference",
			observed: "ledger reports local model cost for fixture embedding",
			primaryLabel: "policy-drift",
			reconciledCostUsd: 0.004,
			expectedAction: "reject local model charge for fixture embedding",
		},
		right: {
			code: "b",
			mutation: "fixture embedding has no source marker",
			observed: "embedding record omits hosted/injected/fixture source",
			primaryLabel: "ambiguity",
			reconciledCostUsd: 0.004,
			expectedAction: "require embedding source marker",
		},
	},
	{
		key: "cost-cap",
		subject: "scenario cost cap",
		baseline: "scenario cap is 0.050 USD",
		ingredient: "cost-cap",
		left: {
			code: "a",
			mutation: "forecast p95 exceeds the cap",
			observed: "forecast p95 is 0.061 USD",
			primaryLabel: "policy-drift",
			reconciledCostUsd: 0.061,
			expectedAction: "halt expensive work before exposure exceeds cap",
		},
		right: {
			code: "b",
			mutation: "provider reconciliation exceeds the cap after retry",
			observed: "reconciled cost is 0.057 USD",
			primaryLabel: "silent-drift",
			reconciledCostUsd: 0.057,
			expectedAction: "flag bounded-exposure breach",
		},
	},
	{
		key: "audit-export",
		subject: "cost audit export",
		baseline: "audit export includes every costed event",
		ingredient: "audit-export",
		left: {
			code: "a",
			mutation: "audit export omits the cache write",
			observed: "cache write event is missing from export",
			primaryLabel: "ambiguity",
			reconciledCostUsd: 0.016,
			expectedAction: "mark audit export incomplete",
		},
		right: {
			code: "b",
			mutation: "audit export changes event ordering",
			observed: "provider reconciliation appears before model call",
			primaryLabel: "silent-drift",
			reconciledCostUsd: 0.016,
			expectedAction: "reject non-replayable cost audit ordering",
		},
	},
];

const FAMILY_SPECS: readonly FamilySpec[] = [
	{
		id: "family-2-quiet-drift",
		familyNumber: 2,
		slug: "quiet-drift",
		title: "Quiet Drift",
		claims: ["C2", "C5"],
		source: SOURCE_BY_FAMILY["family-2-quiet-drift"],
		invariant: "scheduled rechecks must detect forecast breaches without independent ingress changes",
		predicateId: "C2.forecast_gated_silent_drift_recheck",
		recheckTolerance: 60_000,
		pairs: QUIET_DRIFT_PAIRS,
	},
	{
		id: "family-5-fail-safe-interrupt",
		familyNumber: 5,
		slug: "fail-safe-interrupt",
		title: "Fail-Safe Interrupt",
		claims: ["C3"],
		source: SOURCE_BY_FAMILY["family-5-fail-safe-interrupt"],
		invariant: "missing or contradicted preconditions must produce escalation with no external action",
		predicateId: "C3.fail_safe_interrupt",
		recheckTolerance: 0,
		pairs: FAIL_SAFE_INTERRUPT_PAIRS,
	},
	{
		id: "family-7-provenance",
		familyNumber: 7,
		slug: "provenance",
		title: "Provenance",
		claims: ["C4", "C5"],
		source: SOURCE_BY_FAMILY["family-7-provenance"],
		invariant: "receipt replay must preserve source, recipe, and signer trust context",
		predicateId: "C4.replayable_tamper_evident_receipts",
		recheckTolerance: 0,
		pairs: PROVENANCE_PAIRS,
	},
	{
		id: "family-8-cost-attribution",
		familyNumber: 8,
		slug: "cost-attribution",
		title: "Cost Attribution",
		claims: ["C6"],
		source: SOURCE_BY_FAMILY["family-8-cost-attribution"],
		invariant: "bounded exposure decisions require attributed and reconciled cost evidence",
		predicateId: "C6.bounded_exposure_forecast_guarantee",
		recheckTolerance: 0,
		pairs: COST_ATTRIBUTION_PAIRS,
	},
];

export const PHASE_1B_REACTOR_SCENARIO_FAMILIES: readonly Phase1bScenarioFamily[] = Object.freeze(
	FAMILY_SPECS.map((family) => ({
		id: family.id,
		familyNumber: family.familyNumber,
		slug: family.slug,
		title: family.title,
		claims: family.claims,
		source: family.source,
	})),
);

export const PHASE_1B_REACTOR_SCENARIO_CORPUS: readonly ReactorTimelineCase[] = Object.freeze(buildCorpus());

export function getPhase1bScenarioMetadata(timelineCase: ReactorTimelineCase): Phase1bScenarioMetadata {
	const metadata = timelineCase.metadata;
	if (metadata?.corpus !== PHASE_1B_REACTOR_SCENARIO_CORPUS_ID) {
		throw new TypeError(`timeline case is not in ${PHASE_1B_REACTOR_SCENARIO_CORPUS_ID}: ${timelineCase.id}`);
	}

	return metadata as unknown as Phase1bScenarioMetadata;
}

export function computePhase1bOracleCid(timelineCase: ReactorTimelineCase): string {
	const metadata = getPhase1bScenarioMetadata(timelineCase);
	return digestCanonical({
		forecastModelId: timelineCase.oracle.forecastModelId,
		kind: timelineCase.oracle.kind,
		oracleData: metadata.oracleData,
		policyCid: timelineCase.oracle.policyCid,
		preconditionSet: timelineCase.oracle.preconditionSet,
		recheckSchedule: timelineCase.oracle.recheckSchedule,
		recheckTolerance: timelineCase.oracle.recheckTolerance,
	});
}

export function computePhase1bPreregistrationHash(timelineCase: ReactorTimelineCase): string {
	const metadata = getPhase1bScenarioMetadata(timelineCase);
	return digestCanonical({
		claims: timelineCase.claims ?? [],
		contract: timelineCase.contract,
		corpus: metadata.corpus,
		events: timelineCase.events,
		familyId: metadata.familyId,
		goldTrace: metadata.goldTrace,
		id: timelineCase.id,
		kind: timelineCase.kind,
		limits: timelineCase.limits ?? {},
		metamorphicIngredient: metadata.metamorphicIngredient,
		metamorphicPairId: metadata.metamorphicPairId,
		metamorphicRole: metadata.metamorphicRole,
		metamorphicTwinId: metadata.metamorphicTwinId,
		oracle: timelineCase.oracle,
		oracleData: metadata.oracleData,
		responsibilityFixturePath: metadata.responsibilityFixturePath,
		title: timelineCase.title,
		version: timelineCase.version,
	});
}

function buildCorpus(): ReactorTimelineCase[] {
	const cases: ReactorTimelineCase[] = [];
	for (const [familyIndex, family] of FAMILY_SPECS.entries()) {
		for (const [pairIndex, pair] of family.pairs.entries()) {
			const variants = [pair.left, pair.right] as const;
			for (const [variantIndex, variant] of variants.entries()) {
				const twin = variantIndex === 0 ? pair.right : pair.left;
				const scenario = buildScenario(family, familyIndex, pair, pairIndex, variant, variantIndex, twin);
				cases.push(scenario);
			}
		}
	}

	return cases;
}

function buildScenario(
	family: FamilySpec,
	familyIndex: number,
	pair: ScenarioPairSeed,
	pairIndex: number,
	variant: ScenarioVariantSeed,
	variantIndex: number,
	twin: ScenarioVariantSeed,
): ReactorTimelineCase {
	const pairNumber = String(pairIndex + 1).padStart(2, "0");
	const caseId = `${family.slug}-${pairNumber}-${variant.code}`;
	const twinId = `${family.slug}-${pairNumber}-${twin.code}`;
	const pairId = `${family.slug}-${pairNumber}-${pair.key}`;
	const role: Phase1bScenarioRole = variant.code === "a" ? "control" : "twin";
	const drafts = eventDrafts(family, pair, variant);
	const events = drafts.map((draft, eventIndex) =>
		buildEvent(family, familyIndex, pairIndex, variantIndex, caseId, draft, eventIndex),
	);
	const goldTrace = drafts.map((draft, eventIndex): Phase1bGoldTraceEntry => ({
		eventId: draft.id,
		expected: draft.expected,
		label: draft.label,
		ordinal: eventIndex + 1,
		rationale: draft.rationale,
	}));
	const recheckSchedule = scheduledTimes(events);
	const preconditionSet = [
		digestCanonical({
			familyId: family.id,
			invariant: family.invariant,
			sourceSha256: family.source.sha256,
		}),
		digestCanonical({
			baseline: pair.baseline,
			caseId,
			ingredient: pair.ingredient,
			missingPrecondition: variant.missingPrecondition ?? pair.baseline,
			mutation: variant.mutation,
			observed: variant.observed,
		}),
	];
	const policyCid = digestCanonical({
		claims: family.claims,
		familyId: family.id,
		invariant: family.invariant,
		predicateId: family.predicateId,
		sourceSha256: family.source.sha256,
	});
	const oracleData: JsonObject = {
		baseline: pair.baseline,
		expectedAction: variant.expectedAction,
		familyId: family.id,
		invariant: family.invariant,
		metamorphicIngredient: pair.ingredient,
		mutation: variant.mutation,
		observed: variant.observed,
		predicateId: family.predicateId,
		primaryLabel: variant.primaryLabel,
		subject: pair.subject,
		twinMutation: twin.mutation,
	};
	const oracle = {
		kind: REACTOR_ORACLE_SPEC_KIND,
		cid: digestCanonical({
			forecastModelId: `phase-1b-${family.slug}-oracle-v1`,
			kind: REACTOR_ORACLE_SPEC_KIND,
			oracleData,
			policyCid,
			preconditionSet,
			recheckSchedule,
			recheckTolerance: family.recheckTolerance,
		}),
		policyCid,
		forecastModelId: `phase-1b-${family.slug}-oracle-v1`,
		recheckSchedule,
		recheckTolerance: family.recheckTolerance,
		preconditionSet,
	} satisfies ReactorTimelineOracleSpec;
	const baseMetadata = {
		corpus: PHASE_1B_REACTOR_SCENARIO_CORPUS_ID,
		familyId: family.id,
		familyNumber: family.familyNumber,
		familyTitle: family.title,
		goldTrace,
		metamorphicIngredient: pair.ingredient,
		metamorphicPairId: pairId,
		metamorphicRole: role,
		metamorphicTwinId: twinId,
		oracleData,
		preregistration: {
			algorithm: "sha256-canonical-json-v1",
			hash: "0".repeat(64),
		},
		reportUse: "report-eligible",
		responsibilityFixturePath: family.source.path,
		scenarioOrdinal: pairIndex * 2 + variantIndex + 1,
	} satisfies Phase1bScenarioMetadata;
	const timelineCase: ReactorTimelineCase = {
		kind: REACTOR_TIMELINE_CASE_KIND,
		version: 1,
		id: caseId,
		title: `Family ${family.familyNumber} ${family.title} ${pairNumber}${variant.code.toUpperCase()}: ${pair.subject}`,
		contract: {
			source: {
				path: family.source.path,
				responsibilityId: `${family.slug}-${pairNumber}`,
				revision: "phase-1b-public-v1",
				sha256: family.source.sha256,
				signerTrustContext: `public-fixture:${family.id}`,
			},
		},
		oracle,
		events,
		claims: family.claims,
		limits: limitsFor(family, variant),
		metadata: baseMetadata,
	};
	const preregistration = {
		algorithm: "sha256-canonical-json-v1",
		hash: computePhase1bPreregistrationHash(timelineCase),
	} satisfies Phase1bPreregistration;

	return {
		...timelineCase,
		metadata: {
			...baseMetadata,
			preregistration,
		},
	};
}

function buildEvent(
	family: FamilySpec,
	familyIndex: number,
	pairIndex: number,
	variantIndex: number,
	caseId: string,
	draft: EventDraft,
	eventIndex: number,
): ReactorTimelineEvent {
	const at = eventTime(familyIndex, pairIndex, variantIndex, eventIndex);
	return {
		id: draft.id,
		at,
		label: draft.label,
		trigger: draft.trigger,
		type: draft.type,
		payload: draft.payload,
		payloadCid: digestCanonical({
			at,
			caseId,
			eventId: draft.id,
			payload: draft.payload,
			type: draft.type,
		}),
		metadata: {
			corpus: PHASE_1B_REACTOR_SCENARIO_CORPUS_ID,
			familyId: family.id,
			fixtureEmbeddingProvider: "fixture",
			noLocalModel: true,
			ordinal: eventIndex + 1,
			scenarioId: caseId,
			embedding: fixtureEmbedding(familyIndex, pairIndex, variantIndex, eventIndex),
		},
	};
}

function eventDrafts(family: FamilySpec, pair: ScenarioPairSeed, variant: ScenarioVariantSeed): readonly EventDraft[] {
	switch (family.id) {
		case "family-2-quiet-drift":
			return quietDriftDrafts(pair, variant);
		case "family-5-fail-safe-interrupt":
			return failSafeInterruptDrafts(pair, variant);
		case "family-7-provenance":
			return provenanceDrafts(pair, variant);
		case "family-8-cost-attribution":
			return costAttributionDrafts(pair, variant);
	}
}

function quietDriftDrafts(pair: ScenarioPairSeed, variant: ScenarioVariantSeed): readonly EventDraft[] {
	return [
		{
			id: "baseline-decision",
			type: "responsibility.baseline",
			label: "relevant-change",
			trigger: "input",
			expected: "record baseline decision",
			rationale: "The original accepted state is required before any reuse can be judged.",
			payload: {
				acceptedState: pair.baseline,
				subject: pair.subject,
			},
		},
		{
			id: "forecast-preregistered",
			type: "forecast.preregistered",
			label: "noop",
			trigger: "synthetic",
			expected: "freeze scheduled recheck",
			rationale: "The forecast and schedule are preregistered before the drift event.",
			payload: {
				forecast: pair.baseline,
				recheckEventId: "scheduled-recheck",
				reuseAllowedBeforeBreach: true,
			},
		},
		{
			id: "scheduled-recheck",
			type: "forecast.recheck",
			label: variant.primaryLabel,
			trigger: "scheduled",
			expected: "detect drift",
			rationale: "The observed public state differs from the forecast without independent ingress.",
			payload: {
				independentIngressChanged: false,
				mutation: variant.mutation,
				observed: variant.observed,
				predicted: pair.baseline,
			},
		},
		{
			id: "decision-revised",
			type: "decision.updated",
			label: "relevant-change",
			trigger: "synthetic",
			expected: variant.expectedAction,
			rationale: "The stale decision must not be reused after the forecast breach.",
			payload: {
				cacheReuseAllowed: false,
				expectedAction: variant.expectedAction,
				reason: variant.observed,
			},
		},
	];
}

function failSafeInterruptDrafts(pair: ScenarioPairSeed, variant: ScenarioVariantSeed): readonly EventDraft[] {
	const missingPrecondition = variant.missingPrecondition ?? pair.baseline;
	return [
		{
			id: "candidate-action",
			type: "plan.proposed",
			label: "relevant-change",
			trigger: "input",
			expected: "record candidate action",
			rationale: "The unsafe action candidate is captured before precondition evaluation.",
			payload: {
				candidateAction: pair.subject,
				requiredPrecondition: pair.baseline,
			},
		},
		{
			id: "precondition-check",
			type: "precondition.checked",
			label: variant.primaryLabel,
			trigger: "synthetic",
			expected: "detect missing precondition",
			rationale: "The required precondition is absent, stale, ambiguous, or contradicted.",
			payload: {
				missingPrecondition,
				mutation: variant.mutation,
				observed: variant.observed,
				presenceBit: false,
			},
		},
		{
			id: "interrupt-fired",
			type: "safety.interrupt",
			label: "escalation",
			trigger: "synthetic",
			expected: variant.expectedAction,
			rationale: "Fail-safe behavior requires escalation instead of continuing.",
			payload: {
				actionsAllowed: 0,
				expectedAction: variant.expectedAction,
				missingPrecondition,
			},
		},
		{
			id: "external-action-blocked",
			type: "external_action.blocked",
			label: "noop",
			trigger: "synthetic",
			expected: "prove no irreversible external action",
			rationale: "The interrupt must prevent the external side effect.",
			payload: {
				blocked: true,
				externalAction: pair.subject,
			},
		},
	];
}

function provenanceDrafts(pair: ScenarioPairSeed, variant: ScenarioVariantSeed): readonly EventDraft[] {
	return [
		{
			id: "source-ingested",
			type: "source.ingested",
			label: "relevant-change",
			trigger: "input",
			expected: "bind material source",
			rationale: "Replayable provenance starts with a material source receipt.",
			payload: {
				sourceExpectation: pair.baseline,
				subject: pair.subject,
			},
		},
		{
			id: "receipt-bound",
			type: "receipt.bound",
			label: "noop",
			trigger: "synthetic",
			expected: "freeze receipt recipe",
			rationale: "The replay recipe and signer context are frozen before challenge.",
			payload: {
				replayRecipe: pair.ingredient,
				signerTrustContext: "public-fixture-trust",
			},
		},
		{
			id: "provenance-challenge",
			type: "provenance.challenge",
			label: variant.primaryLabel,
			trigger: "input",
			expected: "detect provenance mismatch",
			rationale: "The provenance perturbation changes the replay evidence.",
			payload: {
				mutation: variant.mutation,
				observed: variant.observed,
				replayStillSound: false,
			},
		},
		{
			id: "replay-verdict",
			type: "receipt.replay_verdict",
			label: "relevant-change",
			trigger: "synthetic",
			expected: variant.expectedAction,
			rationale: "The replay verdict must reflect the tamper-evident receipt outcome.",
			payload: {
				expectedAction: variant.expectedAction,
				receiptReplaySound: false,
			},
		},
	];
}

function costAttributionDrafts(pair: ScenarioPairSeed, variant: ScenarioVariantSeed): readonly EventDraft[] {
	const reconciledCostUsd = variant.reconciledCostUsd ?? 0.01;
	return [
		{
			id: "budget-opened",
			type: "cost.budget_opened",
			label: "relevant-change",
			trigger: "input",
			expected: "open bounded exposure ledger",
			rationale: "The scenario cost cap must be known before expensive work.",
			payload: {
				baseline: pair.baseline,
				maxCostUsd: 0.05,
				subject: pair.subject,
			},
		},
		{
			id: "model-call-attributed",
			type: "cost.model_call_attributed",
			label: "relevant-change",
			trigger: "synthetic",
			expected: "attribute model or embedding call",
			rationale: "Every costed call is attached to a scenario event and confidence level.",
			payload: {
				confidence: "local-token-estimate",
				embeddingSource: "fixture",
				localModelUsed: false,
				mutation: variant.mutation,
			},
		},
		{
			id: "cache-accounted",
			type: "cost.cache_accounted",
			label: variant.primaryLabel === "silent-drift" ? "silent-drift" : "noop",
			trigger: "synthetic",
			expected: "account for cache read or write",
			rationale: "Cache costs must remain separate from model completion costs.",
			payload: {
				attributionRequired: true,
				observed: variant.observed,
			},
		},
		{
			id: "provider-reconciled",
			type: "cost.provider_reconciled",
			label: variant.primaryLabel,
			trigger: "scheduled",
			expected: variant.expectedAction,
			rationale: "Provider reconciliation determines report-eligible bounded exposure.",
			payload: {
				expectedAction: variant.expectedAction,
				maxCostUsd: 0.05,
				reconciledCostUsd,
			},
		},
	];
}

function limitsFor(family: FamilySpec, variant: ScenarioVariantSeed): ReactorTimelineLimits {
	if (family.id === "family-8-cost-attribution") {
		return {
			maxCostUsd: Math.max(0.05, (variant.reconciledCostUsd ?? 0.01) + 0.001),
			maxModelCalls: 3,
			maxWallTimeMs: 180_000,
		};
	}

	return {
		maxCostUsd: 0.05,
		maxModelCalls: 2,
		maxWallTimeMs: 180_000,
	};
}

function scheduledTimes(events: readonly ReactorTimelineEvent[]): string[] {
	const times = events.filter((event) => event.trigger === "scheduled" || event.trigger === "clock").map((event) => event.at);
	return times.length === 0 ? [events[events.length - 1]?.at ?? "2026-05-17T00:00:00.000Z"] : times;
}

function eventTime(familyIndex: number, pairIndex: number, variantIndex: number, eventIndex: number): string {
	const baseMs = Date.UTC(2026, 4, 17, 8, 0, 0, 0);
	const minutes = familyIndex * 20_000 + pairIndex * 180 + variantIndex * 30 + eventIndex * 15;
	return new Date(baseMs + minutes * 60_000).toISOString();
}

function fixtureEmbedding(
	familyIndex: number,
	pairIndex: number,
	variantIndex: number,
	eventIndex: number,
): number[] {
	const base = (familyIndex + 1) * 100 + (pairIndex + 1) * 7 + variantIndex * 3 + eventIndex;
	return [base / 1000, (base + 11) / 1000, (base + 23) / 1000];
}

function digestCanonical(value: unknown): string {
	return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
	}
	if (typeof value === "object") {
		const record = value as Record<string, unknown>;
		const entries = Object.keys(record)
			.filter((key) => record[key] !== undefined)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
		return `{${entries.join(",")}}`;
	}

	throw new TypeError("Phase-1b corpus values must be JSON-serializable");
}
