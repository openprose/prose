---
name: user-memory
kind: service
persist: user
---

requires:
- mode: "teach" (add knowledge), "query" (ask questions), or "reflect" (summarize topic)
- content: what to teach, ask, or reflect on

ensures:
- result: learning confirmation, answer from accumulated knowledge, or reflection with confidence levels and knowledge gaps

errors:
- unknown-mode: mode is not one of teach, query, reflect

Personal knowledge base persisting across all projects. Remembers technical preferences, architectural decisions, coding conventions, lessons learned, and domain knowledge. Uses `persist: user` for durable cross-project persistence.
