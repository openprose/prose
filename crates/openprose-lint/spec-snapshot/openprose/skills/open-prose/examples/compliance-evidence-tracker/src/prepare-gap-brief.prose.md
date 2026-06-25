---
name: prepare-gap-brief
kind: function
version: 0.15.0
---

# Prepare Gap Brief

### Description

Turns evidence assessments into a concise compliance-owner brief.

### Parameters

- `evidence-assessments`: controls labeled with readiness status, evidence,
  freshness, confidence, gap reason, and sensitivity notes

### Returns

- `evidence-brief`: reviewed controls with status, evidence references, owner
  follow-up, severity, due date, and audit-ready notes
- owner follow-up requests are grouped by control owner and avoid exposing
  sensitive details beyond need-to-know context

### Invariants

- Every gap has a concrete requested action and owner.
- Accepted evidence remains traceable to source references and review notes.
- The brief separates audit-facing evidence from internal remediation notes.

### Shape

- `self`: prioritize evidence gaps, write owner-ready follow-up, and summarize
  accepted evidence for compliance review
- `prohibited`: sending broad reminders that omit control id, artifact need,
  due date, or reason

### Strategies

- when many gaps exist: group by owner and severity so the next action is clear
- when evidence is accepted with low confidence: include a reviewer note rather
  than hiding the uncertainty
- when a gap is blocked: name the blocker and escalation path
