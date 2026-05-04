---
name: prepare-renewal-brief
kind: service
---

# Prepare Renewal Brief

### Description

Creates concise renewal briefs for vendor owners and procurement partners.

### Requires

- `renewal_assessments`: vendors labeled with renewal recommendation, evidence,
  confidence, risk, and urgency

### Ensures

- `renewal_brief`: vendor-owner-ready briefs with recommended decision,
  contract timing, evidence summary, risks, alternatives, owner handoff, and
  next action
- each brief has: a concrete deadline, confidence note, missing-context list,
  and decision rationale suitable for human review

### Invariants

- Briefs are actionable without pretending a human decision has already been
  made.
- Vendor-facing language avoids unsupported claims and negotiation bluffs.

### Shape

- `self`: convert assessments into practical procurement and owner guidance
- `prohibited`: sending vendor communication, approving spend, or changing
  contract state

### Strategies

- when urgency is high and confidence is low: recommend an owner confirmation
  step before a commercial action
- when alternatives are unclear: state the uncertainty rather than inventing a
  replacement path
