---
name: collect-control-scope
kind: service
---

# Collect Control Scope

### Description

Normalizes incoming evidence events and selects controls that need review.

### Requires

- `activation_event`: a scheduled review request, evidence change event,
  responsibility pressure record, audit request, or manual control review
  request

### Ensures

- `control_scope`: controls needing review with owner, framework mapping,
  evidence requirement, current artifact references, prior status, and trigger
  reason
- each control has: control id, owner, framework tags, newest evidence
  timestamp, review due date, and missing-context flags

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - evidence_register: prior control evidence states, accepted artifacts, exceptions, and next review timing
  - latest_evidence_at: newest processed evidence artifact timestamp
writes:
  - latest_evidence_at: advanced when newer evidence events are accepted for review
```

### Shape

- `self`: normalize activation events, deduplicate against project memory, and
  choose controls whose evidence needs review
- `prohibited`: guessing control owners, frameworks, or evidence requirements
  that are not present in the input or register

### Strategies

- when the activation is scheduled: include controls whose next review is due
  or whose evidence expires before the next cadence
- when the activation is an audit request: prioritize requested frameworks,
  control families, and artifacts
- when the activation is pressure without specific controls: select stale,
  missing, or exception-backed evidence from the register
