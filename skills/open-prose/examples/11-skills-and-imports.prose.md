---
name: skills-and-imports-demo
kind: system
---

### Services

- `std/roles/researcher`
- `std/roles/summarizer`

### Description

Demonstrates how systems import installed dependency services. Dependency
references become entries in `### Services`.

### Requires

- `topic`: a research question (default: "recent developments in renewable energy storage")
- `preserve`: important facts, tradeoffs, and source notes to keep in the summary

### Ensures

- `summary`: a technical summary incorporating research findings
