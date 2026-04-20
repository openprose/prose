---
name: content-pipeline-compact
kind: program
---

### Services

- `review`
- `fact-check`
- `polish`

### Description

Demonstrates multiple services in a single file using `##` heading delimiters. Each `##` section defines a separate service with its own contract.

### Requires

- `draft`: a piece of writing to review and polish

### Ensures

- `final`: polished text incorporating editorial feedback with all facts verified

## review

### Requires

- `draft`: a piece of writing to review

### Ensures

- `feedback`: specific, actionable editorial notes

## polish

### Requires

- `draft`: the original text
- `feedback`: editorial notes to incorporate
- `claims`: factual claim verification results to apply

### Ensures

- `final`: polished text incorporating all feedback and resolving or flagging every disputed claim

## fact-check

### Requires

- `draft`: content containing factual claims

### Ensures

- `claims`: each factual claim with verification status (verified, unverified, disputed)
