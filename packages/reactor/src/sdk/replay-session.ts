// The ReplaySession — a tiny, pure-data shaping helper over the already-existing
// receipt-ledger primitives, so the devtools package (`@openprose/reactor-devtools`)
// and the SURPRISE-COST benchmark don't each re-implement the ordering / per-node
// chain index / moved-facet diff / cumulative cost rollup.
//
// This is the SDK half of the DevTools data contract (see
// `planning/plans/2026-05-31-reactor-devtools/plan.md` §3.2 / §3.6: the
// "ReplaySession shaping helper" — ADD, zero-dep, small). It is PURE DATA over
// existing exported primitives; it pulls NO new dependency and adds no I/O port.
//
// Replay, concretely (plan §1.3 / §3.2): a saved ledger is opened by the CALLER
// (e.g. `new FileSystemReceiptLedger({ storage })`, which re-derives `all()` from
// the durable trail), and the resulting `MutableReceiptLedger` instance is handed
// to `createReplaySession`. ReplaySession stays FS-agnostic — it never touches a
// directory path or a storage layout (the real `storage-fs` adapter persists a
// single `receipts.json` and the ledger reads via `storage.listReceipts()`, so a
// path-based API would be both wrong and coupling). A `{ receipts }` array form is
// also accepted for direct scenario/benchmark runs that already hold the trail.
//
// Everything is derived from `ledger.all()` (`readonly LedgerReceipt[]` in append
// order — the single `#order` array kept by both `InMemoryReceiptLedger` and
// `FileSystemReceiptLedger`). Append order IS the replay timeline.

import type { Facet, FingerprintMap, WakeSource } from "../shapes";
import type { LedgerReceipt, ReceiptChainResult } from "../receipt";
import { verifyReceiptChain } from "../receipt";
import { movedFacetsBetween } from "../reactor";
import type { MutableReceiptLedger } from "./mounted-dag";

/**
 * The input to {@link createReplaySession}. Prefer handing in an
 * ALREADY-CONSTRUCTED ledger instance (`{ ledger }`) — the caller opens it
 * (`new FileSystemReceiptLedger({ storage })`) and ReplaySession stays
 * FS-agnostic and zero-dep. The `{ receipts }` form takes a trail array directly
 * (benchmark / scenario runs that already hold `ledger.all()`).
 */
export type ReplaySessionInput =
  | { readonly ledger: MutableReceiptLedger; readonly receipts?: undefined }
  | { readonly receipts: readonly LedgerReceipt[]; readonly ledger?: undefined };

/**
 * The cumulative-cost rollup bucket for one wake cause (`input` / `self` /
 * `external`), plus the grand total. Fresh/reused token counts are summed from
 * `receipt.cost.tokens`; `dollars` is a coarse $-estimate (see
 * {@link ReplaySessionCostOptions}). `skipped` / `failed` receipts contribute
 * zero fresh (receipt validation enforces zero fresh for the `none` provider).
 */
export interface ReplayCostBucket {
  /** Receipts attributed to this bucket. */
  readonly receipts: number;
  /** Summed `cost.tokens.fresh` — the spend that surprise actually drove. */
  readonly fresh: number;
  /** Summed `cost.tokens.reused` — the memo-hit / reused tokens. */
  readonly reused: number;
  /** Coarse $-estimate over `fresh` (and optionally `reused`). */
  readonly dollars: number;
}

/**
 * The cumulative cost rollup: a per-`surprise_cause` breakdown plus the grand
 * total. This is the data behind the DevTools "fresh-vs-reused token / $ meter"
 * (plan §1.2 / §4) — a quiet world keeps `total.fresh` ~flat, a surprise spikes
 * it. No prior fresh/reused-$ rollup helper exists (the `scenario/` harness only
 * counts dispositions), so this is its home.
 */
export interface ReplayCostRollup {
  /** Per-cause buckets, keyed by `cost.surprise_cause`. */
  readonly byCause: Readonly<Record<WakeSource, ReplayCostBucket>>;
  /** The grand total across all causes. */
  readonly total: ReplayCostBucket;
}

/**
 * Optional coarse pricing for the `dollars` estimate. Rates are $ per token.
 * Defaults to zero so the rollup is deterministic and dependency-free unless the
 * caller supplies real rates; `fresh` is the meaningful line ("cost scales with
 * surprise"), so `reusedRate` defaults to 0 even when `freshRate` is set.
 */
export interface ReplaySessionCostOptions {
  /** $ per fresh token. Default 0. */
  readonly freshRate?: number;
  /** $ per reused token. Default 0. */
  readonly reusedRate?: number;
}

/** Optional configuration for {@link createReplaySession}. */
export interface ReplaySessionOptions {
  /** Coarse pricing for the cumulative `dollars` estimate. */
  readonly cost?: ReplaySessionCostOptions;
}

/**
 * The shaped, pure-data view of a (replayed or live-snapshotted) receipt trail.
 * All fields are derived from the ordered `LedgerReceipt[]`; nothing here does
 * I/O or holds a port. Re-derive a fresh session whenever the underlying trail
 * grows (e.g. file-tailing `ledger.all()` for v1 live, plan §3.3 / R1).
 */
