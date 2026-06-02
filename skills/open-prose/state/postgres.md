---
role: postgres-state-management
status: experimental
summary: |
  PostgreSQL-based state management for OpenProse systems. This approach persists
  execution state to a PostgreSQL database, enabling true concurrent writes,
  network access, team collaboration, and high-throughput workloads.
requires: psql CLI tool in PATH, running PostgreSQL server
see-also:
  - ../prose.md: VM execution semantics
  - ../forme.md: System wiring semantics
  - filesystem.md: File-based state (default, simpler)
  - sqlite.md: SQLite state (queryable, single-file)
  - in-context.md: In-context state (for simple systems)
  - ../primitives/session.md: Session context and compaction guidelines
---

# PostgreSQL State Management (Experimental)

This document describes how the Prose VM tracks execution state for service and
system runs using a **PostgreSQL database**. This is an experimental
alternative to file-based state (`filesystem.md`), SQLite state (`sqlite.md`),
and in-context state (`in-context.md`).

## Prerequisites

**Requires:**
1. The `psql` command-line tool must be available in your PATH
2. A running PostgreSQL server (local, Docker, or cloud)

### Installing psql

| Platform | Command | Notes |
|----------|---------|-------|
| macOS (Homebrew) | `brew install libpq && brew link --force libpq` | Client-only; no server |
| macOS (Postgres.app) | Download from https://postgresapp.com | Full install with GUI |
| Debian/Ubuntu | `apt install postgresql-client` | Client-only |
| Fedora/RHEL | `dnf install postgresql` | Client-only |
| Arch Linux | `pacman -S postgresql-libs` | Client-only |
| Windows | `winget install PostgreSQL.PostgreSQL` | Full installer |

After installation, verify:

```bash
psql --version    # Should output: psql (PostgreSQL) 16.x
```

If `psql` is not available, the Prose VM will offer to fall back to SQLite state.

---

## Overview

PostgreSQL state provides:

- **True concurrent writes**: Row-level locking allows parallel branches to write simultaneously
- **Network access**: Query state from any machine, external tools, or dashboards
- **Team collaboration**: Multiple developers can share run state
- **Rich SQL**: JSONB queries, window functions, CTEs for complex state analysis
- **High throughput**: Handle 1000+ writes/minute, multi-GB outputs
- **Durability**: WAL-based recovery, point-in-time restore

**Key principle:** The database is a flexible, shared workspace. The Prose VM and spawned sessions coordinate through it, and external tools can observe and query execution state in real-time.

### SQL/vector are derived projections, not the truth

The load-bearing invariant (`world-model.md` §1): **the canonical world-model is a
single content-addressable artifact, and PostgreSQL rows and vector indices are
derived projections of it, never the truth.** Under this backend PostgreSQL holds
two canonical things — the **append-only receipt ledger** and the
**content-addressed world-model versioning** (committed artifact objects keyed by
`ContentAddress`) — plus SQL/JSONB and optional vector indices that are **derived
projections** for query/retrieval, rebuildable from the canonical truth. A render
may query a projection by reference (e.g. a vector index over a million-row truth),
but the fingerprint is always computed over the canonical serialization of the
artifact, never over a row. There is **no policy / responsibility-status /
pressure registry**: the wake decision is the reconciler comparing fingerprints —
deterministic, total, no judge.

---

## Security Model

`OPENPROSE_POSTGRES_URL` is an opaque host capability. The VM and Forme may
check whether the variable is set, and tools may reference the variable by name
when opening a database connection, but agents must never read, print, log, or
serialize the raw connection string.

- Pass the variable name (`OPENPROSE_POSTGRES_URL`), not its value, through
  prompts, manifests, run state, and artifacts
- Run database commands with references such as `"$OPENPROSE_POSTGRES_URL"`;
  never echo the variable or include the expanded URL in output
- If a harness cannot provide database access without exposing the raw value to
  agent context, do not use the PostgreSQL backend in that harness
- Use a **dedicated database** for OpenProse, not your production systems
- Create a **limited-privilege user** with access only to the `openprose` schema

**Recommended setup:**
```sql
-- Create dedicated user with minimal privileges
CREATE USER openprose_agent WITH PASSWORD 'changeme';
CREATE SCHEMA openprose AUTHORIZATION openprose_agent;
GRANT ALL ON SCHEMA openprose TO openprose_agent;
-- User can only access the openprose schema, nothing else
```

---

## When to Use PostgreSQL State

PostgreSQL state is for **power users** with specific scale or collaboration needs:

