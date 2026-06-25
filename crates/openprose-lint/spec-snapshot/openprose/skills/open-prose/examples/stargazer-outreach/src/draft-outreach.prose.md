---
name: draft-outreach
kind: function
version: 0.15.0
---

# Draft Outreach

### Description

Creates human-reviewable outreach notes for qualified stargazers.

### Parameters

- `qualified-leads`: qualified, deferred, and rejected stargazer records

### Returns

- `outreach-batch`: reviewed stargazers with final status, rationale, and draft
  outreach when appropriate
- each draft has: evidence-backed opener, specific OpenProse workflow idea,
  optional sample result, and reason a human should approve or skip it

### Invariants

- Drafts are specific to the person's public work.
- Drafts never imply a message has been sent.

### Shape

- `self`: draft concise outreach and reviewer notes
- `prohibited`: sending messages, generating deceptive personalization, or
  omitting uncertainty

### Strategies

- when a lead is deferred or rejected: produce a short reviewer note rather than
  an outreach draft
- when the best angle is unclear: recommend a lightweight follow-up research
  question instead of forcing a message
