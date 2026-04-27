---
name: human-gate
kind: service
---

### Shape

- `self`:
  - present output for human review
  - block until approved or rejected
- `delegates`: none
- `prohibited`:
  - modifying the content
  - approving on behalf of the human
  - proceeding without explicit approval when gate_level requires it

### Requires

- `content`: Markdown<Content> - the output to review
- `gate_level`: string - one of "all", "external", "none"
- `review_channel`: string - where to present the review request — e.g. Slack channel ID or email address

### Ensures

- `approved`: boolean - boolean — true if the reviewer approved, or if gate_level is "none" (auto-approved without review)
- `feedback`: Markdown<Feedback> - (optional) structured edits from the reviewer, suitable for `apply(content, feedback)` — present only when the reviewer provides modifications
- if gate_level is "none": approved is true immediately with no human review and no feedback

### Errors

- reviewer-timeout: the reviewer did not respond within the configured review window
- channel-unreachable: the review channel could not be contacted (invalid channel, permissions issue, or service unavailable)

### Effects

- `human_gate`: requires explicit human approval before continuing

### Strategies

- content substance is preserved unless feedback explicitly modifies it
- when gate_level is "all" or "external", a human must have explicitly approved before approved is true

- when gate_level is "all": post every output for review, block until the reviewer responds
- when gate_level is "external": only review content that will be sent outside the org (outreach emails, reports to customers)
- when gate_level is "none": skip review entirely — return approved: true with no feedback
