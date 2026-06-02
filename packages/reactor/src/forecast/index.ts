// forecast/ — self-driven `### Continuity` + the freshness bridge.
//
// A continuity tick is a receipt whose `wake.source === "self"`. A lapsed
// `valid_until` moves a facet's fingerprint, so "time becoming material"
// propagates as ordinary surprise — there is no special clock path.
//
// Two senses of "stale" live in two places (world-model.md §6):
//   - Freshness *state* (`valid_until`) is DATA in the world-model, reaching us
//     as the per-facet freshness map we read.
//   - Freshness *policy* (the recheck cadence) is `### Continuity`, reaching us
//     as the schedule. It may read the soonest `valid_until` to drive its
//     cadence — that is the `next_self_recheck` we compute and surface.

import {
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
  type ContentAddress,
  type Cost,
  type Facet,
  type Fingerprint,
  type FingerprintMap,
  type InputFingerprints,
  type Wake,
} from "../shapes/index";
import {
  type LedgerReceipt,
  createNullSignature,
  createReceipt,
} from "../receipt/index";

// ---------------------------------------------------------------------------
// Freshness state (DATA in the world-model — world-model.md §6 lines 269-272)
// ---------------------------------------------------------------------------

/**
 * A single facet's published fingerprint paired with its freshness expiry. This
 * is the world-model's freshness *state* (`valid_until`) carried as data in the
 * truth (world-model.md §6 line 269-272; architecture.md §4.2 lines 185-186).
 * `valid_until` is `null` for a facet with no expiry policy (timeless truth).
 */
export interface FacetFreshness {
  readonly facet: Facet;
  /** The facet's currently-published fingerprint (the unmoved token). */
  readonly fingerprint: Fingerprint;
  /** The instant this facet's truth lapses, or `null` if it never expires. */
  readonly valid_until: string | null;
}

/**
 * The self-driven continuity schedule (delta.md §A3.5). The freshness *policy*
 * (`### Continuity` cadence) is the schedule's clock; the freshness *state* is
 * the per-facet freshness it carries. `node` and `contract_fingerprint` replace
 * the old `responsibility_id` / `contract_revision` (delta.md §A6 lines
 * 225-226). `input_fingerprints` replaces `evidence_input_ids` (delta.md §A6
 * line 228) — the consumed-facet tuple the last render saw.
 */
export interface ContinuitySchedule {
  readonly node: string;
  readonly contract_fingerprint: Fingerprint;
  readonly input_fingerprints: InputFingerprints;
  /** Per-facet published fingerprints + their `valid_until` (freshness state). */
  readonly facets: readonly FacetFreshness[];
  /** The prior receipt this node committed; chains the ledger (`prev`). */
  readonly prev: ContentAddress | null;
  /** Provider/model labels for the synthetic-tick cost attribution. */
  readonly provider?: string;
  readonly model?: string;
}

export interface ContinuityTickInput {
  readonly as_of: string;
  readonly schedule: ContinuitySchedule;
}

// ---------------------------------------------------------------------------
// Tick evaluation
// ---------------------------------------------------------------------------

/**
 * The outcome of the node's continuity clock ticking.
 *
 *   - `sleep`  — no facet has lapsed as of `as_of`; nothing to re-examine. The
 *     node stays asleep until `next_self_recheck` (the soonest `valid_until`,
 *     world-model.md §6 lines 278-280). No receipt is manufactured.
 *   - `self-receipt` — at least one facet's `valid_until` has lapsed. We
 *     manufacture a single synthetic self-receipt (the tick, world-model.md §5
 *     lines 234-236) that flips the lapsed facets' status, moving their
 *     fingerprints. `next_self_recheck` is the soonest *remaining* expiry, if
 *     any.
 */
export type ContinuityTickResult =
  | {
      readonly outcome: "sleep";
      readonly next_self_recheck: string | null;
    }
  | {
      readonly outcome: "self-receipt";
      readonly next_self_recheck: string | null;
      readonly lapsed_facets: readonly Facet[];
      readonly receipt: LedgerReceipt;
    };

