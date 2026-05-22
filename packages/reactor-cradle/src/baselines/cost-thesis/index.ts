import { createHash } from "node:crypto";

import type {
  ContentHashV0,
  ReceiptEventCauseV0,
  ReceiptRecheckKindV0,
  ReceiptRoleV0,
  ReceiptV0,
} from "@openprose/reactor/receipt";

import type {
  NoMemoBaselineSummaryV0,
  NoMemoBaselineTurnV0,
} from "../no-memo";
import type {
  NaiveLoopBaselineSummaryV0,
  NaiveLoopReviewTurnV0,
} from "../naive-loop";
import type { ScenarioRunReceiptV0, ScenarioWorldProfileV0 } from "../../scenario/types";

export const COST_THESIS_SUMMARY_SCHEMA_V0 =
  "openprose.reactor-cradle.baseline.cost-thesis.summary" as const;
export const COST_THESIS_SUMMARY_VERSION_V0 = 0 as const;
export const COST_THESIS_GENERATED_AT_V0 =
  "2026-05-20T00:00:00.000Z" as const;

export type CostThesisRowVariantV0 =
  | "reactor"
  | "reactor-no-memo"
  | "naive-loop";
export type CostThesisRowProvenanceV0 =
  | "runtime-produced"
  | "simulated"
  | "control";
export type CostThesisTurnSourceV0 =
  | "receipt.cost"
  | "no-memo-simulation"
  | "naive-loop-control";
export type CostThesisTurnOutcomeV0 =
  | "model-invocation"
  | "runtime-receipt"
  | "memo-hit"
  | "fresh-judge"
  | "control-review";

export interface CostThesisTokensV0 {
  readonly fresh: number;
  readonly reused: number;
  readonly total: number;
}

export interface CostThesisRatioV0 {
  readonly fresh: number;
  readonly reused: number;
  readonly label: string;
  readonly reused_is_zero: boolean;
}

export interface CostThesisScenarioRefV0 {
  readonly id: string;
  readonly profile: ScenarioWorldProfileV0;
  readonly initial_instant: string;
  readonly final_instant: string;
}

export interface CostThesisTurnDetailV0 {
  readonly index: number;
  readonly as_of: string;
  readonly source: CostThesisTurnSourceV0;
  readonly outcome: CostThesisTurnOutcomeV0;
  readonly tokens: CostThesisTokensV0;
  readonly model_invocation_count: number;
  readonly event_cause?: ReceiptEventCauseV0;
  readonly recheck_kind?: ReceiptRecheckKindV0;
  readonly receipt_hash?: ContentHashV0;
  readonly provider?: string;
  readonly model?: string;
  readonly role?: ReceiptRoleV0;
  readonly review_kind?: string;
  readonly source_ids?: readonly string[];
  readonly note: string;
}

export interface CostThesisReportRowV0 {
  readonly variant: CostThesisRowVariantV0;
  readonly label: string;
  readonly scenario: CostThesisScenarioRefV0;
  readonly provenance: CostThesisRowProvenanceV0;
  readonly receipt_count: number;
  readonly turn_count: number;
  readonly model_invocation_count: number;
  readonly tokens: CostThesisTokensV0;
  readonly ratio: CostThesisRatioV0;
  readonly notes: readonly string[];
  readonly turns: readonly CostThesisTurnDetailV0[];
  readonly source_summary_hash?: ContentHashV0;
}

export type CostThesisEventChangingStatusV0 =
  | {
      readonly status: "absent";
      readonly reason: string;
      readonly notes: readonly string[];
    }
  | {
      readonly status: "measured";
      readonly scenario_id: string;
      readonly profile: Exclude<ScenarioWorldProfileV0, "static">;
      readonly rows: readonly CostThesisReportRowV0[];
      readonly notes: readonly string[];
    };

export interface CostThesisStaticScenarioSummaryV0 {
  readonly scenario: CostThesisScenarioRefV0;
  readonly status: "measured";
  readonly rows: readonly CostThesisReportRowV0[];
  readonly notes: readonly string[];
}

export interface CostThesisSummaryV0 {
  readonly schema: typeof COST_THESIS_SUMMARY_SCHEMA_V0;
  readonly v: typeof COST_THESIS_SUMMARY_VERSION_V0;
  readonly generated_at: typeof COST_THESIS_GENERATED_AT_V0;
  readonly static_scenario: CostThesisStaticScenarioSummaryV0;
  readonly event_changing_scenario?: CostThesisEventChangingStatusV0;
  readonly notes: readonly string[];
  readonly content_hash: ContentHashV0;
}

