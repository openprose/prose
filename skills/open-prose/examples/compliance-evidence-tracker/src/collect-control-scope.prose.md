---
name: collect-control-scope
kind: function
---

# Collect Control Scope

### Description

Normalizes incoming evidence events and selects controls that need review.

### Parameters

- `evidence-signals`: a scheduled review request, evidence change event, audit
  request, or manual control review request
- `prior-controls`: prior control evidence states, accepted artifacts,
  exceptions, and next review timing read from the responsibility's world-model

### Returns

- `control-scope`: controls needing review with owner, framework mapping,
  evidence requirement, current artifact references, prior status, and trigger
  reason
- each control has: control id, owner, framework tags, newest evidence
  timestamp, review due date, and missing-context flags

### Shape

- `self`: normalize activation events, deduplicate against the prior control
  truth, and choose controls whose evidence needs review
- `prohibited`: guessing control owners, frameworks, or evidence requirements
  that are not present in the input or prior truth

### Strategies

- when the activation is scheduled: include controls whose next review is due
  or whose evidence expires before the next cadence
- when the activation is an audit request: prioritize requested frameworks,
  control families, and artifacts
- when the activation is pressure without specific controls: select stale,
  missing, or exception-backed evidence from the prior truth
