---
name: vendor-renewals-prepared
kind: responsibility
id: 067NC4KG11RN54TMANB5EP2SB8
---

# Vendor Renewals Prepared

> The canonical multi-slice eval example. A mounted DAG node that maintains a
> standing world-model of every watched vendor's renewal posture, wakes when its
> subscribed inputs move, skips when they don't, calls a function helper to score
> each vendor, and reads its prior truth by reference rather than re-deriving it.

### Goal

Every upcoming vendor renewal is reviewed early enough that its owner can renew,
renegotiate, replace, or cancel with clear evidence before the contractual
window closes.

### Requires

Subscription contracts — Forme matches each entry to a producing node's
`### Maintains` facet (`Requires.<facet> ↔ Maintains.<facet>`), and run time
follows the resolved input-fingerprint tuple.

- `renewal_signals`: the current normalized view of which vendors are inside a
  renewal, cancellation-notice, or price-change window — with contract timing,
  owner, spend trend, usage trend, criticality, and the trigger that surfaced
  each vendor. *(Maintained by `collect-renewal-signals`.)*

This is the only subscribed input: `vendor-renewals-prepared` is **input-driven**
off the signal collector, plus a **self-driven** recheck cadence (below) so a
renewal window lapsing wakes the node even when no upstream signal arrives.

### Maintains

The world-model schema — the *shape* of the standing truth this node commits,
its canonicalization spec, its subscribable facets, and its postconditions. The
materialized truth is the world-model the render writes; this block declares it.

The maintained truth is a **vendor renewal ledger**: a map keyed by `vendor_id`,
each entry carrying the vendor's current renewal posture plus its decision
history and watermark state.

**Type** — each vendor entry has:

- `vendor_id`, `vendor_name`, `owner`
- `recommendation`: one of `renew`, `renegotiate`, `replace`, `cancel`, or
  `needs-owner-review`
- `confidence`, `risk`, `urgency`
- `renewal_date`, `notice_deadline`
- `evidence`: the cited signals the recommendation rests on
- `valid_until`: when this posture must be re-corroborated (freshness *state*)
- `decision_history`: an append-only list of `{ at, recommendation, reason }`
  — the durable record of how this vendor's posture has moved over time
- `latest_signal_at`: the newest signal timestamp folded into this entry
  (watermark state — used by the canonicalizer's material/immaterial split)

**Canonicalization spec** (what equality means for the fingerprint):

- **Material**: `recommendation`, `risk`, `urgency`, `renewal_date`,
  `notice_deadline`, `valid_until` (a lapsing `valid_until` is a *real* change
  that flips posture freshness), and the *latest* `decision_history` entry's
  `recommendation`.
- **Immaterial** (excluded from the fingerprint): `latest_signal_at` and any
  `fetched_at`/request-id timestamps — these advance on every poll and must not
  masquerade as surprise; the rendered-prose `evidence` summary is a *derived
  projection* fingerprinted only through its structured `evidence` backing, never
  as free text.
- Vendor entries are ordered by `vendor_id` before hashing so map-ordering noise
  is not a change.

**Facets** (named, independently-subscribable parts of this truth):

- `recommendation` — the decision posture per vendor. A downstream brief writer
  wakes on this and *not* on history churn.
- `history` — the decision-history ledger. An audit/analytics consumer wakes
  here when a new decision is appended, even if the live recommendation is
  unchanged.
- `ownership` — owner + handoff timing. An owner-routing consumer wakes only when
  the responsible owner changes.

A downstream subscribes to the facet it cares about; a move in `history` does not
wake a `recommendation`-only subscriber. (`@atomic` remains the whole-truth
fingerprint and the free default.)

**Postconditions** (self-policed by the render before it signs — no separate
judge beat):

- Every vendor entry names a concrete `renewal_date` or `notice_deadline`, an
  `owner`, and a `recommendation` drawn from the closed set above.
- A `cancel` or `replace` recommendation on a business-critical vendor names the
  operational risk and migration uncertainty in `risk`.
- Low-confidence evidence yields `needs-owner-review`, never a forced decision.
- `decision_history` is append-only: a render may add an entry but must never
  drop or rewrite a prior one.

### Continuity

The wake-source policy — what may wake this node.

- **input-driven** (default): a new `collect-renewal-signals` receipt whose
  `renewal_signals` fingerprint differs from the one last consumed.
- **self-driven**: re-examine when the soonest vendor `valid_until` in the
  world-model has lapsed, and at least every 24h, so a renewal or notice window
  silently passing flips the affected vendor's facet fingerprint and propagates
  as surprise. The cadence *rule* lives here; the expiry *data* lives in the
  world-model (`valid_until`).

This node is **not** external-driven; the external trigger is owned by the
`renewal-review-events` gateway, which maintains the incoming-event truth that
`collect-renewal-signals` subscribes to.

### Execution

Read this node's prior world-model **by reference** (do not pre-stuff it into
context), fold in the moved `renewal_signals`, then for each vendor needing a
fresh posture:

```prosescript
let prior = read_world_model("self")          # prior vendor ledger, by reference
let signals = input("renewal_signals")        # the moved subscription truth

let assessments = []
for vendor in signals.vendors:
  let prior_entry = prior.vendors[vendor.vendor_id]
  # function helper — a called render, not a subscribed node
  let scored = call score-vendor-renewal with {
    vendor: vendor,
    prior_entry: prior_entry,
  }
  append assessments scored

# write the next world-model: carry history forward, append on change, advance
# the watermark, then sign the receipt. Skips are decided by the reconciler
# comparing fingerprints — never here.
write_world_model build_ledger(prior, assessments)
```

The render writes the structured ledger and self-polices its `### Maintains`
postconditions before signing. It never decides "did this change" — that is the
reconciler's fingerprint comparison.

### Invariants

- Recommendations are tied to current evidence and contract timing.
- Critical vendors are flagged before any risky cancellation or replacement.
- Decision history is preserved so a recurring vendor is compared against its
  earlier commitments and outcomes.

### Shape

- `self`: weigh renewal timing, cost movement, usage value, criticality,
  alternatives, and owner sentiment; carry continuity forward.
- `prohibited`: inventing contract rights, pricing, usage, alternatives, or
  stakeholder preferences absent from the input or prior world-model; sending
  vendor communication; approving spend; mutating contract state.

### Runtime

- `persist`: project
