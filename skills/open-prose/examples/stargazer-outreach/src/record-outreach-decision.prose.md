---
name: record-outreach-decision
kind: service
---

# Record Outreach Decision

### Description

Writes the reviewed batch back to durable project state.

### Requires

- `outreach_batch`: reviewed stargazers with qualification, evidence, and
  human-ready outreach drafts where appropriate

### Ensures

- `ledger_update`: durable record of reviewed stargazers, latest evidence,
  status, draft summary, and duplicate-contact safeguards

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - outreach_ledger: existing reviewed stargazers and contact history
writes:
  - outreach_ledger: merged reviewed batch with status, evidence, and safety notes
  - last_reviewed_at: timestamp of the latest completed review batch
```

### Shape

- `self`: update durable project memory and summarize what changed
- `prohibited`: deleting historical contact safety notes or recording that
  outreach was sent without explicit evidence

### Strategies

- when a lead already exists: append new evidence and preserve previous contact
  decisions
- when a draft is human-approved outside this system: require the approval event
  in activation context before changing contact state
