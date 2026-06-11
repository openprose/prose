// cost/budget.ts — EXPERIMENT A: the opt-in ENFORCED fresh-token budget.
//
// Spec 02 "Honest Current Limits" names cost as "observed, not budgeted (no
// enforced token ceiling per node/run)". This module closes that gap for a
// run/serve SESSION: a hard ceiling on cumulative `cost.tokens.fresh` past
// which a render dispatch REFUSES (a zero-cost `failed` receipt; the prior
// truth stands) instead of contacting a provider. The shape mirrors Claude
// Code's Workflow budget accessor: `budget.total` / `budget.spent()` /
// `budget.remaining()`, with null/Infinity semantics when no budget is set.
//
// Enforcement semantics (deliberate, Workflow-style):
//   - Refusal happens AT DISPATCH (`spent >= total`): an in-flight render that
//     overshoots the ceiling still commits and is charged; the NEXT dispatch
//     refuses. `maxFreshTokens` is a refuse-new-work line, never a mid-call
//     abort, so the final total may exceed it by up to one render per
//     concurrent driver (the reconciler drains are serial, bounding overshoot).
//   - `spent()` counts THIS session's render outcomes, starting at 0 at
//     assembly. A restarted serve over the same durable ledger gets a fresh
//     ceiling — the budget is a session budget, not a durable-trail sum.
//   - Memo-skips are FREE and unblockable by construction: the skip decision
//     happens in the reconciler BEFORE any spawn port is called, and the
//     tracker is wired only at the spawn ports (mounted-dag.ts).
//   - FAILED outcomes are charged too: a live render that errored after
//     burning fresh tokens reports them on its `RenderFailure.cost`, and the
//     budget must reflect the receipt truth verbatim.
//
// This module is dependency-free (imports ONLY ../shapes types) so every
// barrel that re-exports it stays offline-loadable.

import type { Cost, Receipt, WakeSource } from "../shapes";

/**
 * EXPERIMENT A — the opt-in enforced fresh-token ceiling. Default OFF: every
 * assembly seam (`mountDag` → `createReactor` → `runProject` → the `reactor()`
 * facade) accepts it optionally, and unset means behavior identical to today.
 */
export interface ReactorBudgetOption {
  /**
   * Hard ceiling on cumulative `cost.tokens.fresh` committed by this reactor's
   * renders THIS session. Once `spent() >= maxFreshTokens`, the next render
   * dispatch refuses (a zero-cost `failed` receipt; prior truth stands). An
   * in-flight render is never aborted, so the committed total may overshoot
   * by the renders already dispatched. Must be a non-negative safe integer;
   * `0` refuses the very first render.
   */
  readonly maxFreshTokens: number;
}

/**
 * The Workflow-shaped budget accessor (`budget.total` / `budget.spent()` /
 * `budget.remaining()`) exposed on the {@link MountedDag} and the typed
 * `Reactor` handle.
 */
export interface ReactorBudget {
  /** The configured ceiling; `null` when no budget is set (unlimited). */
  readonly total: number | null;
  /**
   * Cumulative fresh tokens charged by render outcomes (rendered AND failed)
   * THIS session — 0 at assembly; skips are never charged.
   */
  readonly spent: () => number;
  /** `max(0, total - spent)`; `Infinity` when no budget is set. */
  readonly remaining: () => number;
}

/**
 * The internal tracker `mountDag` wires: the read-only {@link ReactorBudget}
 * view plus the two enforcement verbs the spawn ports use.
 */
export interface BudgetTracker {
  /** The Workflow-shaped read view. */
  readonly view: ReactorBudget;
  /** Accumulate an outcome's `cost.tokens.fresh` (rendered AND failed outcomes). */
  readonly charge: (cost: Cost) => void;
  /** `total !== null && spent >= total` — the refusal predicate; always false when unset. */
  readonly exhausted: () => boolean;
}

/**
 * Create the session-scoped budget tracker. With no option (or `undefined`)
 * the tracker is UNLIMITED: `total` is `null`, `remaining()` is `Infinity`,
 * and `exhausted()` is always false — behavior identical to a budget-less run.
 *
 * @throws TypeError when `maxFreshTokens` is supplied but is not a
 * non-negative safe integer.
 */
export function createBudgetTracker(option?: ReactorBudgetOption): BudgetTracker {
  const total = option?.maxFreshTokens ?? null;
  if (total !== null && (!Number.isSafeInteger(total) || total < 0)) {
    throw new TypeError(
      `budget.maxFreshTokens must be a non-negative safe integer; got ${String(total)}`,
    );
  }

  let spent = 0;

  return {
    view: {
      total,
      spent: () => spent,
      remaining: () => (total === null ? Infinity : Math.max(0, total - spent)),
    },
    charge: (cost) => {
      spent += cost.tokens.fresh;
    },
    exhausted: () => total !== null && spent >= total,
  };
}

/**
 * The durable refusal marker. The v0 `Receipt` has no failure-reason field
 * (the known thin-receipt limit), so the budget refusal rides the free-string
 * `cost.model` slot — receipt validation requires only a non-empty string
 * there. When the receipt-widening work lands a real `reason` field, the
 * marker migrates there; {@link isBudgetExhaustedReceipt} is the single
 * compatibility shim consumers should query through.
 */
export const BUDGET_EXHAUSTED_MODEL = "budget-exhausted";

/**
 * The zero-cost refusal `Cost` a budget-refused dispatch stamps onto its
 * `failed` receipt: no provider was contacted (`provider: "none"`), zero
 * tokens, the {@link BUDGET_EXHAUSTED_MODEL} marker, and a `surprise_cause`
 * echoing the wake source (the receipt invariant every cost validator checks).
 */
export function budgetExhaustedCost(source: WakeSource): Cost {
  return {
    provider: "none",
    model: BUDGET_EXHAUSTED_MODEL,
    tokens: { fresh: 0, reused: 0 },
    surprise_cause: source,
  };
}

/**
 * True iff a receipt is a budget refusal: a `failed` status carrying the
 * {@link BUDGET_EXHAUSTED_MODEL} marker and zero tokens (no provider was ever
 * contacted). The single query seam over the v0 marker encoding.
 */
export function isBudgetExhaustedReceipt(
  receipt: Pick<Receipt, "status" | "cost">,
): boolean {
  return (
    receipt.status === "failed" &&
    receipt.cost.model === BUDGET_EXHAUSTED_MODEL &&
    receipt.cost.tokens.fresh === 0 &&
    receipt.cost.tokens.reused === 0
  );
}
