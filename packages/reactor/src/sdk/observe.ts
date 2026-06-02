// The ONE unified observe surface — `observe(source)` → a `ReactorView` over a
// (live or replayed) receipt trail. This is the SDK's single read-and-rollup
// entry point: the "fresh-vs-reused $" hero metric ("cost scales with surprise",
// architecture.md §6.1 / cli.md §5.4) is computed HERE, once, and every consumer
// (the live `serve` line, the HTTP `/cost` + `/status` endpoints, the
// observability commands, the DevTools meter) reads off this one shape rather
// than re-implementing the rollup.
//
// `observe` accepts FOUR source forms so the same rollup serves every caller:
//   - a live `Reactor` handle           → reads `reactor.ledger.all()`
//   - `{ ledger }`                       → reads `ledger.all()` (a replayed trail)
//   - `{ receipts }`                     → a trail array held directly
//   - `{ results }`                      → a synchronous drive return
//     (`ReconcileResult[]`), the case the old `summarize()` covered — folded in
//     here so there is ONE rollup entry point, never a parallel `summarize`.
//
// The view carries BOTH bucketings the prior two parallel rollups exposed (the
// SDK's replay-only `byCause`/surprise-cause split AND the CLI's live `byNode`
// split), plus the disposition tallies and the receipt count — so neither side
// loses a field. `CostRollup` is the promoted, generalized `ReplayCostRollup`
// (replay-session.ts) lifted to the headline surface; `ReplayCostRollup` /
// `ReplayCostBucket` remain exported (deprecated aliases) for the DevTools
// `createReplaySession` consumer (REHOME-MAP keeps them reachable at `.`).
//
// Pure data over `LedgerReceipt[]` — no I/O, no port, no new dependency. Mirrors
// the codebase's pure-shaping convention (cf. `createReplaySession`).

import type { WakeSource } from "../shapes";
import type { LedgerReceipt } from "../receipt";
import { verifyReceiptChain } from "../receipt";
import type { ReconcileResult, ReconcileDisposition } from "../reactor";
import type { Reactor } from "./reactor-handle";
import type { MutableReceiptLedger } from "./mounted-dag";

// ---------------------------------------------------------------------------
// The rollup shapes (the ONE CostRollup — promoted ReplayCostRollup)
// ---------------------------------------------------------------------------

/**
 * A fresh/reused token pair — the atom of the cost rollup. `fresh` is the spend
 * that surprise actually drove (a moved fingerprint = a real render); `reused`
 * is the memo-hit / skipped-render tokens. A quiet world keeps `fresh` ~flat; a
 * surprise spikes it ("cost scales with surprise").
 */
export interface CostBucket {
  /** Summed `cost.tokens.fresh` — the spend surprise drove. */
  readonly fresh: number;
  /** Summed `cost.tokens.reused` — the memo-hit / reused tokens. */
  readonly reused: number;
}

/**
 * The ONE cost rollup — the promoted, generalized {@link ReplayCostRollup}. Both
 * bucketings are exposed from this single type: `byCause` (per `surprise_cause`
 * wake source — the replay split) AND `byNode` (per node — the live `serve`
 * split), plus the grand `total`. The hero "fresh-vs-reused $" metric is this
 * shape's `total`/`byCause`/`byNode`; it is computed ONCE, in {@link observe}.
 */
export interface CostRollup {
  /** Summed `cost.tokens.fresh` across the whole trail (= `total.fresh`). */
  readonly fresh: number;
  /** Summed `cost.tokens.reused` across the whole trail (= `total.reused`). */
  readonly reused: number;
  /** Per-`surprise_cause` bucket (the wake source that drove the spend). */
  readonly byCause: Readonly<Record<WakeSource, CostBucket>>;
  /** Per-node bucket (so a spike is attributable to the node). */
  readonly byNode: Readonly<Record<string, CostBucket>>;
  /** The grand total across every receipt. */
  readonly total: CostBucket;
}

// ---------------------------------------------------------------------------
// The unified view
// ---------------------------------------------------------------------------

/**
 * The shaped, read-only view over a (live or replayed) receipt trail — the
 * single return of {@link observe}. All fields are derived from the ordered
 * `LedgerReceipt[]`; nothing here does I/O or holds a port. Re-derive a fresh
 * view whenever the underlying trail grows (the live handle's `view` accessor
 * re-derives on each read).
 */
export interface ReactorView {
  /** The ordered receipt trail (append order = the timeline). */
  readonly receipts: readonly LedgerReceipt[];
  /** The receipts grouped per node, in append (chain) order. */
  readonly byNode: ReadonlyMap<string, readonly LedgerReceipt[]>;
  /**
   * The disposition tallies — how many receipts/results landed in each
   * disposition. From a receipt trail the keys are `rendered`/`skipped`/`failed`
   * (a receipt's `status`); from a `{ results }` source `coalesced` is also
   * counted (a coalesced result writes no receipt). Every key is always present
   * (zero-filled), so a formatter never branches on absence.
   */
  readonly dispositions: Record<ReconcileDisposition, number>;
  /** The ONE cost rollup (`byCause` + `byNode` + `total`); the hero metric. */
  readonly cost: CostRollup;
  /**
   * Verify the receipt chain (the tamper / chain-consistency check, the v1
   * "signed" meaning, architecture.md §5.1). Verifies each node's `prev`-linked
   * chain; `ok:false` collects every node's chain errors.
   */
  verifyChain(): { ok: boolean; errors: readonly string[] };
}

// ---------------------------------------------------------------------------
// The source union + the one entry point
// ---------------------------------------------------------------------------

