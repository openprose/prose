---
name: prepare-renewal-brief
kind: responsibility
id: 067NC4KG11RN54TMANB5EP2SBA
---

# Prepare Renewal Brief

> A downstream mounted node that subscribes to a single **facet** of the
> assessor's truth — `recommendation` — so it wakes when a vendor's posture moves
> and **not** when only the decision-history ledger churns. This is the facet
> selector (`world-model.md` §3): atomic-only would wake the brief writer on every
> history append; a facet subscription wakes it exactly when the decision moved.

### Goal

Each vendor with a current renewal posture has an owner-ready brief reflecting
that posture, contract timing, evidence, risks, alternatives, and next action.

### Requires

- `vendor_recommendations`: the per-vendor renewal posture (recommendation,
  confidence, risk, urgency, evidence, contract timing).
  *(Maintained by `vendor-renewals-prepared`, facet `recommendation`.)*

By naming the `recommendation` facet specifically, Forme wires
`Requires.vendor_recommendations ↔ vendor-renewals-prepared.Maintains.recommendation`,
and this node never wakes on `history` or `ownership` moves.

### Maintains

The world-model schema for the standing set of renewal briefs.

**Type** — `{ briefs: { [vendor_id]: RenewalBrief } }` where each `RenewalBrief`
has: recommended decision, contract timing, evidence summary, risks,
alternatives, owner handoff, next action, a concrete deadline, a confidence note,
a missing-context list, and decision rationale suitable for human review.

**Canonicalization spec**: the recommended decision, deadline, and risk are
material; the rendered prose summary is a derived projection fingerprinted only
through its structured backing. Briefs ordered by `vendor_id`.

**Postconditions**:

- A brief is actionable without pretending a human decision is already made.
- Vendor-facing language carries no unsupported claims or negotiation bluffs.
- Every brief names a concrete deadline and a confidence note.

### Continuity

- **input-driven**: a new `vendor-renewals-prepared` receipt whose
  `recommendation` facet fingerprint moved.

### Execution

```prosescript
let recs = input("vendor_recommendations")
let briefs = {}
for vendor in recs.vendors:
  briefs[vendor.vendor_id] = draft_brief(vendor)
write_world_model { briefs: briefs }
```

### Shape

- `self`: convert per-vendor postures into practical procurement and owner
  guidance.
- `prohibited`: sending vendor communication, approving spend, or changing
  contract state.

### Strategies

- when urgency is high and confidence is low: recommend an owner confirmation
  step before a commercial action.
- when alternatives are unclear: state the uncertainty rather than inventing a
  replacement path.

### Runtime

- `persist`: project
