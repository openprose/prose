---
name: test-summarizer
kind: test
subject: 02-research-and-summarize
---

Demonstrates `kind: test` with fixtures and assertions. Tests run the subject program with fixed inputs and evaluate outputs against expectations.

fixtures:
- topic: "recent developments in quantum error correction"

expects:
- summary: contains at least 5 bullet points
- summary: mentions specific papers, companies, or research groups
- summary: includes practical implications
- summary: is under 500 words

expects-not:
- __error.md exists
- summary: contains fabricated citations
