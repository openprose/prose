---
name: recommend-actions
kind: function
version: 0.15.0
---

# Recommend Actions

### Description

Creates concise account-owner briefs from risk assessments.

### Parameters

- `risk-assessments`: explainable customer risk assessments with evidence,
  confidence, trend, and urgency

### Returns

- `risk-brief`: account-owner-ready briefs with risk level, evidence summary,
  likely cause, recommended next action, owner handoff, and follow-up timing
- each brief has: a practical action, a customer-safe explanation, and a
  confidence note

### Invariants

- Recommendations are specific enough for the account owner to act on.
- Customer-facing language avoids blame and unsupported claims.

### Shape

- `self`: convert risk assessments into practical account owner guidance
- `prohibited`: sending customer communication or promising outcomes

### Strategies

- when risk is high and confidence is low: recommend a discovery action before
  a corrective action
- when the likely cause is support friction: prefer service recovery steps over
  generic executive outreach
