/**
 * The cost PRESENTATION projection (CLI plan Phase 3 / §5.4) — the operator-
 * facing rollup the `serve` line + the HTTP `/cost`/`/status` endpoints + the
 * observability commands all share.
 *
 * The "cost scales with surprise" METRIC is no longer computed here: it is the
 * SDK's ONE `observe()` rollup (`@openprose/reactor`'s `ReactorView`/`CostRollup`),
 * computed once over the receipt trail. This module is now a thin presentation
 * adapter that re-keys that one SDK rollup into the CLI's stable output contract
 * (the `--json` shape + the text line) — so the number an operator watches and
 * the number the SDK computes are THE SAME number, derived once. The prior
 * parallel `rollupCost` loop + the `CostReceipt` structural mirror are gone.
 *
 * The thesis it makes observable (`cli.md` §5.4): a quiet day → near-zero fresh
 * tokens; a loud event → a spike attributable to the node + the wake that caused
 * it. `skipped` (zero cost) vs `rendered` (moved fingerprint, real cost) vs
 * `failed` is the memoization made visible.
 */

import { observe, type LedgerReceipt } from '@openprose/reactor';

/** A fresh/reused token pair. */
export interface TokenTotals {
  readonly fresh: number;
  readonly reused: number;
}

/** The disposition tallies the cost view surfaces (the memoization made visible). */
export interface DispositionCounts {
  readonly rendered: number;
  readonly skipped: number;
  readonly failed: number;
  readonly other: number;
}

/**
 * The operator-facing cost rollup the `serve` line + `/cost` + `status` all
 * share. A PRESENTATION projection of the SDK's one `CostRollup` (it never
 * recomputes the metric) — the field names are the stable CLI output contract.
 */
export interface CostRollup {
  /** The host-wide token totals across every receipt. */
  readonly total: TokenTotals;
  /** Per-node token totals (so a spike is attributable to the node). */
  readonly byNode: Readonly<Record<string, TokenTotals>>;
  /** Per-surprise-cause token totals (`input` | `self` | `external`). */
  readonly bySurpriseCause: Readonly<Record<string, TokenTotals>>;
  /** The disposition tallies (rendered/skipped/failed/other). */
  readonly dispositions: DispositionCounts;
  /** The number of receipts the rollup summed. */
  readonly receipts: number;
}

/**
 * Shape a receipt trail into the {@link CostRollup} via the SDK's ONE
 * `observe()` rollup. Pure + deterministic; never mutates the receipts and never
 * touches the model surface. An empty trail yields all-zero totals (the honest
 * quiet-day view). The metric is the SDK's — this only re-keys it into the CLI's
 * output contract: only the surprise causes actually present in the trail are
 * surfaced, and the `coalesced` disposition (never produced by a receipt trail)
 * folds into `other`.
 */
export function rollupCost(receipts: readonly LedgerReceipt[]): CostRollup {
  const { cost, dispositions, receipts: trail } = observe({ receipts });

  const byNode: Record<string, TokenTotals> = {};
  for (const [node, bucket] of Object.entries(cost.byNode)) {
    byNode[node] = { fresh: bucket.fresh, reused: bucket.reused };
  }

  // Surface only the causes actually present in the trail (the CLI contract omits
  // zero-receipt causes; the SDK `byCause` always carries all three wake-source
  // keys, so we drop the absent ones here).
  const bySurpriseCause: Record<string, TokenTotals> = {};
  const seen = new Set<string>(receipts.map((r) => r.cost.surprise_cause));
  for (const [cause, bucket] of Object.entries(cost.byCause)) {
    if (seen.has(cause)) {
      bySurpriseCause[cause] = { fresh: bucket.fresh, reused: bucket.reused };
    }
  }

  return {
    total: { fresh: cost.total.fresh, reused: cost.total.reused },
    byNode,
    bySurpriseCause,
    dispositions: {
      rendered: dispositions.rendered,
      skipped: dispositions.skipped,
      failed: dispositions.failed,
      other: dispositions.coalesced,
    },
    receipts: trail.length,
  };
}

/** Render a compact one-line live-cost summary (`serve`'s periodic line). */
export function formatCostLine(rollup: CostRollup): string {
  return (
    `cost: fresh=${rollup.total.fresh} reused=${rollup.total.reused} ` +
    `(rendered=${rollup.dispositions.rendered} skipped=${rollup.dispositions.skipped}` +
    `${rollup.dispositions.failed > 0 ? ` failed=${rollup.dispositions.failed}` : ''}` +
    `) receipts=${rollup.receipts}`
  );
}
