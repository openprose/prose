---
name: compliance-evidence-current
kind: responsibility
id: 067NC4KG0HWJNASC5MQ2YC1H68
---

# Compliance Evidence Current

### Goal

Compliance evidence for active controls is current, reviewable, and ready for
an auditor or internal owner before review windows become urgent.

### Continuity

- Evidence for active controls should be reviewed at least weekly during audit
  preparation and at least monthly otherwise.
- Material control changes, failed checks, new policy exceptions, or incoming
  audit requests should trigger evidence review before the next scheduled
  cadence when known.
- Prior evidence decisions should remain available so stale, missing, accepted,
  and exception-backed artifacts are not rediscovered from scratch.

### Criteria

- Each control has a named owner, evidence requirement, current artifact
  reference, freshness status, review status, and known gaps.
- Evidence gaps distinguish missing artifacts, stale artifacts, unclear
  ownership, and policy exceptions.
- The durable register records reviewed controls, evidence fingerprints,
  owner follow-up, exception context, and next review timing.

### Constraints

- Do not treat unverified screenshots, informal chat notes, or expired exports
  as accepted evidence without marking the risk.
- Do not expose sensitive customer, employee, or security details beyond the
  compliance owners who need them.
- Keep follow-up requests narrow enough that control owners can act on them.

### Tools

(none)

### Fulfillment

Prefer the local `evidence-tracker` system.