export interface CreateStaticCostThesisSummaryInputV0 {
  readonly reactor_run: ScenarioRunReceiptV0;
  readonly no_memo: NoMemoBaselineSummaryV0;
  readonly naive_loop: NaiveLoopBaselineSummaryV0;
  readonly event_changing_scenario?: CostThesisEventChangingStatusV0;
}

type CostThesisSummaryPayloadV0 = Omit<CostThesisSummaryV0, "content_hash">;

export function createC5StaticCostThesisSummaryV0(
  input: CreateStaticCostThesisSummaryInputV0,
): CostThesisSummaryV0 {
  const reactorRow = measureReactorStaticCostRowV0(input.reactor_run);
  const noMemoRow = normalizeNoMemoCostRowV0(input.no_memo, reactorRow.scenario);
  const naiveLoopRow = normalizeNaiveLoopCostRowV0(
    input.naive_loop,
    reactorRow.scenario,
    reactorRow.turns,
  );

  const payload: CostThesisSummaryPayloadV0 = {
    schema: COST_THESIS_SUMMARY_SCHEMA_V0,
    v: COST_THESIS_SUMMARY_VERSION_V0,
    generated_at: COST_THESIS_GENERATED_AT_V0,
    static_scenario: {
      scenario: reactorRow.scenario,
      status: "measured",
      rows: Object.freeze([reactorRow, noMemoRow, naiveLoopRow]),
      notes: Object.freeze([
        "Static rows share the same incident-briefing-static-zero schedule.",
        "Only the Reactor row is runtime-produced; no-memo is a simulated replay and naive-loop is a non-Reactor control.",
      ]),
    },
    ...(input.event_changing_scenario === undefined
      ? {
          event_changing_scenario: missingEventChangingScenarioV0(),
        }
      : { event_changing_scenario: input.event_changing_scenario }),
    notes: Object.freeze([
      "C5a emits the reusable measurement summary; report Markdown may render this object but must not invent rows absent here.",
      "Fresh:reused ratios are exact token-count labels, not reduced fractions.",
    ]),
  };

  return Object.freeze({
    ...payload,
    content_hash: contentHash(payload),
  });
}

export function measureReactorStaticCostRowV0(
  run: ScenarioRunReceiptV0,
): CostThesisReportRowV0 {
  if (run.world_profile !== "static") {
    throw new Error(
      `Reactor static cost row requires world_profile=static; received ${run.world_profile}`,
    );
  }

  return measureReactorRuntimeCostRowV0(run);
}

export function measureReactorRuntimeCostRowV0(
  run: ScenarioRunReceiptV0,
): CostThesisReportRowV0 {
  const scenario = scenarioRefFromRun(run);
  const turns = run.receipt_log.entries.map((receipt, index) =>
    reactorTurnFromReceipt(receipt, index),
  );
  const tokens = sumTurnTokens(turns);
  const modelInvocationCount = sumModelInvocations(turns);

  return Object.freeze({
    variant: "reactor",
    label: "Reactor",
    scenario,
    provenance: "runtime-produced",
    receipt_count: run.receipt_log.entries.length,
    turn_count: turns.length,
    model_invocation_count: modelInvocationCount,
    tokens,
    ratio: tokenRatio(tokens),
    notes: Object.freeze([
      "Computed from runtime-produced Reactor receipts in scenario.receipt_log.entries.",
      "Memo-hit receipts are runtime-produced receipts but do not count as model invocations.",
      "The static-world row permits the plan-age audit-floor fresh check.",
    ]),
    turns: Object.freeze([...turns]),
  });
}

export function createC5EventChangingCostThesisScenarioV0(input: {
  readonly reactor_run: ScenarioRunReceiptV0;
}): Extract<CostThesisEventChangingStatusV0, { readonly status: "measured" }> {
  const profile = eventChangingProfile(input.reactor_run.world_profile);
  const reactorRow = measureReactorRuntimeCostRowV0(input.reactor_run);
  const noMemoRow = simulateNoMemoEventChangingRowV0(reactorRow);
  const naiveLoopRow = simulateNaiveLoopEventChangingRowV0(reactorRow);

  return Object.freeze({
    status: "measured",
    scenario_id: input.reactor_run.scenario_id,
    profile,
    rows: Object.freeze([reactorRow, noMemoRow, naiveLoopRow]),
    notes: Object.freeze([
      "Event-changing rows share the same runtime-produced receipt schedule.",
      "Only the Reactor row is runtime-produced; no-memo and naive-loop rows are deterministic controls derived from the same per-turn token charges.",
      "The event-changing control rows intentionally charge memo-hit reusable work as fresh work because those variants have no reusable receipt/memo proof.",
    ]),
  });
}

