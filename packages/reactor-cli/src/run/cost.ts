/**
 * The cost projector (CLI plan Phase 3 / §5.4) — the shared, KEYLESS rollup of
 * ledger receipts into the "cost scales with surprise" view.
 *
 * `serve` surfaces its OWN live cost (a periodic line + the HTTP `/cost`
 * endpoint), and the later observability commands (`status`/`logs`, Phase 5)
 * reuse this same projector — so the number an operator watches is computed in
 * ONE place. It reads ONLY the SDK ledger's receipt stream (each receipt carries
 * `node`, `status`, and `cost.tokens.{fresh,reused}` + `cost.surprise_cause`),
 * so it lives entirely on the offline path (no model surface).
 *
 * The thesis it makes observable (`cli.md` §5.4): a quiet day → near-zero fresh
 * tokens; a loud event → a spike attributable to the node + the wake that caused
 * it. `skipped` (zero cost) vs `rendered` (moved fingerprint, real cost) vs
 * `failed` is the memoization made visible.
 */

/** A structural mirror of an SDK ledger receipt's cost (the fields we read). */
export interface ReceiptCost {
  readonly tokens: { readonly fresh: number; readonly reused: number };
  /** The wake source that drove the spend (`input` | `self` | `external`). */
  readonly surprise_cause?: string;
}

/** A structural mirror of an SDK ledger receipt (the fields the projector reads). */
export interface CostReceipt {
  readonly node: string;
  readonly status?: string;
  readonly cost: ReceiptCost;
}

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

/** The full cost rollup the `serve` line + `/cost` + `status` all share. */
export interface CostRollup {
  /** The host-wide token totals across every receipt. */
  readonly total: TokenTotals;
  /** Per-node token totals (so a spike is attributable to the node). */
  readonly byNode: Readonly<Record<string, TokenTotals>>;
  /** Per-surprise-cause token totals (`input` | `self` | `external` | `unknown`). */
  readonly bySurpriseCause: Readonly<Record<string, TokenTotals>>;
  /** The disposition tallies (rendered/skipped/failed/other). */
  readonly dispositions: DispositionCounts;
  /** The number of receipts the rollup summed. */
  readonly receipts: number;
}

const ZERO: TokenTotals = { fresh: 0, reused: 0 };

function add(a: TokenTotals, b: { fresh: number; reused: number }): TokenTotals {
  return { fresh: a.fresh + b.fresh, reused: a.reused + b.reused };
}

/**
 * Roll up a receipt stream into the {@link CostRollup}. Pure + deterministic:
 * it never mutates the receipts and never touches the model surface. An empty
 * stream yields all-zero totals (the honest quiet-day view).
 */
export function rollupCost(receipts: readonly CostReceipt[]): CostRollup {
  let total = ZERO;
  const byNode: Record<string, TokenTotals> = {};
  const bySurpriseCause: Record<string, TokenTotals> = {};
  const dispositions = { rendered: 0, skipped: 0, failed: 0, other: 0 };

  for (const r of receipts) {
    const tokens = r.cost.tokens;
    total = add(total, tokens);
    byNode[r.node] = add(byNode[r.node] ?? ZERO, tokens);
    const cause = r.cost.surprise_cause ?? 'unknown';
    bySurpriseCause[cause] = add(bySurpriseCause[cause] ?? ZERO, tokens);

    switch (r.status) {
      case 'rendered':
        dispositions.rendered += 1;
        break;
      case 'skipped':
        dispositions.skipped += 1;
        break;
      case 'failed':
        dispositions.failed += 1;
        break;
      default:
        dispositions.other += 1;
        break;
    }
  }

  return {
    total,
    byNode,
    bySurpriseCause,
    dispositions,
    receipts: receipts.length,
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
