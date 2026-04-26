---
name: user-memory
kind: service
---

### Requires

- `mode`: string - "teach" (add knowledge), "query" (ask questions), or "reflect" (summarize topic)
- `content`: Markdown<Content> - what to teach, ask, or reflect on

### Ensures

- `result`: Markdown<Result> - learning confirmation, answer from accumulated knowledge, or reflection with confidence levels and knowledge gaps

### Runtime

- `persist`: user

### Effects

- `writes_memory`: reads or writes scoped memory state

### Errors

- unknown-mode: mode is not one of teach, query, reflect

Personal knowledge base persisting across all projects. Remembers technical preferences, architectural decisions, coding conventions, lessons learned, and domain knowledge. Uses `persist: user` for durable cross-project persistence.
