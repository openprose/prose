---
name: content-pipeline
kind: program
---

### Services

- `review`
- `fact-check`
- `polish`

### Requires

- `draft`: string - a piece of writing to review and polish

### Ensures

- `final`: Markdown<PolishedDraft> - polished text with feedback and fact checks applied

## review

### Requires

- `draft`: string - a piece of writing to review

### Ensures

- `feedback`: Markdown<EditorialFeedback> - specific, actionable editorial notes

## fact-check

### Requires

- `draft`: string - content containing factual claims

### Ensures

- `claims`: ClaimCheck[] - each factual claim with verification status

## polish

### Requires

- `draft`: string - the original text
- `feedback`: Markdown<EditorialFeedback> - editorial notes to incorporate
- `claims`: ClaimCheck[] - factual claim verification results to apply

### Ensures

- `final`: Markdown<PolishedDraft> - polished text incorporating all feedback

