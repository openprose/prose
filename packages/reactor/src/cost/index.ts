// cost/ — surprise-attribution + flat-spend-under-static.
//
// Two relationships are evaluated here:
//   - surprise-attribution-complete — every token-bearing receipt names exactly
//     one allowed surprise cause that matches its wake source (world-model.md §5
//     "one event type, three sources").
//   - flat-spend-under-static — in a static world, post-bootstrap *fresh* spend
//     stays flat, with the sole exception of self-driven recheck ticks (the
//     deliberately-declared forecast-cadence exception that re-examines silent
//     staleness, world-model.md §6 L285-290).

import type { Receipt, WakeSource } from "../shapes/index";

/**
 * The surprise causes a token-bearing receipt may name. These are exactly the
 * wake sources (world-model.md §5): an upstream receipt (`input`), the node's own
 * continuity clock (`self`), or a gateway-translated external trigger
 * (`external`). `surprise_cause` echoes the wake source that drove the spend
 * (SHAPES.md §4).
 */
export const ALLOWED_SURPRISE_CAUSES = Object.freeze([
  "input",
  "self",
  "external",
] as const satisfies readonly WakeSource[]);

export type CostRelationship =
  | "surprise-attribution-complete"
  | "flat-spend-under-static";

export type CostEvaluationIssueCode =
  | "receipt-not-object"
  | "cost-not-object"
  | "wake-not-object"
  | "wake-source-invalid"
  | "tokens-not-object"
  | "tokens-invalid"
  | "surprise-cause-missing"
  | "surprise-cause-invalid"
  | "surprise-cause-multiple"
  | "surprise-cause-mismatch"
  | "bootstrap-receipt-count-invalid"
  | "world-profile-not-static"
  | "token-bearing-evidence-missing"
  | "post-bootstrap-fresh-spend";

export interface CostEvaluationIssue {
  readonly path: string;
  readonly code: CostEvaluationIssueCode;
  readonly message: string;
  readonly observed: unknown;
}

export interface ReceiptCostObservation {
  readonly path: string;
  readonly token_bearing: boolean;
  readonly fresh: number;
  readonly reused: number;
  readonly surprise_cause: WakeSource;
  readonly wake_source: WakeSource;
}

export interface ReceiptSurpriseAttributionCheck {
  readonly ok: boolean;
  readonly issues: readonly CostEvaluationIssue[];
  readonly observation: ReceiptCostObservation | null;
}

export interface CostRelationshipEvaluation {
  readonly ok: boolean;
  readonly relationship: CostRelationship;
  readonly summary: string;
  readonly issues: readonly CostEvaluationIssue[];
  readonly checked: {
    readonly receipts: number;
    readonly token_bearing_receipts: number;
    readonly post_bootstrap_token_bearing_receipts: number;
    readonly self_recheck_floor_receipts: number;
  };
}

export interface FlatSpendUnderStaticInput {
  readonly receipts: readonly unknown[];
  readonly bootstrap_receipt_count?: number;
  readonly world_profile?: string;
}

const ALLOWED_SURPRISE_CAUSE_SET = new Set<WakeSource>(ALLOWED_SURPRISE_CAUSES);

export function isAllowedSurpriseCause(value: unknown): value is WakeSource {
  return (
    typeof value === "string" &&
    ALLOWED_SURPRISE_CAUSE_SET.has(value as WakeSource)
  );
}

export function isTokenBearingReceipt(receipt: Pick<Receipt, "cost">): boolean {
  return receipt.cost.tokens.fresh + receipt.cost.tokens.reused > 0;
}

export function validateReceiptSurpriseAttribution(
  receipt: unknown,
  path = "receipt",
): ReceiptSurpriseAttributionCheck {
  const issues: CostEvaluationIssue[] = [];

  if (!isRecord(receipt)) {
    return {
      ok: false,
      issues: [
        issue(
          path,
          "receipt-not-object",
          "receipt must be an object before cost attribution can be evaluated",
          receipt,
        ),
      ],
      observation: null,
    };
  }

  const cost = readRecord(receipt, "cost", path, "cost-not-object", issues);
  const wake = readRecord(receipt, "wake", path, "wake-not-object", issues);
  if (cost === undefined || wake === undefined) {
    return { ok: false, issues: Object.freeze([...issues]), observation: null };
  }

  const tokenSpend = readTokenSpend(cost, `${path}.cost`, issues);
  const wakeSource = readWakeSource(wake, `${path}.wake`, issues);
  const surpriseCause = readExactlyOneSurpriseCause(cost, `${path}.cost`, issues);

  if (
    surpriseCause !== undefined &&
    wakeSource !== undefined &&
    surpriseCause !== wakeSource
  ) {
    issues.push(
      issue(
        `${path}.cost.surprise_cause`,
        "surprise-cause-mismatch",
        "cost.surprise_cause must echo the receipt wake.source",
        { surprise_cause: surpriseCause, wake_source: wakeSource },
      ),
    );
  }

  if (
    tokenSpend === undefined ||
    surpriseCause === undefined ||
    wakeSource === undefined
  ) {
    return { ok: false, issues: Object.freeze([...issues]), observation: null };
  }

  const observation: ReceiptCostObservation = {
    path: `${path}.cost`,
    token_bearing: tokenSpend.fresh + tokenSpend.reused > 0,
    fresh: tokenSpend.fresh,
    reused: tokenSpend.reused,
    surprise_cause: surpriseCause,
    wake_source: wakeSource,
  };

  return {
    ok: issues.length === 0,
    issues: Object.freeze([...issues]),
    observation,
  };
}

