---
name: assess-risk
kind: function
version: 0.15.0
---

# Assess Risk

### Description

Turns normalized account signals into explainable customer risk assessments.

### Parameters

- `account-signals`: accounts needing review with current signals and prior
  risk context

### Returns

- `risk-assessments`: accounts labeled `low`, `watch`, `high`, or `unknown`
  with evidence, likely cause, confidence, trend, and urgency
- each assessment has: cited signal evidence, missing-context notes, and
  comparison with prior risk state

### Invariants

- A single negative signal cannot produce high risk unless the evidence is
  severe and explicitly explained.
- Unknown risk is an acceptable result when evidence is missing or conflicting.

### Shape

- `self`: weigh account signals and produce calibrated risk assessments
- `prohibited`: inventing customer sentiment, stakeholder intent, or commercial
  details that are not present in the input

### Strategies

- when usage is down but support is quiet: look for renewal timing and owner
  notes before escalating
- when support friction is rising but usage is healthy: mark the likely cause
  separately from adoption risk