export function normalizeNoMemoCostRowV0(
  summary: NoMemoBaselineSummaryV0,
  expectedScenario?: CostThesisScenarioRefV0,
): CostThesisReportRowV0 {
  const scenario: CostThesisScenarioRefV0 = {
    id: summary.scenario.id,
    profile: summary.scenario.profile,
    initial_instant: summary.scenario.initial_instant,
    final_instant: summary.scenario.final_instant,
  };
  assertSameScenario(scenario, expectedScenario, "no-memo");

  const turns = summary.turns.map((turn) => noMemoTurnDetail(turn));
  const tokens = tokensFromFreshReused(summary.tokens.fresh, summary.tokens.reused);

  return Object.freeze({
    variant: "reactor-no-memo",
    label: "Reactor no memo",
    scenario,
    provenance: "simulated",
    receipt_count: summary.receipt_count,
    turn_count: summary.turn_count,
    model_invocation_count: summary.model_invocation_count,
    tokens,
    ratio: tokenRatio(tokens),
    notes: Object.freeze([...summary.notes]),
    turns: Object.freeze([...turns]),
    source_summary_hash: summary.content_hash,
  });
}

export function normalizeNaiveLoopCostRowV0(
  summary: NaiveLoopBaselineSummaryV0,
  expectedScenario?: CostThesisScenarioRefV0,
  runtimeTurns?: readonly CostThesisTurnDetailV0[],
): CostThesisReportRowV0 {
  const scenario: CostThesisScenarioRefV0 = {
    id: summary.scenario_id,
    profile: summary.world_profile,
    initial_instant: expectedScenario?.initial_instant ?? "",
    final_instant: expectedScenario?.final_instant ?? "",
  };
  assertSameScenario(scenario, expectedScenario, "naive-loop");

  const turns =
    runtimeTurns === undefined
      ? summary.review_turns.map((turn) => naiveLoopTurnDetail(turn, summary))
      : sameUnitNaiveLoopTurns(summary.review_turns, runtimeTurns);
  const tokens =
    runtimeTurns === undefined
      ? tokensFromFreshReused(summary.tokens.fresh, summary.tokens.reused)
      : sumTurnTokens(turns);
  const notes =
    runtimeTurns === undefined
      ? summary.notes
      : [
          "Static naive-loop control over the same receipt-bearing schedule.",
          "Every review turn rereads the current evidence and spends the runtime row's per-turn total as fresh work.",
          "The control has no receipts, memo keys, forecast policy, stable content identity, or reusable verdict architecture.",
        ];

  return Object.freeze({
    variant: "naive-loop",
    label: "Naive loop",
    scenario,
    provenance: "control",
    receipt_count: 0,
    turn_count: summary.turn_count,
    model_invocation_count: summary.model_invocation_count,
    tokens,
    ratio: tokenRatio(tokens),
    notes: Object.freeze([...notes]),
    turns: Object.freeze([...turns]),
  });
}

export function missingEventChangingScenarioV0(): CostThesisEventChangingStatusV0 {
  return Object.freeze({
    status: "absent",
    reason:
      "C5a did not receive runtime-produced event-changing scenario receipts; no event-changing rows are emitted.",
    notes: Object.freeze([
      "This is an honest absence marker for C5b/C5c coordination, not a simulated measurement.",
    ]),
  });
}

function reactorTurnFromReceipt(
  receipt: ReceiptV0,
  index: number,
): CostThesisTurnDetailV0 {
  const tokens = tokensFromFreshReused(
    receipt.cost.tokens.fresh,
    receipt.cost.tokens.reused,
  );
  const modelInvocationCount =
    receipt.cost.provider === "memo" || tokens.total === 0 ? 0 : 1;
  const outcome: CostThesisTurnOutcomeV0 =
    receipt.cost.provider === "memo"
      ? "memo-hit"
      : modelInvocationCount === 1
        ? "model-invocation"
        : "runtime-receipt";

  return Object.freeze({
    index,
    as_of: receipt.core.as_of,
    source: "receipt.cost",
    outcome,
    tokens,
    model_invocation_count: modelInvocationCount,
    event_cause: receipt.core.event_cause,
    ...(receipt.core.recheck_kind === undefined
      ? {}
      : { recheck_kind: receipt.core.recheck_kind }),
    receipt_hash: receipt.content_hash,
    provider: receipt.cost.provider,
    model: receipt.cost.model,
    role: receipt.core.role,
    note:
      outcome === "memo-hit"
        ? "Runtime memo-hit receipt reused a prior verdict and made no model call."
        : outcome === "runtime-receipt"
          ? "Runtime receipt carried no token-bearing model call."
        : reactorInvocationNote(receipt),
  });
}