export interface ReplaySession {
  /** The ordered trail (append order = replay timeline). */
  readonly receipts: readonly LedgerReceipt[];
  /**
   * The per-node chain index: each node's `prev`-linked receipts in append
   * order (grouped on `receipt.node`). The inspector walks this for the receipt
   * chain (plan §1.2 "click-into-a-node").
   */
  readonly chainByNode: ReadonlyMap<string, readonly LedgerReceipt[]>;
  /**
   * The moved facets for a receipt: its `fingerprints` diffed against the SAME
   * node's previous receipt's `fingerprints` via the existing
   * {@link movedFacetsBetween} helper (null prior = cold start = every facet
   * moved, matching reconciler semantics). Drives which edge lanes light.
   */
  readonly movedFacetsFor: (receipt: LedgerReceipt) => ReadonlySet<Facet>;
  /**
   * The precomputed moved-facet set per receipt, index-aligned with
   * {@link receipts} — the array form of {@link movedFacetsFor} for the SPA's
   * per-frame walk.
   */
  readonly movedFacetsByIndex: readonly ReadonlySet<Facet>[];
  /** The cumulative fresh/reused/$ rollup, bucketed by `surprise_cause`. */
  readonly costRollup: ReplayCostRollup;
  /**
   * Verify one node's `prev`-linked chain via the existing
   * {@link verifyReceiptChain} (the tamper/chain-consistency badge, plan §3.1).
   * Returns the empty-chain `ok` result for an unknown node.
   */
  readonly verifyNodeChain: (node: string) => ReceiptChainResult;
}

const WAKE_SOURCES: readonly WakeSource[] = ["input", "self", "external"];

function emptyBucket(): ReplayCostBucket {
  return { receipts: 0, fresh: 0, reused: 0, dollars: 0 };
}

/**
 * Build a {@link ReplaySession} over an already-opened ledger (preferred) or a
 * direct receipt array. Pure data shaping over existing primitives — ordering,
 * the per-node chain index, the per-receipt moved-facet diff (via the exported
 * {@link movedFacetsBetween}), and the cumulative cost rollup. Zero new
 * dependency, no I/O. Mirrors the codebase's `createX` factory convention.
 */
export function createReplaySession(
  input: ReplaySessionInput,
  options: ReplaySessionOptions = {},
): ReplaySession {
  const receipts: readonly LedgerReceipt[] =
    input.ledger !== undefined ? input.ledger.all() : input.receipts;

  const freshRate = options.cost?.freshRate ?? 0;
  const reusedRate = options.cost?.reusedRate ?? 0;

  // 1) per-node chain index (grouped on `receipt.node`, in append order).
  const chainByNode = new Map<string, LedgerReceipt[]>();
  for (const receipt of receipts) {
    let chain = chainByNode.get(receipt.node);
    if (chain === undefined) {
      chain = [];
      chainByNode.set(receipt.node, chain);
    }
    chain.push(receipt);
  }

  // 2) moved-facet diff per receipt — diff against the SAME node's PREVIOUS
  //    receipt's fingerprints (null prior on the node's first receipt = cold
  //    start = every facet moved). Reuses the exported `movedFacetsBetween`; we
  //    do NOT reinvent the diff. Walk once, tracking the last-seen fingerprints
  //    per node so each receipt's prior is its node-predecessor in timeline order.
  const lastFingerprintsByNode = new Map<string, FingerprintMap>();
  const movedByIndex: ReadonlySet<Facet>[] = [];
  const movedByReceipt = new Map<LedgerReceipt, ReadonlySet<Facet>>();
  for (const receipt of receipts) {
    const prior = lastFingerprintsByNode.get(receipt.node) ?? null;
    const moved = movedFacetsBetween(prior, receipt.fingerprints);
    movedByIndex.push(moved);
    movedByReceipt.set(receipt, moved);
    lastFingerprintsByNode.set(receipt.node, receipt.fingerprints);
  }

  // 3) cumulative cost rollup — fresh/reused/$ bucketed by `surprise_cause`.
  const buckets: Record<WakeSource, ReplayCostBucket> = {
    input: emptyBucket(),
    self: emptyBucket(),
    external: emptyBucket(),
  };
  let total = emptyBucket();
  const accumulate = (
    bucket: ReplayCostBucket,
    fresh: number,
    reused: number,
  ): ReplayCostBucket => ({
    receipts: bucket.receipts + 1,
    fresh: bucket.fresh + fresh,
    reused: bucket.reused + reused,
    dollars: bucket.dollars + fresh * freshRate + reused * reusedRate,
  });
  for (const receipt of receipts) {
    const fresh = receipt.cost.tokens.fresh;
    const reused = receipt.cost.tokens.reused;
    const cause = receipt.cost.surprise_cause;
    buckets[cause] = accumulate(buckets[cause], fresh, reused);
    total = accumulate(total, fresh, reused);
  }
  const byCause: Record<WakeSource, ReplayCostBucket> = {
    input: buckets.input,
    self: buckets.self,
    external: buckets.external,
  };

  // `movedFacetsBetween` (with `Object.keys(next)`) never returns the same Set
  // instance twice, so the per-receipt lookup is stable; an unknown receipt
  // (not from this trail) falls back to a cold-start full-move so the SPA never
  // crashes on a stale reference.
  const EMPTY: ReadonlySet<Facet> = new Set<Facet>();
  const movedFacetsFor = (receipt: LedgerReceipt): ReadonlySet<Facet> => {
    const moved = movedByReceipt.get(receipt);
    if (moved !== undefined) {
      return moved;
    }
    return movedFacetsBetween(null, receipt.fingerprints ?? EMPTY);
  };

  const verifyNodeChain = (node: string): ReceiptChainResult =>
    verifyReceiptChain(chainByNode.get(node) ?? []);

  return {
    receipts,
    chainByNode,
    movedFacetsFor,
    movedFacetsByIndex: movedByIndex,
    costRollup: { byCause, total },
    verifyNodeChain,
  };
}

// Re-exported so a single import of the replay surface need not also reach for
// the wake-source union from `../shapes` when iterating buckets.
export { WAKE_SOURCES };
