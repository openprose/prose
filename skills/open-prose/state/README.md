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

Load this file before every `prose run`, then load exactly one backend spec.
The filesystem backend is the default and the normative reference for source
and run layout.

## Backend Selection

| Situation | Backend Spec | Notes |
|-----------|--------------|-------|
| No explicit backend | `filesystem.md` | Default durable backend |
| User/source/host requests in-context state | `in-context.md` | Ephemeral; no durable run directory guarantee |
| User/source/host requests SQLite | `sqlite.md` | Durable local database; requires `sqlite3` |
| User/source/host requests PostgreSQL | `postgres.md` | Durable networked database; requires configured PostgreSQL |

## Durable Run Envelope

Durable backends create one run directory under `.agents/prose/runs/{id}/`.
Before reporting success, every durable backend writes:

- compiled Forme manifest: generated wiring graph for systems, or a minimal
  service activation record for single services
- `root.prose.md`: snapshot of the invoked source
- `sources/`: snapshots of referenced service, system, and pattern sources

Backend-specific storage begins after that envelope:

| Backend | Events | Data-plane bindings | Notes |
|---------|--------|---------------------|-------|
| Filesystem | `vm.log.md` | `bindings/` copied from `workspace/` | Required default for CI smoke fixtures |
| SQLite | `state.db` tables | `state.db`, with optional `attachments/` | Replaces filesystem `vm.log.md`, `workspace/`, and `bindings/` |
| PostgreSQL | PostgreSQL tables | PostgreSQL rows, with optional `attachments/` | Replaces filesystem `vm.log.md`, `workspace/`, and `bindings/` |

Persistent alternate backends still use the same `.agents/prose/` root,
`*.prose.md` source conventions, run IDs, compiled activation manifests,
`root.prose.md`, and source snapshots; they move execution events and
data-plane bindings into a database. In-context state keeps the same source
conventions but stores run state in conversation history.

## Contents

- `filesystem.md` — file-based state; reads and writes to the local filesystem under a run directory
- `in-context.md` — ephemeral state held in the LLM context window; lost when the session ends
- `sqlite.md` — SQLite-backed persistence; durable local storage with SQL query support
- `postgres.md` — PostgreSQL-backed persistence; durable networked storage for multi-agent and multi-host systems
