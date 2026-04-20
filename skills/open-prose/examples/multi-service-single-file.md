---
name: content-pipeline-compact
kind: program
---

### Services

- `review`
- `polish`
- `fact-check`

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

### Ensures

- `final`: polished text incorporating all feedback

## fact-check

### Requires

- `text`: content containing factual claims

### Ensures

- `claims`: each factual claim with verification status (verified, unverified, disputed)
