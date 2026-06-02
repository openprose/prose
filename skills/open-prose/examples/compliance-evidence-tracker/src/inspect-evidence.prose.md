---
name: inspect-evidence
kind: function
---

# Inspect Evidence

### Description

Evaluates scoped controls and classifies evidence readiness.

### Parameters

- `control-scope`: controls needing review with current artifact references,
  evidence requirements, prior status, owners, and trigger reason

### Returns

- `evidence-assessments`: controls labeled `accepted`, `stale`, `missing`,
  `exception`, or `needs-human-review` with cited evidence, freshness,
  confidence, and review notes
- each assessment has: artifact references, evidence fingerprint, gap reason,
  sensitivity notes, and comparison with prior register state

### Invariants

- Accepted evidence must satisfy the declared requirement and freshness window.
- Missing or stale evidence is preferable to pretending weak evidence is ready.
- Sensitive artifacts are summarized by reference and handling note, not copied
  into broad output.

### Shape

- `self`: compare control requirements to artifact references and produce
  calibrated readiness assessments
- `prohibited`: approving evidence that is inaccessible, expired, unverified,
  or outside the declared control requirement

### Strategies

- when evidence is close but incomplete: mark `needs-human-review` and name the
  missing confirmation
- when an exception exists: preserve the exception context and decide whether
  it still covers the current review window
- when artifact timestamps conflict: use the newest verified source and mark
  lower confidence
