---
name: project-memory
kind: function
---

### Runtime

- `persist`: project

### Parameters

- mode: "ingest" (learn from content), "query" (answer questions), "update" (record decisions), or "summarize" (overview)
- content: what to ingest, ask, record, or summarize

### Returns

- result: depending on mode, the returned value is an ingestion confirmation, an answer drawn from project knowledge, an update acknowledgment, or a project summary

### Errors

- unknown-mode: mode is not one of ingest, query, update, summarize

This project's institutional memory. Knows architecture, design decisions (and WHY), key files, patterns, history, known issues, and team decisions. Uses `persist: project` for durable project-scoped knowledge.