/**
 * The source {@link observe} reads a {@link ReactorView} from. A live `Reactor`
 * handle (reads its ledger), an already-opened `{ ledger }` (a replayed trail),
 * a `{ receipts }` trail array, or a `{ results }` synchronous drive return (the
 * folded-in `summarize()` case). The four forms share ONE rollup.
 */
export type ObserveSource =
  | Reactor
  | { readonly ledger: MutableReceiptLedger }
  | { readonly receipts: readonly LedgerReceipt[] }
  | { readonly results: readonly ReconcileResult[] };

const WAKE_SOURCES: readonly WakeSource[] = ["input", "self", "external"];

function emptyBucket(): { fresh: number; reused: number } {
  return { fresh: 0, reused: 0 };
}

function isReactor(source: ObserveSource): source is Reactor {
  return typeof (source as Reactor).ingest === "function";
}

/**
 * Pull the ordered receipt trail (and any extra non-receipt-writing dispositions,
 * e.g. `coalesced`) out of any {@link ObserveSource}.
 */
function readTrail(source: ObserveSource): {
  readonly receipts: readonly LedgerReceipt[];
  readonly extraDispositions: readonly ReconcileDisposition[];
} {
  if (isReactor(source)) {
    return { receipts: source.ledger.all(), extraDispositions: [] };
  }
  if ("ledger" in source && source.ledger !== undefined) {
    return { receipts: source.ledger.all(), extraDispositions: [] };
  }
  if ("receipts" in source && source.receipts !== undefined) {
    return { receipts: source.receipts, extraDispositions: [] };
  }
  // The synchronous drive return: each result carries a disposition; `rendered`/
  // `skipped`/`failed` results carry a `receipt`, `coalesced` writes none — so we
  // gather the receipts AND track the receipt-less dispositions so the tallies
  // are complete (the old `summarize()` case, folded in).
  const results = (source as { readonly results: readonly ReconcileResult[] })
    .results;
  const receipts: LedgerReceipt[] = [];
  const extraDispositions: ReconcileDisposition[] = [];
  for (const result of results) {
    if (result.receipt !== undefined) {
      // A drive-return receipt is a `Receipt`; the ledger stamps it into a
      // `LedgerReceipt` on append, but for the rollup (which only reads `node`,
      // `status`, `cost`, `wake`, `fingerprints`) the `Receipt` fields suffice.
      receipts.push(result.receipt as LedgerReceipt);
    } else {
      extraDispositions.push(result.disposition);
    }
  }
  return { receipts, extraDispositions };
}

/**
 * Observe a (live or replayed) receipt trail as ONE {@link ReactorView}. The
 * single read-and-rollup entry point: the per-node chain index, the disposition
 * tallies, and the ONE {@link CostRollup} (`byCause` + `byNode` + `total`) are
 * all computed here, once. Pure data over the trail — no I/O, no port.
 */
export function observe(source: ObserveSource): ReactorView {
  const { receipts, extraDispositions } = readTrail(source);

  // 1) per-node chain index (grouped on `receipt.node`, append order).
  const byNode = new Map<string, LedgerReceipt[]>();
  for (const receipt of receipts) {
    let chain = byNode.get(receipt.node);
    if (chain === undefined) {
      chain = [];
      byNode.set(receipt.node, chain);
    }
    chain.push(receipt);
  }

  // 2) disposition tallies — always-present keys (zero-filled). A receipt's
  //    `status` is `rendered`/`skipped`/`failed`; `coalesced` only arrives from a
  //    `{ results }` source (a coalesced result writes no receipt).
  const dispositions: Record<ReconcileDisposition, number> = {
    rendered: 0,
    skipped: 0,
    failed: 0,
    coalesced: 0,
  };
  for (const receipt of receipts) {
    dispositions[receipt.status] += 1;
  }
  for (const disposition of extraDispositions) {
    dispositions[disposition] += 1;
  }

  // 3) the ONE cost rollup — fresh/reused bucketed by `surprise_cause` AND by
  //    node, plus the grand total.
  const byCauseBuckets: Record<WakeSource, { fresh: number; reused: number }> = {
    input: emptyBucket(),
    self: emptyBucket(),
    external: emptyBucket(),
  };
  const byNodeBuckets: Record<string, { fresh: number; reused: number }> = {};
  const total = emptyBucket();
  for (const receipt of receipts) {
    const fresh = receipt.cost.tokens.fresh;
    const reused = receipt.cost.tokens.reused;
    const cause = receipt.cost.surprise_cause;
    byCauseBuckets[cause].fresh += fresh;
    byCauseBuckets[cause].reused += reused;
    const node = (byNodeBuckets[receipt.node] ??= emptyBucket());
    node.fresh += fresh;
    node.reused += reused;
    total.fresh += fresh;
    total.reused += reused;
  }
  const byCause: Record<WakeSource, CostBucket> = {
    input: byCauseBuckets.input,
    self: byCauseBuckets.self,
    external: byCauseBuckets.external,
  };
  const cost: CostRollup = {
    fresh: total.fresh,
    reused: total.reused,
    byCause,
    byNode: byNodeBuckets,
    total,
  };

  const verifyChain = (): { ok: boolean; errors: readonly string[] } => {
    const errors: string[] = [];
    for (const [, chain] of byNode) {
      const result = verifyReceiptChain(chain);
      if (!result.ok && result.errors !== undefined) {
        errors.push(...result.errors);
      }
    }
    return { ok: errors.length === 0, errors };
  };

  return {
    receipts,
    byNode,
    dispositions,
    cost,
    verifyChain,
  };
}

// Re-exported so a single import of the observe surface need not also reach for
// the wake-source union from `../shapes` when iterating cost buckets.
export { WAKE_SOURCES };
