---
name: collect-renewal-signals
kind: responsibility
id: 067NC4KG11RN54TMANB5EP2SB9
---

# Collect Renewal Signals

> A second mounted node — the *source-normalizing* responsibility. It subscribes
> to the gateway's incoming-event truth, maintains a normalized `renewal_signals`
> truth, and carries a **watermark** in its world-model so a re-delivery of an
> already-processed event leaves the fingerprint unmoved and the downstream skips.

### Goal

The set of vendors that currently need renewal review is kept normalized and
deduplicated, so the assessor wakes on genuinely new signals and not on event
re-deliveries.

### Requires

- `renewal_events`: the latest external renewal-review event — a scheduled scan,
  contract-window change, spend update, usage change, or manual vendor-review
  request. *(Maintained by the `renewal-review-events` gateway.)*

### Maintains

The world-model schema for the normalized signal set, with the watermark folded
in as durable state (no separate `### Memory` ledger — the watermark *is* part of
this node's world-model).

**Type** — the truth is `{ vendors: VendorSignal[], watermark }`:

- each `VendorSignal`: `vendor_id`, `vendor_name`, `owner`, `renewal_date` or
  `notice_deadline`, `spend_trend`, `usage_trend`, `criticality`,
  `newest_evidence_at`, `trigger_reason`, and `missing_context` flags.
- `watermark.latest_signal_at`: the newest event timestamp already folded in —
  the high-water mark used to deduplicate re-deliveries.

**Canonicalization spec**:

- **Material**: the per-vendor renewal-relevant fields (`renewal_date`,
  `notice_deadline`, `spend_trend`, `usage_trend`, `criticality`, `owner`) and
  the *set* of `vendor_id`s under review.
- **Immaterial** (excluded from the fingerprint): `watermark.latest_signal_at`,
  `newest_evidence_at`, and `trigger_reason`. **This is the load-bearing skip
  control**: when the gateway re-delivers an event already at or below the
  watermark, the normalized vendor set is unchanged, so the fingerprint does not
  move, so `vendor-renewals-prepared` writes a `skipped` receipt and spawns
  nothing — *cost scales with surprise, not with the clock*.
- Vendors are ordered by `vendor_id` before hashing.

**Facets**: none declared — this is effectively a single-truth node, so its
`@atomic` world-model is the implicit `renewal_signals` facet that
`vendor-renewals-prepared` subscribes to.

**Postconditions**:

- Every emitted vendor names a `vendor_id` and at least one of `renewal_date` /
  `notice_deadline`.
- The watermark is monotonic: a render never moves `latest_signal_at` backward.
- No vendor is invented: every entry traces to a field present in the incoming
  event or the prior world-model.

### Continuity

- **input-driven**: a new `renewal-review-events` gateway receipt.

The watermark in the world-model means a re-delivered or stale event still wakes
*this* node (the gateway fingerprint moved), but produces an **unmoved**
`renewal_signals` fingerprint — so the wake stops here and never reaches the
assessor. This is the fingerprint-driven skip demonstrated at a node boundary.

### Execution

```prosescript
let prior = read_world_model("self")
let event = input("renewal_events")

let fresh = filter event.items where item.at > prior.watermark.latest_signal_at
let vendors = normalize_and_dedupe(fresh, prior.vendors)
let watermark = max(prior.watermark.latest_signal_at, newest_at(fresh))

write_world_model { vendors: vendors, watermark: { latest_signal_at: watermark } }
```

### Shape

- `self`: normalize incoming events, deduplicate against the prior world-model
  and watermark, and select vendors whose renewal windows or signals changed.
- `prohibited`: guessing unavailable contract terms, private usage, or vendor
  performance details.

### Runtime

- `persist`: project