function noMemoTurnDetail(turn: NoMemoBaselineTurnV0): CostThesisTurnDetailV0 {
  const tokens = tokensFromFreshReused(turn.tokens.fresh, turn.tokens.reused);

  return Object.freeze({
    index: turn.index,
    as_of: turn.as_of,
    source: "no-memo-simulation",
    outcome: "fresh-judge",
    tokens,
    model_invocation_count: turn.model_invocation_count,
    event_cause: turn.event_cause,
    ...(turn.recheck_kind === undefined ? {} : { recheck_kind: turn.recheck_kind }),
    note: turn.note,
  });
}

function naiveLoopTurnDetail(
  turn: NaiveLoopReviewTurnV0,
  summary: NaiveLoopBaselineSummaryV0,
): CostThesisTurnDetailV0 {
  const charged = summary.per_invocation_tokens.charged;

  return Object.freeze({
    index: turn.index,
    as_of: turn.as_of,
    source: "naive-loop-control",
    outcome: "control-review",
    tokens: tokensFromFreshReused(charged.fresh, charged.reused),
    model_invocation_count: 1,
    ...(turn.recheck_kind === undefined ? {} : { recheck_kind: turn.recheck_kind }),
    review_kind: turn.review_kind,
    source_ids: Object.freeze([...turn.source_ids]),
    note: `${turn.review_kind} over ${turn.source_ids.join(", ")} with no receipt or memo reuse.`,
  });
}

function sameUnitNaiveLoopTurns(
  reviewTurns: readonly NaiveLoopReviewTurnV0[],
  runtimeTurns: readonly CostThesisTurnDetailV0[],
): readonly CostThesisTurnDetailV0[] {
  if (reviewTurns.length !== runtimeTurns.length) {
    throw new Error(
      `naive-loop same-unit control requires ${reviewTurns.length} runtime turns; received ${runtimeTurns.length}`,
    );
  }

  return Object.freeze(
    reviewTurns.map((turn, index) => {
      const runtimeTurn = runtimeTurns[index];
      if (runtimeTurn === undefined) {
        throw new Error(`missing runtime turn ${index} for naive-loop same-unit control`);
      }

      const tokens = tokensFromFreshReused(runtimeTurn.tokens.total, 0);
      return Object.freeze({
        index: turn.index,
        as_of: turn.as_of,
        source: "naive-loop-control",
        outcome: "control-review",
        tokens,
        model_invocation_count: 1,
        ...(turn.recheck_kind === undefined ? {} : { recheck_kind: turn.recheck_kind }),
        review_kind: turn.review_kind,
        source_ids: Object.freeze([...turn.source_ids]),
        note: `${turn.review_kind} over ${turn.source_ids.join(", ")} charged from runtime turn ${index}'s token unit.`,
      });
    }),
  );
}

function simulateNoMemoEventChangingRowV0(
  reactorRow: CostThesisReportRowV0,
): CostThesisReportRowV0 {
  const turns = reactorRow.turns.map((turn) =>
    simulateNoMemoEventTurnV0(turn),
  );
  const tokens = sumTurnTokens(turns);

  return Object.freeze({
    variant: "reactor-no-memo",
    label: "Reactor no memo",
    scenario: reactorRow.scenario,
    provenance: "simulated",
    receipt_count: reactorRow.receipt_count,
    turn_count: turns.length,
    model_invocation_count: sumModelInvocations(turns),
    tokens,
    ratio: tokenRatio(tokens),
    notes: Object.freeze([
      "Event-changing no-memo control derived from the runtime-produced event-changing receipt schedule.",
      "Each token-bearing turn is charged as fresh work; memo-hit reusable tokens are not credited as reuse.",
      "This is a deterministic control row, not a runtime flag or alternate Reactor execution mode.",
    ]),
    turns: Object.freeze([...turns]),
  });
}

function simulateNaiveLoopEventChangingRowV0(
  reactorRow: CostThesisReportRowV0,
): CostThesisReportRowV0 {
  const turns = reactorRow.turns.map((turn) =>
    simulateNaiveLoopEventTurnV0(turn),
  );
  const tokens = sumTurnTokens(turns);

  return Object.freeze({
    variant: "naive-loop",
    label: "Naive loop",
    scenario: reactorRow.scenario,
    provenance: "control",
    receipt_count: 0,
    turn_count: turns.length,
    model_invocation_count: sumModelInvocations(turns),
    tokens,
    ratio: tokenRatio(tokens),
    notes: Object.freeze([
      "Event-changing naive-loop control over the same receipt-bearing schedule.",
      "Every review turn rereads the current evidence and spends the runtime row's per-turn total as fresh work.",
      "The control has no receipts, memo keys, forecast policy, stable content identity, or reusable verdict architecture.",
    ]),
    turns: Object.freeze([...turns]),
  });
}

