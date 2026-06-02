---
purpose: State backend specifications for persisting OpenProse execution state across sessions — filesystem, in-context, SQLite, and PostgreSQL
related:
  - ../SKILL.md
  - ../prose.md
  - ../forme.md
  - ../primitives/README.md
  - ../guidance/README.md
glossary:
  State Backend: A persistence layer the VM uses to store the append-only receipt ledger and the canonical per-node world-model across sessions
  Canonical World-Model: The single content-addressable artifact (a directory by default) holding a node's maintained truth; deterministically serialized and fingerprinted on commit; the source of record
  Derived Projection: A SQL/vector/dashboard index built FROM the canonical world-model for query; rebuildable, never the truth
---

# state

Specifications for the state backends available to OpenProse systems. Each
backend trades off latency, durability, and query power.

Load this file before every `prose run`, then load exactly one backend spec.
The filesystem backend is the default and the normative reference for source
and run layout.

All durable backend paths are relative to `<openprose-root>`. Native
repositories use the repository root, attached repositories use
`repo/.agents/prose`, and user-global work uses `~/.agents/prose`.

## Backend Selection

| Situation | Backend Spec | Notes |
|-----------|--------------|-------|
| No explicit backend | `filesystem.md` | Default durable backend |
| User/source/host requests in-context state | `in-context.md` | Ephemeral; no durable run directory guarantee |
| User/source/host requests SQLite | `sqlite.md` | Durable local database; requires `sqlite3` |
| User/source/host requests PostgreSQL | `postgres.md` | Durable networked database; requires configured PostgreSQL |

## The truth is canonical; everything else is a projection

The load-bearing invariant for every backend (`world-model.md` §1): the
**canonical world-model is a single content-addressable artifact** — by default a
directory of files — that is deterministically serialized and fingerprinted on
commit. SQLite tables, PostgreSQL rows, vector indices, and dashboards are
**derived projections** of that canonical truth, never the truth itself. A render
may *query a projection by reference* (e.g. a SQL index over a million-row truth),
but the canonical artifact remains the source of record, and the fingerprint is
always computed over the canonical serialization — never over a projection.

A backend is therefore two layers:

1. **Canonical store** — holds the per-node world-model artifact, produces a
   deterministic canonical serialization (stable file ordering, path/encoding
   normalization), and content-addresses each committed version. This is what gets
   fingerprinted.
2. **Derived projections (optional)** — query/retrieval indices the backend
   maintains *from* the canonical truth for fast lookup. Rebuildable at any time
   from the canonical artifact; never canonical themselves.

## Durable Run Envelope

Durable backends create one receipt directory under `<openprose-root>/runs/{id}/`.
Before reporting success, every durable backend writes:

- compiled intent: the topology world-model (nodes/edges/wake-sources) +
  per-node canonicalizers + postcondition validators, or a minimal `function`
  activation record for single-call runs
- `root.prose.md`: snapshot of the invoked source
- `sources/`: snapshots of referenced source files

Backend-specific storage begins after that envelope:

| Backend | Ledger (receipts) | Canonical world-model | Derived projections |
|---------|-------------------|-----------------------|---------------------|
| Filesystem | `vm.log.md` + `receipts/` | `world-model/{node}/` directory (deterministically serialized, content-addressed) | none by default; an optional index is rebuildable |
| SQLite | `state.db` receipt-ledger tables | canonical artifact blobs keyed by `ContentAddress`, with version chain | SQL tables for query (a *projection*, not the truth) |
| PostgreSQL | PostgreSQL receipt-ledger tables | canonical artifact objects keyed by `ContentAddress`, with version chain | SQL rows + optional vector index for query (projections, not the truth) |

Persistent alternate backends still use the same `<openprose-root>`,
`*.prose.md` source conventions, run IDs, compiled intent, `root.prose.md`,
source snapshots, and `state/` durable cross-run namespace; they keep the
**append-only receipt ledger** and the **canonical world-model versioning**, and
add their SQL/vector indices as *derived projections*. In-context state keeps the
same conventions but holds the canonical world-model and ledger in conversation
history — still canonical, just ephemeral.

## Contents

- `filesystem.md` — file-based state; the **normative reference** for the canonical world-model artifact layout, deterministic serialization, and the receipt ledger
- `in-context.md` — ephemeral state held in the LLM context window; canonical world-model + ledger live in conversation history, lost when the session ends
- `sqlite.md` — SQLite-backed persistence; receipt ledger + content-addressed world-model versioning, with SQL as a derived query projection
- `postgres.md` — PostgreSQL-backed persistence; the same ledger + world-model versioning for multi-agent and multi-host systems, with SQL/vector projections for query
