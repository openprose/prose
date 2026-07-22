---
name: smoke-inline-functions
kind: responsibility
version: 0.15.0
---

### Description

Verifies `##` headings define inline functions in a multi-node file.

### Requires

- `draft`: a short draft supplied by the caller

### Maintains

- `final`: polished output containing the exact phrase `inline-functions-smoke-pass`

### Continuity

- input-driven

### Shape

- `self`: sequence the review and publish steps
- `delegates`:
  - `reviewer`: editorial feedback
  - `publisher`: final polish

## reviewer

### Parameters

- `draft`: source text to review

### Returns

- `feedback`: concise editorial feedback naming one strength and one improvement

## publisher

### Parameters

- `draft`: source text to polish
- `feedback`: editorial feedback to apply

### Returns

- `final`: polished output containing the exact phrase `inline-functions-smoke-pass`