| Need | PostgreSQL Helps |
|------|------------------|
| >5 parallel branches writing simultaneously | SQLite locks; PostgreSQL doesn't |
| External dashboards querying state | PostgreSQL is designed for concurrent readers |
| Team collaboration on long workflows | Shared network access; no file sync needed |
| Outputs exceeding 1GB | Bulk ingestion; no single-file bottleneck |
| Mission-critical workflows (hours/days) | Robust durability; point-in-time recovery |

**If none of these apply, use filesystem or SQLite state.** They're simpler and sufficient for 99% of systems.

### Decision Tree

```
Is your system <30 statements with no parallel blocks?
  YES -> Use in-context state (zero friction)
  NO  -> Continue...

Do external tools (dashboards, monitoring, analytics) need to query state?
  YES -> Use PostgreSQL (network access required)
  NO  -> Continue...

Do multiple machines or team members need shared access to the same run?
  YES -> Use PostgreSQL (collaboration)
  NO  -> Continue...

Do you have >5 concurrent parallel branches writing simultaneously?
  YES -> Use PostgreSQL (concurrency)
  NO  -> Continue...

Will outputs exceed 1GB or writes exceed 100/minute?
  YES -> Use PostgreSQL (scale)
  NO  -> Use filesystem (default) or SQLite (if you want SQL queries)
```

### The Concurrency Case

The primary motivation for PostgreSQL is **concurrent writes in parallel execution**:

- SQLite uses table-level locks: parallel branches serialize
- PostgreSQL uses row-level locks: parallel branches write simultaneously

If your system has 10 parallel branches completing at once, PostgreSQL will be 5-10x faster than SQLite for the write phase.

---

## Database Setup

### Option 1: Docker (Recommended)

The fastest path to a running PostgreSQL instance:

```bash
docker run -d \
  --name prose-pg \
  -e POSTGRES_DB=prose \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 5432:5432 \
  postgres:16
```

Then configure the connection:

```bash
OPENPROSE_ROOT="${OPENPROSE_ROOT:-.}"
mkdir -p "$OPENPROSE_ROOT"
echo "OPENPROSE_POSTGRES_URL=postgresql://postgres@localhost:5432/prose" > "$OPENPROSE_ROOT/.env"
```

Management commands:

```bash
docker ps | grep prose-pg    # Check if running
docker logs prose-pg         # View logs
docker stop prose-pg         # Stop
docker start prose-pg        # Start again
docker rm -f prose-pg        # Remove completely
```

### Option 2: Local PostgreSQL

For users who prefer native PostgreSQL:

**macOS (Homebrew):**

```bash
OPENPROSE_ROOT="${OPENPROSE_ROOT:-.}"
brew install postgresql@16
brew services start postgresql@16
createdb myproject
echo "OPENPROSE_POSTGRES_URL=postgresql://localhost/myproject" >> "$OPENPROSE_ROOT/.env"
```

**Linux (Debian/Ubuntu):**

```bash
OPENPROSE_ROOT="${OPENPROSE_ROOT:-.}"
sudo apt install postgresql
sudo systemctl start postgresql
sudo -u postgres createdb myproject
echo "OPENPROSE_POSTGRES_URL=postgresql:///myproject" >> "$OPENPROSE_ROOT/.env"
```

### Option 3: Cloud PostgreSQL

For team collaboration or production:

| Provider | Free Tier | Cold Start | Best For |
|----------|-----------|------------|----------|
| **Neon** | 0.5GB, auto-suspend | 1-3s | Development, testing |
| **Supabase** | 500MB, no auto-suspend | None | Projects needing auth/storage |
| **Railway** | $5/mo credit | None | Simple production deploys |

```bash
# Example: Neon
OPENPROSE_ROOT="${OPENPROSE_ROOT:-.}"
mkdir -p "$OPENPROSE_ROOT"
# Add this line to <openprose-root>/.env locally:
# OPENPROSE_POSTGRES_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require
```

Replace the placeholders locally. Do not paste or log the real connection
string.

---

## Database Location

The connection string is stored in `<openprose-root>/.env`:

```
<openprose-root>/
├── .env                        # OPENPROSE_POSTGRES_URL=...
├── src/
│   └── system/index.prose.md
└── runs/                       # Source snapshots and attachments
    └── {YYYYMMDD}-{HHMMSS}-{random}/
        ├── compiled-intent.json # Optional snapshot of compiled intent (topology WM + canonicalizers + validators)
        ├── root.prose.md       # Copy of the invoked source
        ├── sources/            # Source snapshots
        └── attachments/        # Large canonical artifact blobs (optional)
```

