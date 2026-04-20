---
name: test-summarizer
kind: test
subject: 02-research-and-summarize
---

### Description

Demonstrates `kind: test` with fixtures and assertions. Tests run the subject program with fixed inputs and evaluate outputs against expectations.

### Fixtures

- `topic`: "recent developments in quantum error correction"

### Expects

- `summary`: contains at least 5 bullet points
- `summary`: mentions specific papers, companies, or research groups
- `summary`: includes practical implications
- `summary`: is under 500 words

### Expects Not

- `__error.md` exists
- `summary`: contains fabricated citations
