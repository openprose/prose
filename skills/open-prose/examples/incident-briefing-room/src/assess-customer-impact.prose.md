---
name: assess-customer-impact
kind: service
---

# Assess Customer Impact

### Shape

- `self`: classify impact evidence and separate known customer effects from internal risk
- `prohibited`: declaring customer impact without a source or making remediation promises

### Requires

- `signal_summary`: normalized facts, timestamps, sources, contradictions, and gaps

### Ensures

- `impact_assessment`: severity, affected surfaces, confidence, and customer-safe wording
- `open_impact_questions`: missing evidence needed to clarify scope or severity

### Strategies

- When evidence conflicts, report the conflict and lower confidence.
- Prefer narrow affected-surface language over broad outage language unless broad impact is proven.

