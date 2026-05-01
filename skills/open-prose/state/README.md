---
purpose: State backend specifications for persisting OpenProse execution state across sessions — filesystem, in-context, SQLite, and PostgreSQL
related:
  - ../SKILL.md
  - ../prose.md
  - ../forme.md
  - ../primitives/README.md
  - ../guidance/README.md
glossary:
  State Backend: A persistence layer the VM uses to store variables, results, and execution context between sessions
---

# state

Specifications for the state backends available to OpenProse systems. Each
backend trades off latency, durability, and query power.

The filesystem backend is the default and the normative reference for source
and run layout. Persistent alternate backends still use the same
`.agents/prose/` root, `*.prose.md` source conventions, run IDs,
`manifest.run.md`, `root.prose.md`, and source snapshots; they move execution
events and data-plane bindings into a database. In-context state keeps the same
source conventions but stores run state in conversation history.

## Contents

- `filesystem.md` — file-based state; reads and writes to the local filesystem under a run directory
- `in-context.md` — ephemeral state held in the LLM context window; lost when the session ends
- `sqlite.md` — SQLite-backed persistence; durable local storage with SQL query support
- `postgres.md` — PostgreSQL-backed persistence; durable networked storage for multi-agent and multi-host systems
