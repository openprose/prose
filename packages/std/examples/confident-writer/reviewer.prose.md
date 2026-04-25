---
name: reviewer
kind: service
---

### Description

Evaluate a piece of writing against quality criteria and return a structured verdict.

### Metadata

- `version`: 0.1.0

### Requires

- `output`: Markdown<Output> - the article to review

### Ensures

- `verdict`: Markdown<Verdict> - "accept" or "reject"
- `reasoning`: Markdown<Reasoning> - why the verdict was reached
- `suggestions`: Markdown<Suggestions> - specific, actionable improvements (empty list if accepted)


### Effects

- `pure`: deterministic transformation over declared inputs

### Strategies

- evaluate clarity, specificity, and audience fit
- flag vague claims, missing examples, or unsupported assertions
- accept if the article is publishable as-is; reject if substantive improvements are needed