/**
 * Evaluate the continuity clock. Reads the world-model's freshness *state* (the
 * per-facet `valid_until`) under the `### Continuity` *policy* (this clock), and
 * either sleeps or manufactures one synthetic self-receipt whose lapsed facets'
 * fingerprints have moved.
 *
 * This is the freshness bridge made mechanical (world-model.md §6 lines
 * 276-283): a lapsed `valid_until` MOVES the facet's fingerprint, so the move
 * propagates as ordinary surprise — there is no special clock path in the
 * reconciler; the tick is just a receipt with `wake.source === "self"`.
 */
export function evaluateContinuityTick(
  input: ContinuityTickInput,
): ContinuityTickResult {
  const asOfMs = parseInstantMs(input.as_of, "as_of");
  const { schedule } = input;

  const lapsed = schedule.facets.filter(
    (facet) => isLapsed(facet.valid_until, asOfMs),
  );

  if (lapsed.length === 0) {
    return {
      outcome: "sleep",
      next_self_recheck: soonestValidUntil(schedule.facets),
    };
  }

  const lapsedFacetNames = lapsed.map((facet) => facet.facet);
  const fingerprints = applyFreshnessMove(schedule.facets, lapsedFacetNames);

  const receipt = createSelfRecheckReceipt({
    node: schedule.node,
    contract_fingerprint: schedule.contract_fingerprint,
    input_fingerprints: schedule.input_fingerprints,
    fingerprints,
    prev: schedule.prev,
    as_of: input.as_of,
    lapsed_facets: lapsedFacetNames,
    // `exactOptionalPropertyTypes`: only thread provider/model when present, so
    // an absent label stays absent rather than becoming an explicit `undefined`.
    ...(schedule.provider !== undefined ? { provider: schedule.provider } : {}),
    ...(schedule.model !== undefined ? { model: schedule.model } : {}),
  });

  // The soonest expiry that survives this tick (lapsed facets are now moved and
  // carry a fresh expiry the next commit will set; we only schedule against the
  // still-future expiries we know about).
  const remaining = schedule.facets.filter(
    (facet) => !lapsedFacetNames.includes(facet.facet),
  );

  return {
    outcome: "self-receipt",
    next_self_recheck: soonestValidUntil(remaining),
    lapsed_facets: lapsedFacetNames,
    receipt,
  };
}

// ---------------------------------------------------------------------------
// Synthetic self-receipt construction (the tick)
// ---------------------------------------------------------------------------

export interface SelfRecheckReceiptInput {
  readonly node: string;
  readonly contract_fingerprint: Fingerprint;
  readonly input_fingerprints: InputFingerprints;
  readonly fingerprints: FingerprintMap;
  readonly prev: ContentAddress | null;
  readonly as_of: string;
  readonly lapsed_facets: readonly Facet[];
  readonly provider?: string;
  readonly model?: string;
}

/**
 * Build the synthetic self-receipt for a continuity tick (world-model.md §5
 * lines 234-236). `wake.source === "self"` (SHAPES.md §2; the continuity-clock
 * self-receipt). `cost.surprise_cause === "self"` — the deterministic tick
 * spends zero tokens but its surprise is self-driven, keeping "cost scales with
 * surprise" observable (delta.md §A4 lines 194-197; SHAPES.md §4 line 114).
 *
 * `status` is `rendered`: a self-receipt that flips a lapsed facet has MOVED
 * that facet's fingerprint, so it propagates (world-model.md §8 "only rendered
 * with a moved fingerprint propagates"). There is no judge verdict and no
 * `blocked` state here (delta.md §A3.5 line 183: "Drop the
 * verdict.status:"blocked" that recheck receipts carry today").
 */
