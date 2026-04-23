---
name: reviewer
kind: service
---

### Description

Evaluate a piece of writing against quality criteria and return a structured verdict.

### Metadata

- `version`: 0.1.0

### Requires

- output: the article to review
- criteria: quality standards to evaluate against (optional — uses editorial best practices if not provided)

### Ensures

- verdict: "accept" or "reject"
- reasoning: why the verdict was reached
- suggestions: specific, actionable improvements (empty list if accepted)

### Strategies

- evaluate clarity, specificity, and audience fit
- flag vague claims, missing examples, or unsupported assertions
- accept if the article is publishable as-is; reject if substantive improvements are needed
