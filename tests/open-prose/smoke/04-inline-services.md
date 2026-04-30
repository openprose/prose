---
name: smoke-inline-services
kind: program
---

### Services

- `reviewer`
- `publisher`

### Description

Verifies `##` headings define inline components in a multi-service file.

### Requires

- `draft`: a short draft supplied by the smoke runner

### Ensures

- `final`: polished output containing the exact phrase `inline-services-smoke-pass`

## reviewer

### Requires

- `draft`: source text to review

### Ensures

- `feedback`: concise editorial feedback naming one strength and one improvement

## publisher

### Requires

- `draft`: source text to polish
- `feedback`: editorial feedback to apply

### Ensures

- `final`: polished output containing the exact phrase `inline-services-smoke-pass`
