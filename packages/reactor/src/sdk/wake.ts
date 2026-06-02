// The wake constructors — the three blessed builders for the one wake event
// type with three sources (world-model.md §5: "One event type, three sources";
// architecture.md §6.1 `wake`). A `Wake` is `{ source, refs }` where `refs` are
// the content addresses of the upstream receipt(s) (`input`), or of the
// synthetic self/external receipt (`self` / `external`).
//
// These exist so the SDK + its consumers stop re-deriving the same
// `{ source: "...", refs: [...] }` literal by hand at every ingress / drive /
// continuity-fire site (the firehose re-built it 3×). Each constructor freezes
// its `refs` so a wake is never mutated after it is handed to the reconciler.

import type { ContentAddress, Wake } from "../shapes";

function frozenWake(
  source: Wake["source"],
  refs: readonly ContentAddress[],
): Wake {
  return Object.freeze({ source, refs: Object.freeze([...refs]) });
}

/**
 * An `input` wake — the default: an upstream node's receipt(s) moved a consumed
 * facet, so a subscriber should re-reconcile. `refs` are the content addresses
 * of the waking upstream receipt(s); pass none for the cold-start / synthetic
 * case.
 */
export function inputWake(...refs: readonly ContentAddress[]): Wake {
  return frozenWake("input", refs);
}

/**
 * A `self` wake — the node's own continuity clock fired (a synthetic
 * self-receipt; world-model.md §5). `refs` are the content addresses of the
 * synthetic self-receipt(s) when known; typically empty.
 */
export function selfWake(...refs: readonly ContentAddress[]): Wake {
  return frozenWake("self", refs);
}

/**
 * An `external` wake — a gateway turned a webhook / cron / manual trigger into
 * an edge receipt (world-model.md §5). `refs` are the content addresses of the
 * synthetic external receipt(s) when known; typically empty for a bare trigger.
 */
export function externalWake(...refs: readonly ContentAddress[]): Wake {
  return frozenWake("external", refs);
}
