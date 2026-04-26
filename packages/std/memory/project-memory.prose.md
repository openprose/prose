---
name: project-memory
kind: service
---

### Requires

- `mode`: string - "ingest" (learn from content), "query" (answer questions), "update" (record decisions), or "summarize" (overview)
- `content`: Markdown<Content> - what to ingest, ask, record, or summarize

### Ensures

- `result`: Markdown<Result> - ingestion confirmation, answer from project knowledge, update acknowledgment, or project summary depending on mode

### Runtime

- `persist`: project

### Effects

- `writes_memory`: reads or writes scoped memory state

### Errors

- unknown-mode: mode is not one of ingest, query, update, summarize

This project's institutional memory. Knows architecture, design decisions (and WHY), key files, patterns, history, known issues, and team decisions. Uses `persist: project` for durable project-scoped knowledge.