export function evaluateSurpriseAttributionComplete(
  receipts: readonly unknown[],
): CostRelationshipEvaluation {
  const checks = receipts.map((receipt, index) =>
    validateReceiptSurpriseAttribution(receipt, `receipts[${index}]`),
  );
  const observations = checks.flatMap((check) =>
    check.observation === null ? [] : [check.observation],
  );
  const tokenBearing = observations.filter(
    (observation) => observation.token_bearing,
  );
  const issues = checks.flatMap((check) => check.issues);

  if (tokenBearing.length === 0) {
    issues.push(
      issue(
        "receipts",
        "token-bearing-evidence-missing",
        "surprise attribution needs at least one token-bearing receipt",
        { receipts: receipts.length },
      ),
    );
  }

  return relationshipResult(
    "surprise-attribution-complete",
    issues.length === 0
      ? "all token-bearing receipts name exactly one allowed surprise cause"
      : "one or more token-bearing receipts failed surprise attribution",
    receipts.length,
    tokenBearing.length,
    0,
    0,
    issues,
  );
}

export function evaluateFlatSpendUnderStatic(
  input: FlatSpendUnderStaticInput,
): CostRelationshipEvaluation {
  const issues: CostEvaluationIssue[] = [];
  const bootstrapReceiptCount = input.bootstrap_receipt_count ?? 1;

  if (
    !Number.isSafeInteger(bootstrapReceiptCount) ||
    bootstrapReceiptCount < 0
  ) {
    issues.push(
      issue(
        "bootstrap_receipt_count",
        "bootstrap-receipt-count-invalid",
        "bootstrap_receipt_count must be a non-negative safe integer",
        bootstrapReceiptCount,
      ),
    );
  }

  if (input.world_profile !== undefined && input.world_profile !== "static") {
    issues.push(
      issue(
        "world_profile",
        "world-profile-not-static",
        "flat-spend-under-static only applies to static world runs",
        input.world_profile,
      ),
    );
  }

  const checks = input.receipts.map((receipt, index) =>
    validateReceiptSurpriseAttribution(receipt, `receipts[${index}]`),
  );
  issues.push(...checks.flatMap((check) => check.issues));

  const observations = checks.flatMap((check) =>
    check.observation === null ? [] : [check.observation],
  );
  const tokenBearing = observations.filter(
    (observation) => observation.token_bearing,
  );
  const safeBootstrapReceiptCount =
    Number.isSafeInteger(bootstrapReceiptCount) && bootstrapReceiptCount >= 0
      ? bootstrapReceiptCount
      : 0;
  const postBootstrap = tokenBearing.slice(safeBootstrapReceiptCount);

  if (tokenBearing.length === 0) {
    issues.push(
      issue(
        "receipts",
        "token-bearing-evidence-missing",
        "flat-spend-under-static needs token-bearing receipt evidence",
        { receipts: input.receipts.length },
      ),
    );
  }

  for (const observation of postBootstrap) {
    if (observation.fresh === 0 || isSelfRecheckObservation(observation)) {
      continue;
    }

    issues.push(
      issue(
        `${observation.path}.tokens.fresh`,
        "post-bootstrap-fresh-spend",
        "post-bootstrap static-world fresh spend must stay flat except self-driven recheck ticks",
        {
          fresh: observation.fresh,
          reused: observation.reused,
          surprise_cause: observation.surprise_cause,
        },
      ),
    );
  }

  return relationshipResult(
    "flat-spend-under-static",
    issues.length === 0
      ? "static-world post-bootstrap fresh spend stayed flat apart from the self-driven recheck floor"
      : "static-world post-bootstrap fresh spend increased outside the self-driven recheck floor",
    input.receipts.length,
    tokenBearing.length,
    postBootstrap.length,
    postBootstrap.filter(isSelfRecheckObservation).length,
    issues,
  );
}