function simulateNoMemoEventTurnV0(
  turn: CostThesisTurnDetailV0,
): CostThesisTurnDetailV0 {
  const tokens = tokensFromFreshReused(turn.tokens.total, 0);

  return Object.freeze({
    index: turn.index,
    as_of: turn.as_of,
    source: "no-memo-simulation",
    outcome: "fresh-judge",
    tokens,
    model_invocation_count: tokens.total === 0 ? 0 : 1,
    ...(turn.event_cause === undefined ? {} : { event_cause: turn.event_cause }),
    ...(turn.recheck_kind === undefined ? {} : { recheck_kind: turn.recheck_kind }),
    note:
      "No-memo event-changing control charges this turn's runtime token total as fresh judge work.",
  });
}

function simulateNaiveLoopEventTurnV0(
  turn: CostThesisTurnDetailV0,
): CostThesisTurnDetailV0 {
  const tokens = tokensFromFreshReused(turn.tokens.total, 0);

  return Object.freeze({
    index: turn.index,
    as_of: turn.as_of,
    source: "naive-loop-control",
    outcome: "control-review",
    tokens,
    model_invocation_count: tokens.total === 0 ? 0 : 1,
    ...(turn.recheck_kind === undefined ? {} : { recheck_kind: turn.recheck_kind }),
    review_kind:
      turn.event_cause === "forecast-recheck" ? "scheduled-review" : "real-input-review",
    note:
      "Naive-loop event-changing control reviews the same turn without receipt or memo reuse.",
  });
}

function reactorInvocationNote(receipt: ReceiptV0): string {
  if (
    receipt.core.event_cause === "forecast-recheck" &&
    receipt.core.recheck_kind === "plan-age"
  ) {
    return "Runtime judge invocation for the plan-age audit floor.";
  }

  return "Runtime judge invocation charged from adapter-owned model usage.";
}

function scenarioRefFromRun(run: ScenarioRunReceiptV0): CostThesisScenarioRefV0 {
  return Object.freeze({
    id: run.scenario_id,
    profile: run.world_profile,
    initial_instant: run.initial_instant,
    final_instant: run.final_instant,
  });
}

function eventChangingProfile(
  profile: ScenarioWorldProfileV0,
): Exclude<ScenarioWorldProfileV0, "static"> {
  if (profile === "static") {
    throw new Error("event-changing cost thesis scenario requires a non-static world profile");
  }

  return profile;
}

function assertSameScenario(
  observed: CostThesisScenarioRefV0,
  expected: CostThesisScenarioRefV0 | undefined,
  label: string,
): void {
  if (expected === undefined) {
    return;
  }

  if (observed.id !== expected.id || observed.profile !== expected.profile) {
    throw new Error(
      `${label} scenario mismatch: expected ${expected.id}/${expected.profile}, received ${observed.id}/${observed.profile}`,
    );
  }
}

function sumTurnTokens(
  turns: readonly Pick<CostThesisTurnDetailV0, "tokens">[],
): CostThesisTokensV0 {
  const fresh = turns.reduce((sum, turn) => sum + turn.tokens.fresh, 0);
  const reused = turns.reduce((sum, turn) => sum + turn.tokens.reused, 0);

  return tokensFromFreshReused(fresh, reused);
}

function sumModelInvocations(
  turns: readonly Pick<CostThesisTurnDetailV0, "model_invocation_count">[],
): number {
  return turns.reduce((sum, turn) => sum + turn.model_invocation_count, 0);
}

function tokensFromFreshReused(fresh: number, reused: number): CostThesisTokensV0 {
  return Object.freeze({
    fresh,
    reused,
    total: fresh + reused,
  });
}

function tokenRatio(tokens: CostThesisTokensV0): CostThesisRatioV0 {
  return Object.freeze({
    fresh: tokens.fresh,
    reused: tokens.reused,
    label: `${tokens.fresh}:${tokens.reused}`,
    reused_is_zero: tokens.reused === 0,
  });
}

function contentHash(payload: CostThesisSummaryPayloadV0): ContentHashV0 {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  return `sha256:${digest}` as ContentHashV0;
}