**Run ID format:** `{YYYYMMDD}-{HHMMSS}-{random6}`

Example: `20260116-143052-a7b3c9`

PostgreSQL state preserves the same run identity and source snapshot files as
the filesystem backend. It holds the receipt ledger and the content-addressed
world-model versioning in PostgreSQL tables (the filesystem backend's
`receipts/` + `world-model/`), with SQL/vector indices as **derived
projections**, plus optional attachment files for large artifact blobs.

### Environment Variable Precedence

The VM checks in this order:

1. `OPENPROSE_POSTGRES_URL` in `<openprose-root>/.env`
2. `OPENPROSE_POSTGRES_URL` in shell environment
3. `DATABASE_URL` in shell environment (common fallback)

### Security: Add to .gitignore

```gitignore
# OpenProse sensitive files
<openprose-root>/.env
<openprose-root>/runs/
```

---

## Responsibility Separation

This section defines **who does what**. This is the contract between the Prose VM and spawned sessions.

### VM Responsibilities

The Prose VM (the orchestrating agent running the service or system) is responsible for:

| Responsibility | Description |
|----------------|-------------|
| **Schema initialization** | Create `openprose` schema and tables at run start |
| **Run registration** | Store the root source and metadata |
| **Execution tracking** | Update position, status, and timing as statements execute |
| **Session spawning** | Spawn sessions via the host `spawn_session` primitive with database instructions |
| **Parallel coordination** | Track branch status, implement join strategies |
| **Loop management** | Track iteration counts, evaluate conditions |
| **Error aggregation** | Record failures, manage retry state |
| **Context preservation** | Maintain sufficient narration in the main thread |
| **Completion detection** | Mark the run as complete when finished |

**Critical:** The VM must preserve enough context in its own conversation to understand execution state without re-reading the entire database. The database is for coordination and persistence, not a replacement for working memory.

### Spawned Session Responsibilities

Spawned sessions are responsible for:

| Responsibility | Description |
|----------------|-------------|
| **Writing own outputs** | Insert/update their binding in the `bindings` table |
| **Memory management** | For persistent agents: read and update their memory record |
| **Segment recording** | For persistent agents: append segment history |
| **Attachment handling** | Write large outputs to `attachments/` directory, store path in DB |
| **Atomic writes** | Use transactions when updating multiple related records |

**Critical:** Spawned sessions write ONLY to `bindings`, `agents`, and `agent_segments` tables. The Prose VM owns the `execution` table entirely. Completion signaling happens through the host `spawn_session` return, not database updates.

**Critical:** Spawned sessions must write their outputs directly to the database. The Prose VM does not write spawned-session outputs; it only reads them after the session completes.

**What spawned sessions return to the VM:** A confirmation message with the binding location, not the full content:

**Root scope:**
```
Binding written: research
Location: openprose.bindings WHERE name='research' AND run_id='20260116-143052-a7b3c9' AND execution_id IS NULL
Summary: AI safety research covering alignment, robustness, and interpretability with 15 citations.
```

**Inside block invocation:**
```
Binding written: result
Location: openprose.bindings WHERE name='result' AND run_id='20260116-143052-a7b3c9' AND execution_id=43
Execution ID: 43
Summary: Processed chunk into 3 sub-parts for recursive processing.
```

The VM tracks locations, not values. This keeps the VM's context lean and enables arbitrarily large intermediate values.

### Shared Concerns

| Concern | Who Handles |
|---------|-------------|
| Schema evolution | Either (use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE` as needed) |
| Custom tables | Either (prefix with `x_` for extensions) |
| Indexing | Either (add indexes for frequently-queried columns) |
| Cleanup | VM (at run end, optionally delete old data) |

---

## Core Schema

The VM initializes these tables using the `openprose` schema. This is a **minimum viable schema**—extend freely.

```sql
-- Create dedicated schema for OpenProse state
CREATE SCHEMA IF NOT EXISTS openprose;

-- Run metadata
CREATE TABLE IF NOT EXISTS openprose.run (
    id TEXT PRIMARY KEY,
    root_path TEXT,
    root_source TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'interrupted')),
    state_mode TEXT NOT NULL DEFAULT 'postgres',
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Execution position and history
CREATE TABLE IF NOT EXISTS openprose.execution (
    id SERIAL PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES openprose.run(id) ON DELETE CASCADE,
    statement_index INTEGER NOT NULL,
    statement_text TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'skipped')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    parent_id INTEGER REFERENCES openprose.execution(id) ON DELETE CASCADE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- === CANONICAL: content-addressed world-model versioning ===
