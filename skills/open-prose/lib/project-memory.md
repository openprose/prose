---
name: project-memory
kind: service
persist: project
---

requires:
- mode: "ingest" (learn from content), "query" (answer questions), "update" (record decisions), or "summarize" (overview)
- content: what to ingest, ask, record, or summarize

ensures:
- result: ingestion confirmation, answer from project knowledge, update acknowledgment, or project summary depending on mode

errors:
- unknown-mode: mode is not one of ingest, query, update, summarize

This project's institutional memory. Knows architecture, design decisions (and WHY), key files, patterns, history, known issues, and team decisions. Uses `persist: project` for durable project-scoped knowledge.
