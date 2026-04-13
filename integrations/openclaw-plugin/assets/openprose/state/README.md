---
purpose: State backend specifications for persisting OpenProse execution state across sessions — filesystem, in-context, SQLite, and PostgreSQL
related:
  - ../README.md
  - ../primitives/README.md
  - ../guidance/README.md
  - ../../../../../platform/api-v2/README.md
glossary:
  State Backend: A persistence layer the VM uses to store variables, results, and execution context between sessions
---

# state

Specifications for the state backends available to .prose programs. Each backend trades off latency, durability, and query power.

## Contents

- `filesystem.md` — file-based state; reads and writes to the local filesystem under a session directory
- `in-context.md` — ephemeral state held in the LLM context window; lost when the session ends
- `sqlite.md` — SQLite-backed persistence; durable local storage with SQL query support
- `postgres.md` — PostgreSQL-backed persistence; durable remote storage for multi-agent and multi-host programs