-- Each committed world-model version, keyed by ContentAddress (sha256 over the
-- canonical serialization). Canonical truth, NOT a projection.
CREATE TABLE IF NOT EXISTS openprose.world_model_version (
    version TEXT PRIMARY KEY,        -- ContentAddress: sha256:<hex>
    node TEXT NOT NULL,
    artifact BYTEA,                  -- canonical serialization (or attachment_path for large)
    attachment_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The current published version per node.
CREATE TABLE IF NOT EXISTS openprose.world_model_published (
    node TEXT PRIMARY KEY,
    version TEXT NOT NULL REFERENCES openprose.world_model_version(version),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === CANONICAL: append-only receipt ledger (node-scoped, chained by prev) ===
-- The single commit object. No verdict, no judge, no policy artifact.
CREATE TABLE IF NOT EXISTS openprose.receipt (
    id SERIAL PRIMARY KEY,
    run_id TEXT REFERENCES openprose.run(id) ON DELETE CASCADE,
    node TEXT NOT NULL,
    contract_fingerprint TEXT NOT NULL,
    wake JSONB NOT NULL,             -- { source: input|self|external, refs: [...] }
    input_fingerprints JSONB NOT NULL, -- array — memo key's second half
    fingerprints JSONB NOT NULL,     -- { facet -> token }, always incl. "@atomic"
    semantic_diff JSONB DEFAULT '{}'::jsonb, -- render-input context; never a wake signal
    prev TEXT,                       -- ContentAddress of prior receipt; NULL at cold start
    status TEXT NOT NULL CHECK (status IN ('rendered', 'skipped', 'failed')),
    cost JSONB DEFAULT '{}'::jsonb,  -- { provider, model, tokens, surprise_cause }
    sig JSONB NOT NULL,              -- null-signature: { scheme:"none", null_reason }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === DERIVED PROJECTION: named values for single-session function/service runs ===
-- A query convenience for stateless `function`/`service` call results. NOT the
-- canonical truth for nodes — a node's truth is the world_model_version artifact.
CREATE TABLE IF NOT EXISTS openprose.bindings (
    name TEXT NOT NULL,
    run_id TEXT NOT NULL REFERENCES openprose.run(id) ON DELETE CASCADE,
    execution_id INTEGER,  -- NULL for root scope, non-null for block invocations
    binding TEXT NOT NULL CHECK (binding IN ('input', 'output', 'let', 'const')),
    value TEXT,
    source_statement TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attachment_path TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (name, run_id, COALESCE(execution_id, -1))  -- Composite key with scope
);

-- Persistent agent memory
CREATE TABLE IF NOT EXISTS openprose.agents (
    name TEXT NOT NULL,
    run_id TEXT,  -- NULL for project-scoped and user-scoped agents
    scope TEXT NOT NULL CHECK (scope IN ('execution', 'project', 'user', 'custom')),
    memory TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (name, COALESCE(run_id, '__project__'))
);

-- Agent invocation history
CREATE TABLE IF NOT EXISTS openprose.agent_segments (
    id SERIAL PRIMARY KEY,
    agent_name TEXT NOT NULL,
    run_id TEXT,  -- NULL for project-scoped agents
    segment_number INTEGER NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prompt TEXT,
    summary TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE (agent_name, COALESCE(run_id, '__project__'), segment_number)
);

-- Resolved dependency cache
CREATE TABLE IF NOT EXISTS openprose.imports (
    alias TEXT NOT NULL,
    run_id TEXT NOT NULL REFERENCES openprose.run(id) ON DELETE CASCADE,
    source_ref TEXT NOT NULL,
    resolved_at TIMESTAMPTZ,
    requires_schema JSONB,
    ensures_schema JSONB,
    content_hash TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (alias, run_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_execution_run_id ON openprose.execution(run_id);
CREATE INDEX IF NOT EXISTS idx_execution_status ON openprose.execution(status);
CREATE INDEX IF NOT EXISTS idx_execution_parent_id ON openprose.execution(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_execution_metadata_gin ON openprose.execution USING GIN (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_bindings_run_id ON openprose.bindings(run_id);
CREATE INDEX IF NOT EXISTS idx_bindings_execution_id ON openprose.bindings(execution_id) WHERE execution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_run_id ON openprose.agents(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_project_scoped ON openprose.agents(name) WHERE run_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_segments_lookup ON openprose.agent_segments(agent_name, run_id);
```

### Schema Conventions

- **Timestamps**: Use `TIMESTAMPTZ` with `NOW()` (timezone-aware)
- **JSON fields**: Use `JSONB` for structured data in `metadata` columns (queryable, indexable)
- **Large values**: If a binding value exceeds ~100KB, write to `attachments/{name}.md` and store path
- **Extension tables**: Prefix with `x_` (e.g., `x_metrics`, `x_audit_log`)
- **Anonymous bindings**: Sessions without explicit capture use auto-generated names: `anon_001`, `anon_002`, etc.
- **Resolved service bindings**: Prefix with the resolved service alias for scoping: `research.findings`, `research.sources`
- **Scoped bindings**: Use `execution_id` column—NULL for root scope, non-null for block invocations

### Scope Resolution Query

For recursive blocks, bindings are scoped to their execution frame. Resolve variables by walking up the call stack:

```sql
-- Find binding 'result' starting from execution_id 43 in run '20260116-143052-a7b3c9'
WITH RECURSIVE scope_chain AS (
  -- Start with current execution
  SELECT id, parent_id FROM openprose.execution WHERE id = 43
  UNION ALL
  -- Walk up to parent
  SELECT e.id, e.parent_id
  FROM openprose.execution e
  JOIN scope_chain s ON e.id = s.parent_id
)
SELECT b.* FROM openprose.bindings b
WHERE b.name = 'result'
  AND b.run_id = '20260116-143052-a7b3c9'
  AND (b.execution_id IN (SELECT id FROM scope_chain) OR b.execution_id IS NULL)
ORDER BY
  CASE WHEN b.execution_id IS NULL THEN 1 ELSE 0 END,  -- Prefer scoped over root
  b.execution_id DESC NULLS LAST  -- Prefer deeper (more local) scope
LIMIT 1;
```

**Simpler version if you know the scope chain:**

```sql
-- Direct lookup: check current scope (43), then parent (42), then root (NULL)
SELECT * FROM openprose.bindings
WHERE name = 'result'
  AND run_id = '20260116-143052-a7b3c9'
  AND (execution_id = 43 OR execution_id = 42 OR execution_id IS NULL)
ORDER BY execution_id DESC NULLS LAST
LIMIT 1;
```

---

## Database Interaction

The Prose VM and spawned sessions interact via the `psql` CLI.

### From the VM

```bash
# Initialize schema
psql "$OPENPROSE_POSTGRES_URL" -f schema.sql

# Register a new run
psql "$OPENPROSE_POSTGRES_URL" -c "
  INSERT INTO openprose.run (id, root_path, root_source, status)
  VALUES ('20260116-143052-a7b3c9', '/path/to/root.prose.md', 'root source...', 'running')
"

# Update execution position
psql "$OPENPROSE_POSTGRES_URL" -c "
  INSERT INTO openprose.execution (run_id, statement_index, statement_text, status, started_at)
  VALUES ('20260116-143052-a7b3c9', 3, 'session \"Research AI safety\"', 'executing', NOW())
"

# Read a binding
psql "$OPENPROSE_POSTGRES_URL" -t -A -c "
  SELECT value FROM openprose.bindings WHERE name = 'research' AND run_id = '20260116-143052-a7b3c9'
"

# Check parallel branch status
psql "$OPENPROSE_POSTGRES_URL" -c "
  SELECT metadata->>'branch' AS branch, status FROM openprose.execution
  WHERE run_id = '20260116-143052-a7b3c9' AND metadata->>'parallel_id' = 'p1'
"
```

### From Spawned Sessions

The Prose VM provides the database path and instructions when spawning:

**Root scope (outside block invocations):**

```
Your output goes to PostgreSQL state.

| Property | Value |
|----------|-------|
| Connection variable | `OPENPROSE_POSTGRES_URL` |
| Schema | `openprose` |
| Run ID | `20260116-143052-a7b3c9` |
| Binding | `research` |
| Execution ID | (root scope) |

When complete, write your output:

psql "$OPENPROSE_POSTGRES_URL" -c "
  INSERT INTO openprose.bindings (name, run_id, execution_id, binding, value, source_statement)
  VALUES (
    'research',
    '20260116-143052-a7b3c9',
    NULL,  -- root scope
    'let',
    E'AI safety research covers alignment, robustness...',
    'let research = session: researcher'
  )
  ON CONFLICT (name, run_id, COALESCE(execution_id, -1)) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW()
"
```

**Inside block invocation (include execution_id):**

```
Your output goes to PostgreSQL state.

| Property | Value |
|----------|-------|
| Connection variable | `OPENPROSE_POSTGRES_URL` |
| Schema | `openprose` |
| Run ID | `20260116-143052-a7b3c9` |
| Binding | `result` |
| Execution ID | `43` |
| Block | `process` |
| Depth | `3` |

When complete, write your output:

psql "$OPENPROSE_POSTGRES_URL" -c "
  INSERT INTO openprose.bindings (name, run_id, execution_id, binding, value, source_statement)
  VALUES (
    'result',
    '20260116-143052-a7b3c9',
    43,  -- scoped to this execution
    'let',
    E'Processed chunk into 3 sub-parts...',
    'let result = session \"Process chunk\"'
  )
  ON CONFLICT (name, run_id, COALESCE(execution_id, -1)) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW()
"
```

For persistent agents (execution-scoped):

```
Your memory is in the database:

Read your current state:
  psql "$OPENPROSE_POSTGRES_URL" -t -A -c "SELECT memory FROM openprose.agents WHERE name = 'captain' AND run_id = '20260116-143052-a7b3c9'"

Update when done:
  psql "$OPENPROSE_POSTGRES_URL" -c "UPDATE openprose.agents SET memory = '...', updated_at = NOW() WHERE name = 'captain' AND run_id = '20260116-143052-a7b3c9'"

Record this segment:
  psql "$OPENPROSE_POSTGRES_URL" -c "INSERT INTO openprose.agent_segments (agent_name, run_id, segment_number, prompt, summary) VALUES ('captain', '20260116-143052-a7b3c9', 3, '...', '...')"
```

For project-scoped agents, use `run_id IS NULL` in queries:

```sql
-- Read project-scoped agent memory
SELECT memory FROM openprose.agents WHERE name = 'advisor' AND run_id IS NULL;

-- Update project-scoped agent memory
UPDATE openprose.agents SET memory = '...' WHERE name = 'advisor' AND run_id IS NULL;
```

---

## Context Preservation in Main Thread

**This is critical.** The database is for persistence and coordination, but the VM must still maintain conversational context.

### What the VM Must Narrate

Even with PostgreSQL state, the VM should narrate key events in its conversation:

```
[Position] Statement 3: let research = session: researcher
   Spawning session, will write to state database
   [spawn_session call]
[Success] Session complete, binding written to DB
[Binding] research = <stored in openprose.bindings>
```

### Why Both?

| Purpose | Mechanism |
|---------|-----------|
| **Working memory** | Conversation narration (what the VM "remembers" without re-querying) |
| **Durable state** | PostgreSQL database (survives context limits, enables resumption) |
| **Spawned session coordination** | PostgreSQL database (shared access point) |
| **Debugging/inspection** | PostgreSQL database (queryable history) |

The narration is the VM's "mental model" of execution. The database is the "source of truth" for resumption and inspection.

---

## Parallel Execution

For parallel blocks, the VM uses the `metadata` JSONB field to track branches. **Only the VM writes to the `execution` table.**

```sql
-- VM marks parallel start
INSERT INTO openprose.execution (run_id, statement_index, statement_text, status, started_at, metadata)
VALUES ('20260116-143052-a7b3c9', 5, 'parallel:', 'executing', NOW(),
  '{"parallel_id": "p1", "strategy": "all", "branches": ["a", "b", "c"]}'::jsonb)
RETURNING id;  -- Save as parent_id (e.g., 42)

-- VM creates execution record for each branch
INSERT INTO openprose.execution (run_id, statement_index, statement_text, status, started_at, parent_id, metadata)
VALUES
  ('20260116-143052-a7b3c9', 6, 'a = session "Branch A"', 'executing', NOW(), 42, '{"parallel_id": "p1", "branch": "a"}'::jsonb),
  ('20260116-143052-a7b3c9', 7, 'b = session "Branch B"', 'executing', NOW(), 42, '{"parallel_id": "p1", "branch": "b"}'::jsonb),
  ('20260116-143052-a7b3c9', 8, 'c = session "Branch C"', 'executing', NOW(), 42, '{"parallel_id": "p1", "branch": "c"}'::jsonb);

-- Spawned sessions write their outputs to bindings table (see "From Spawned Sessions" section)
-- spawn_session signals completion to the VM via the host

-- VM marks branch complete after the session returns
UPDATE openprose.execution SET status = 'completed', completed_at = NOW()
WHERE run_id = '20260116-143052-a7b3c9' AND metadata->>'parallel_id' = 'p1' AND metadata->>'branch' = 'a';

-- VM checks if all branches complete
SELECT COUNT(*) AS pending FROM openprose.execution
WHERE run_id = '20260116-143052-a7b3c9'
  AND metadata->>'parallel_id' = 'p1'
  AND parent_id IS NOT NULL
  AND status NOT IN ('completed', 'failed', 'skipped');
```

### The Concurrency Advantage

Each spawned session writes to a different row in `openprose.bindings`. PostgreSQL's row-level locking means **no blocking**:

```
SQLite (table locks):
  Branch 1 writes -------|
                         Branch 2 waits ------|
                                              Branch 3 waits -----|
  Total time: 3 * write_time (serialized)

PostgreSQL (row locks):
  Branch 1 writes  --|
  Branch 2 writes  --|  (concurrent)
  Branch 3 writes  --|
  Total time: ~1 * write_time (parallel)
```

---

## Loop Tracking

```sql
-- Loop metadata tracks iteration state
INSERT INTO openprose.execution (run_id, statement_index, statement_text, status, started_at, metadata)
VALUES ('20260116-143052-a7b3c9', 10, 'loop until **analysis complete** (max: 5):', 'executing', NOW(),
  '{"loop_id": "l1", "max_iterations": 5, "current_iteration": 0, "condition": "**analysis complete**"}'::jsonb);

-- Update iteration
UPDATE openprose.execution
SET metadata = jsonb_set(metadata, '{current_iteration}', '2')
WHERE run_id = '20260116-143052-a7b3c9' AND metadata->>'loop_id' = 'l1' AND parent_id IS NULL;
```

---

## Error Handling

```sql
-- Record failure
UPDATE openprose.execution
SET status = 'failed',
    error_message = 'Connection timeout after 30s',
    completed_at = NOW()
WHERE id = 15;

-- Track retry attempts in metadata
UPDATE openprose.execution
SET metadata = jsonb_set(jsonb_set(metadata, '{retry_attempt}', '2'), '{max_retries}', '3')
WHERE id = 15;

-- Mark run as failed
UPDATE openprose.run SET status = 'failed' WHERE id = '20260116-143052-a7b3c9';
```

---

## Project-Scoped and User-Scoped Agents

Execution-scoped agents (the default) use `run_id = specific value`. **Project-scoped agents** (`### Runtime` with `persist: project`) and **user-scoped agents** (`### Runtime` with `persist: user`) use `run_id IS NULL` and survive across runs.

For user-scoped agents, the VM maintains a separate connection or uses a naming convention to distinguish them from project-scoped agents. One approach is to prefix user-scoped agent names with `__user__` in the same database, or use a separate user-level database configured via `OPENPROSE_POSTGRES_USER_URL`.

### The run_id Approach

The `COALESCE` trick in the primary key allows both scopes in one table:

```sql
PRIMARY KEY (name, COALESCE(run_id, '__project__'))
```

This means:
- `name='advisor', run_id=NULL` has PK `('advisor', '__project__')`
- `name='advisor', run_id='20260116-143052-a7b3c9'` has PK `('advisor', '20260116-143052-a7b3c9')`

The same agent name can exist as both project-scoped and execution-scoped without collision.

### Query Patterns

| Scope | Query |
|-------|-------|
| Execution-scoped | `WHERE name = 'captain' AND run_id = '{RUN_ID}'` |
| Project-scoped | `WHERE name = 'advisor' AND run_id IS NULL` |

### Project-Scoped Memory Guidelines

Project-scoped agents should store generalizable knowledge that accumulates:

**DO store:** User preferences, project context, learned patterns, decision rationale
**DO NOT store:** Run-specific details, time-sensitive information, large data

### Agent Cleanup

- **Execution-scoped:** Can be deleted when run completes or after retention period
- **Project-scoped:** Only deleted on explicit user request

```sql
-- Delete execution-scoped agents for a completed run
DELETE FROM openprose.agents WHERE run_id = '20260116-143052-a7b3c9';

-- Delete a specific project-scoped agent (user-initiated)
DELETE FROM openprose.agents WHERE name = 'old_advisor' AND run_id IS NULL;
```

---

## Large Outputs

When a binding value is too large for comfortable database storage (>100KB):

1. Write content to `attachments/{binding_name}.md`
2. Store the path in the `attachment_path` column
3. Leave `value` as a summary

```sql
INSERT INTO openprose.bindings (name, run_id, binding, value, attachment_path, source_statement)
VALUES (
  'full_report',
  '20260116-143052-a7b3c9',
  'let',
  'Full analysis report (847KB) - see attachment',
  'attachments/full_report.md',
  'let full_report = session "Generate report with findings, evidence, and caveats"'
)
ON CONFLICT (name, run_id) DO UPDATE
SET value = EXCLUDED.value, attachment_path = EXCLUDED.attachment_path, updated_at = NOW();
```

---

## Resuming Execution

To resume an interrupted run:

```sql
-- Find current position
SELECT statement_index, statement_text, status
FROM openprose.execution
WHERE run_id = '20260116-143052-a7b3c9' AND status = 'executing'
ORDER BY id DESC LIMIT 1;

-- Get all completed bindings
SELECT name, binding, value, attachment_path FROM openprose.bindings
WHERE run_id = '20260116-143052-a7b3c9';

-- Get agent memory states
SELECT name, scope, memory FROM openprose.agents
WHERE run_id = '20260116-143052-a7b3c9' OR run_id IS NULL;

-- Check parallel block status
SELECT metadata->>'branch' AS branch, status
FROM openprose.execution
WHERE run_id = '20260116-143052-a7b3c9'
  AND metadata->>'parallel_id' IS NOT NULL
  AND parent_id IS NOT NULL;
```

---

## Flexibility Encouragement

PostgreSQL state is intentionally **flexible**. The core schema is a starting point. You are encouraged to:

- **Add columns** to existing tables as needed
- **Create extension tables** (prefix with `x_`)
- **Store custom metrics** (timing, token counts, model info)
- **Build indexes** for your query patterns
- **Use JSONB operators** for semi-structured data queries

Example extensions:

```sql
-- Custom metrics table
CREATE TABLE IF NOT EXISTS openprose.x_metrics (
    id SERIAL PRIMARY KEY,
    run_id TEXT REFERENCES openprose.run(id) ON DELETE CASCADE,
    execution_id INTEGER REFERENCES openprose.execution(id) ON DELETE CASCADE,
    metric_name TEXT NOT NULL,
    metric_value NUMERIC,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Add custom column
ALTER TABLE openprose.bindings ADD COLUMN IF NOT EXISTS token_count INTEGER;

-- Create index for common query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bindings_created ON openprose.bindings(created_at);
```

The database is your workspace. Use it.

---

## Comparison with Other Modes

| Aspect | filesystem.md | in-context.md | sqlite.md | postgres.md |
|--------|---------------|---------------|-----------|-------------|
| **Canonical truth** | `world-model/` + `receipts/` | Conversation history | `world_model_version`/`receipt` tables | `world_model_version`/`receipt` tables |
| **Derived projections** | optional rebuildable index | none | SQL query tables | SQL/JSONB + optional vector index |
| **State location** | `<openprose-root>/runs/{id}/` files | Conversation history | `<openprose-root>/runs/{id}/state.db` | PostgreSQL database |
| **Queryable** | Via file reads | No | Yes (SQL projections) | Yes (SQL/vector projections over canonical truth) |
| **Atomic updates** | No | N/A | Yes (transactions) | Yes (ACID) |
| **Concurrent writes** | Yes (different files) | N/A | **No (table locks)** | **Yes (row locks)** |
| **Network access** | No | No | No | **Yes** |
| **Team collaboration** | Via file sync | No | Via file sync | **Yes** |
| **Schema flexibility** | Rigid file structure | N/A | Flexible | Very flexible (JSONB) |
| **Resumption** | Read vm.log.md | Re-read conversation | Query database | Query database |
| **Complexity ceiling** | High | Low (<30 statements) | High | **Very high** |
| **Dependency** | None | None | sqlite3 CLI | psql CLI + PostgreSQL |
| **Setup friction** | Zero | Zero | Low | Medium-High |
| **Status** | Stable | Stable | Experimental | **Experimental** |

---

## Summary

PostgreSQL state management:

1. Uses a **shared PostgreSQL database** for all runs
2. Holds the **canonical** receipt ledger + content-addressed world-model versioning in tables
3. Exposes **SQL/JSONB + vector indices as derived projections** — never the canonical truth (`world-model.md` §1)
4. Has **no policy/responsibility-status/pressure registry** — the wake decision is the reconciler comparing fingerprints
5. Provides **true concurrent writes** via row-level locking; **network access** for dashboards; **team collaboration**
6. Allows **flexible schema evolution** for projections with JSONB and custom tables
7. Requires the **psql CLI** and a running PostgreSQL server
8. Is **experimental**—expect changes

The core contract: the Prose VM manages execution flow and spawns sessions; spawned sessions write their own outputs directly to the database. Completion is signaled through the `spawn_session` return, not database updates. External tools can query execution state in real-time.

**PostgreSQL state is for power users.** If you don't need concurrent writes, network access, or team collaboration, filesystem or SQLite state will be simpler and sufficient.