export function createSelfRecheckReceipt(
  input: SelfRecheckReceiptInput,
): LedgerReceipt {
  const wake: Wake = {
    source: "self",
    refs: prevRefs(input.prev),
  };

  const cost: Cost = {
    provider: input.provider ?? "forecast",
    model: input.model ?? "deterministic-continuity-clock",
    tokens: { fresh: 0, reused: 0 },
    // The wake source that drove the spend — self-driven continuity.
    surprise_cause: "self",
  };

  // The semantic diff is render-input context (which facets time made material),
  // NEVER a wake signal (SHAPES.md §4 line 110; world-model.md §3). A skipped
  // (sleeping) tick would carry EMPTY_SEMANTIC_DIFF; an active tick records the
  // lapsed facets so a render that consumes this receipt has the context.
  const semantic_diff =
    input.lapsed_facets.length === 0
      ? EMPTY_SEMANTIC_DIFF
      : Object.freeze({
          freshness_lapsed: [...input.lapsed_facets],
          as_of: input.as_of,
        });

  return createReceipt({
    node: input.node,
    contract_fingerprint: input.contract_fingerprint,
    wake,
    input_fingerprints: input.input_fingerprints,
    fingerprints: input.fingerprints,
    semantic_diff,
    prev: input.prev,
    status: "rendered",
    cost,
    sig: createNullSignature(),
  });
}

// ---------------------------------------------------------------------------
// The freshness move (world-model.md §6 lines 276-283)
// ---------------------------------------------------------------------------

/**
 * Apply the freshness bridge: a lapsed facet's status flips, which MOVES its
 * fingerprint. We compute the moved fingerprint deterministically from the prior
 * fingerprint + a lapse marker, so the move is replayable and the tuple is
 * stable. Non-lapsed facets keep their unmoved tokens. Always includes
 * ATOMIC_FACET (SHAPES.md §1 line 40).
 */
export function applyFreshnessMove(
  facets: readonly FacetFreshness[],
  lapsedFacets: readonly Facet[],
): FingerprintMap {
  const lapsed = new Set<Facet>(lapsedFacets);
  const out: Record<Facet, Fingerprint> = {};

  let sawAtomic = false;
  for (const facet of facets) {
    if (facet.facet === ATOMIC_FACET) {
      sawAtomic = true;
    }
    out[facet.facet] = lapsed.has(facet.facet)
      ? moveFingerprint(facet.fingerprint)
      : facet.fingerprint;
  }

  // The atomic whole-truth token moves whenever any facet moved (the whole truth
  // changed), so downstreams subscribed at the atomic grain still wake.
  if (!sawAtomic) {
    const anyMoved = facets.some((facet) => lapsed.has(facet.facet));
    out[ATOMIC_FACET] = anyMoved
      ? moveFingerprint(atomicSeed(facets))
      : atomicSeed(facets);
  } else if (lapsedFacets.length > 0) {
    const atomic = out[ATOMIC_FACET];
    if (atomic !== undefined) {
      out[ATOMIC_FACET] = moveFingerprint(atomic);
    }
  }

  return Object.freeze(out);
}

/**
 * The deterministic move a lapse applies to a fingerprint. A fingerprint is an
 * opaque token (SHAPES.md §1 line 39); the *invariant* is "changes iff material
 * content changed" — a lapse is exactly such a change. The reference move tags
 * the prior token with a stale marker, which is total, replayable, and visibly
 * distinct from the unmoved token.
 */
export function moveFingerprint(prior: Fingerprint): Fingerprint {
  return prior.startsWith("stale:") ? prior : `stale:${prior}`;
}

function atomicSeed(facets: readonly FacetFreshness[]): Fingerprint {
  // A stable summary of the per-facet tokens — order-independent so it depends
  // only on material content, not on facet enumeration order.
  return [...facets]
    .map((facet) => `${facet.facet}=${facet.fingerprint}`)
    .sort()
    .join("|");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLapsed(validUntil: string | null, asOfMs: number): boolean {
  if (validUntil === null) {
    return false;
  }
  return parseInstantMs(validUntil, "valid_until") <= asOfMs;
}

function soonestValidUntil(
  facets: readonly FacetFreshness[],
): string | null {
  const expiries = facets
    .map((facet) => facet.valid_until)
    .filter((value): value is string => value !== null)
    .map((iso) => ({ iso, ms: parseInstantMs(iso, "valid_until") }));

  if (expiries.length === 0) {
    return null;
  }

  return expiries.reduce((soonest, candidate) =>
    candidate.ms < soonest.ms ? candidate : soonest,
  ).iso;
}

function prevRefs(prev: ContentAddress | null): readonly ContentAddress[] {
  return prev === null ? [] : [prev];
}

function parseInstantMs(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a replayable instant`);
  }

  return parsed;
}
