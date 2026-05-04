---
name: update-evidence-register
kind: service
---

# Update Evidence Register

### Description

Records reviewed controls and carries forward evidence continuity state.

### Requires

- `evidence_assessments`: controls labeled with readiness status, evidence,
  freshness, confidence, gap reason, and sensitivity notes
- `evidence_brief`: reviewed controls with owner follow-up, severity, due
  date, audit-ready notes, and accepted evidence references

### Ensures

- `register_update`: durable evidence register entries for reviewed controls,
  including current status, evidence fingerprint, owner follow-up, exception
  context, and next review timing

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - evidence_register: prior evidence states, artifact fingerprints, exceptions, and owner follow-up
writes:
  - evidence_register: updated control evidence states, artifact fingerprints, exceptions, owner follow-up, and next review timing
```

### Shape

- `self`: write durable continuity records from declared assessments and briefs
- `prohibited`: discarding prior acceptance, exception, or gap history without
  explanation

### Strategies

- when a control remains missing or stale: preserve prior evidence and append
  the newest reason for continued gap status
- when evidence becomes accepted: record the acceptance reason, reviewer note,
  fingerprint, and next review window
- when an exception is active: record the exception owner and expiry separately
  from accepted evidence