/**
 * A self-driven recheck tick: the node's own continuity clock re-examined a fact
 * for silent staleness (world-model.md §6 L285-290). This is the single
 * legitimate source of post-bootstrap fresh spend in a static world — the
 * deliberately-declared forecast-cadence exception, not a hidden clock.
 */
export function isSelfRecheckObservation(
  observation: Pick<ReceiptCostObservation, "surprise_cause">,
): boolean {
  return observation.surprise_cause === "self";
}

function relationshipResult(
  relationship: CostRelationship,
  summary: string,
  receiptCount: number,
  tokenBearingReceiptCount: number,
  postBootstrapTokenBearingReceiptCount: number,
  selfRecheckFloorReceiptCount: number,
  issues: readonly CostEvaluationIssue[],
): CostRelationshipEvaluation {
  return {
    ok: issues.length === 0,
    relationship,
    summary,
    issues: Object.freeze([...issues]),
    checked: {
      receipts: receiptCount,
      token_bearing_receipts: tokenBearingReceiptCount,
      post_bootstrap_token_bearing_receipts:
        postBootstrapTokenBearingReceiptCount,
      self_recheck_floor_receipts: selfRecheckFloorReceiptCount,
    },
  };
}

function readRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  code: "cost-not-object" | "wake-not-object",
  issues: CostEvaluationIssue[],
): Readonly<Record<string, unknown>> | undefined {
  const value = record[key];
  if (!isRecord(value)) {
    issues.push(
      issue(`${path}.${key}`, code, `${path}.${key} must be an object`, value),
    );
    return undefined;
  }

  return value;
}

function readTokenSpend(
  cost: Readonly<Record<string, unknown>>,
  path: string,
  issues: CostEvaluationIssue[],
): { readonly fresh: number; readonly reused: number } | undefined {
  const tokens = cost["tokens"];
  if (!isRecord(tokens)) {
    issues.push(
      issue(
        `${path}.tokens`,
        "tokens-not-object",
        "cost.tokens must carry fresh and reused token counts",
        tokens,
      ),
    );
    return undefined;
  }

  const fresh = tokens["fresh"];
  const reused = tokens["reused"];
  if (!isNonNegativeSafeInteger(fresh) || !isNonNegativeSafeInteger(reused)) {
    issues.push(
      issue(
        `${path}.tokens`,
        "tokens-invalid",
        "cost.tokens.fresh and cost.tokens.reused must be non-negative safe integers",
        { fresh, reused },
      ),
    );
    return undefined;
  }

  return { fresh, reused };
}

function readWakeSource(
  wake: Readonly<Record<string, unknown>>,
  path: string,
  issues: CostEvaluationIssue[],
): WakeSource | undefined {
  const source = wake["source"];
  if (!isAllowedSurpriseCause(source)) {
    issues.push(
      issue(
        `${path}.source`,
        "wake-source-invalid",
        "wake.source must be one of input, self, external",
        source,
      ),
    );
    return undefined;
  }

  return source;
}

function readExactlyOneSurpriseCause(
  cost: Readonly<Record<string, unknown>>,
  path: string,
  issues: CostEvaluationIssue[],
): WakeSource | undefined {
  if (!Object.hasOwn(cost, "surprise_cause")) {
    issues.push(
      issue(
        `${path}.surprise_cause`,
        "surprise-cause-missing",
        "cost.surprise_cause is required for receipt cost attribution",
        null,
      ),
    );
    return undefined;
  }

  const surpriseCause = cost["surprise_cause"];
  if (Array.isArray(surpriseCause) || Object.hasOwn(cost, "surprise_causes")) {
    issues.push(
      issue(
        `${path}.surprise_cause`,
        "surprise-cause-multiple",
        "receipt cost attribution must name exactly one surprise cause",
        {
          surprise_cause: surpriseCause,
          surprise_causes: cost["surprise_causes"] ?? null,
        },
      ),
    );
    return undefined;
  }

  if (!isAllowedSurpriseCause(surpriseCause)) {
    issues.push(
      issue(
        `${path}.surprise_cause`,
        "surprise-cause-invalid",
        "cost.surprise_cause must be one of input, self, external",
        surpriseCause,
      ),
    );
    return undefined;
  }

  return surpriseCause;
}

function issue(
  path: string,
  code: CostEvaluationIssueCode,
  message: string,
  observed: unknown,
): CostEvaluationIssue {
  return { path, code, message, observed };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

// ---------------------------------------------------------------------------
// EXPERIMENT A — the opt-in enforced fresh-token budget (./budget)
// ---------------------------------------------------------------------------

export {
  createBudgetTracker,
  budgetExhaustedCost,
  isBudgetExhaustedReceipt,
  BUDGET_EXHAUSTED_MODEL,
  type ReactorBudget,
  type ReactorBudgetOption,
  type BudgetTracker,
} from "./budget";
