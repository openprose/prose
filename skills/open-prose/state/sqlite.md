---
role: sqlite-state-management
status: experimental
summary: |
  SQLite-based state management for OpenProse systems. This approach persists
  execution state to a SQLite database, enabling structured queries, atomic
  transactions, and flexible schema evolution.
requires: sqlite3 CLI tool in PATH
see-also:
  - ../prose.md: VM execution semantics
  - ../forme.md: System wiring semantics
  - filesystem.md: File-based state (default, more prescriptive)
  - in-context.md: In-context state (for simple systems)
  - ../primitives/session.md: Session context and compaction guidelines
---

# SQLite State Management (Experimental)

This document describes how the Prose VM tracks execution state for service and
system runs using a **SQLite database**. This is an experimental alternative to
file-based state (`filesystem.md`) and in-context state (`in-context.md`).

## Prerequisites

**Requires:** The `sqlite3` command-line tool must be available in your PATH.

| Platform | Installation |
|----------|--------------|
| macOS | Pre-installed |
| Linux | `apt install sqlite3` / `dnf install sqlite3` / etc. |
| Windows | `winget install SQLite.SQLite` or download from sqlite.org |

If `sqlite3` is not available, the Prose VM will fall back to filesystem state and warn the user.

---

## Overview

SQLite state provides:

- **Atomic transactions**: State changes are ACID-compliant
- **Structured queries**: Find specific bindings, filter by status, aggregate results
- **Flexible schema**: Add columns and tables as needed
- **Single-file portability**: The entire run state is one `.db` file
- **Concurrent access**: SQLite handles locking automatically

**Key principle:** The database is a flexible workspace. The Prose VM and spawned sessions share it as a coordination mechanism, not a rigid contract.

---

## Database Location

The database lives within the standard run directory:

```
.agents/prose/runs/{YYYYMMDD}-{HHMMSS}-{random}/
├── forme.manifest.json     # Optional filesystem snapshot of compiled Forme manifest
├── root.prose.md           # Copy of the invoked service or system source
├── sources/                # Service, system, and pattern source snapshots
├── state.db                # SQLite database for execution events and bindings
└── attachments/            # Large outputs that don't fit in DB (optional)
```

**Run ID format:** Same as filesystem state: `{YYYYMMDD}-{HHMMSS}-{random6}`

Example: `.agents/prose/runs/20260116-143052-a7b3c9/state.db`

SQLite state preserves the same run identity and source snapshot files as the
filesystem backend. It replaces filesystem `workspace/`, `bindings/`, and
`vm.log.md` artifacts with database tables plus optional attachment files.

### Project-Scoped and User-Scoped Agents

Execution-scoped agents (the default) live in the per-run `state.db`. However, **project-scoped agents** (`### Runtime` with `persist: project`) and **user-scoped agents** (`### Runtime` with `persist: user`) must survive across runs.

For project-scoped agents, use a separate database:

```
.agents/prose/
├── agents.db                 # Project-scoped agent memory (survives runs)
└── runs/
    └── {id}/
        └── state.db          # Execution-scoped state (dies with run)
```

For user-scoped agents, use a database in the home directory:

```
~/.agents/prose/
└── agents.db                 # User-scoped agent memory (survives across projects)
```

The `agents` and `agent_segments` tables for project-scoped agents live in `.agents/prose/agents.db`, and for user-scoped agents live in `~/.agents/prose/agents.db`. The Prose VM initializes these databases on first use and provides the correct path to spawned sessions.

---

## Responsibility Separation

This section defines **who does what**. This is the contract between the Prose VM and spawned sessions.

### VM Responsibilities

The Prose VM (the orchestrating agent running the service or system) is responsible for:

| Responsibility | Description |
|----------------|-------------|
| **Database creation** | Create `state.db` and initialize core tables at run start |
| **Run registration** | Store the root source and metadata |
| **Execution tracking** | Append completion records (not update-per-statement) |
| **Session spawning** | Spawn sessions via the host `spawn_session` primitive with database path and instructions |
| **Parallel coordination** | Track branch status, implement join strategies |
| **Loop management** | Track iteration counts, evaluate conditions |
| **Error aggregation** | Record failures, manage retry state |
| **Completion detection** | Mark the run as complete when finished |

**Critical:** The VM's conversation history is the primary execution state. The database exists for persistence and coordination, not as the source of truth during normal execution. The VM appends records on completion events—it does NOT update the database after every statement.

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
Location: .agents/prose/runs/20260116-143052-a7b3c9/state.db (bindings table, name='research', execution_id=NULL)
Summary: AI safety research covering alignment, robustness, and interpretability with 15 citations.
```

**Inside block invocation:**
```
Binding written: result
Location: .agents/prose/runs/20260116-143052-a7b3c9/state.db (bindings table, name='result', execution_id=43)
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
| Cleanup | VM (at run end, optionally vacuum) |

---

## Core Schema

The VM initializes these tables. This is a **minimum viable schema**—extend freely.

```sql
-- Run metadata
CREATE TABLE IF NOT EXISTS run (
    id TEXT PRIMARY KEY,
    root_path TEXT,
    root_source TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'running',  -- running, completed, failed, interrupted
    state_mode TEXT DEFAULT 'sqlite'
);

-- Execution position and history
CREATE TABLE IF NOT EXISTS execution (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_index INTEGER,
    statement_text TEXT,
    status TEXT,  -- pending, executing, completed, failed, skipped
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    parent_id INTEGER REFERENCES execution(id),  -- for nested blocks
    metadata TEXT  -- JSON for construct-specific data (loop iteration, parallel branch, etc.)
);

-- All named values (binding input/output, let, const)
CREATE TABLE IF NOT EXISTS bindings (
    name TEXT,
    execution_id INTEGER,  -- NULL for root scope, non-null for block invocations
    binding TEXT,  -- input, output, let, const
    value TEXT,
    source_statement TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    attachment_path TEXT,  -- if value is too large, store path to file
    PRIMARY KEY (name, IFNULL(execution_id, -1))  -- IFNULL handles NULL for root scope
);

-- Persistent agent memory
CREATE TABLE IF NOT EXISTS agents (
    name TEXT PRIMARY KEY,
    scope TEXT,  -- execution, project, user, custom
    memory TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Agent invocation history
CREATE TABLE IF NOT EXISTS agent_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT REFERENCES agents(name),
    segment_number INTEGER,
    timestamp TEXT DEFAULT (datetime('now')),
    prompt TEXT,
    summary TEXT,
    UNIQUE(agent_name, segment_number)
);

-- Resolved dependency cache
CREATE TABLE IF NOT EXISTS imports (
    alias TEXT PRIMARY KEY,
    source_ref TEXT,
    resolved_at TEXT,
    requires_schema TEXT,  -- JSON
    ensures_schema TEXT  -- JSON
);
```

### Schema Conventions

- **Timestamps**: Use ISO 8601 format (`datetime('now')`)
- **JSON fields**: Store structured data as JSON text in `metadata`, `*_schema` columns
- **Large values**: If a binding value exceeds ~100KB, write to `attachments/{name}.md` and store path
- **Extension tables**: Prefix with `x_` (e.g., `x_metrics`, `x_audit_log`)
- **Anonymous bindings**: Sessions without explicit capture (`session "..."` without `let x =`) use auto-generated names: `anon_001`, `anon_002`, etc.
- **Resolved service bindings**: Prefix with the resolved service alias for scoping: `research.findings`, `research.sources`
- **Scoped bindings**: Use `execution_id` column—NULL for root scope, non-null for block invocations

### Scope Resolution Query

For recursive blocks, bindings are scoped to their execution frame. Resolve variables by walking up the call stack:

```sql
-- Find binding 'result' starting from execution_id 43
WITH RECURSIVE scope_chain AS (
  -- Start with current execution
  SELECT id, parent_id FROM execution WHERE id = 43
  UNION ALL
  -- Walk up to parent
  SELECT e.id, e.parent_id
  FROM execution e
  JOIN scope_chain s ON e.id = s.parent_id
)
SELECT b.* FROM bindings b
LEFT JOIN scope_chain s ON b.execution_id = s.id
WHERE b.name = 'result'
  AND (b.execution_id IN (SELECT id FROM scope_chain) OR b.execution_id IS NULL)
ORDER BY
  CASE WHEN b.execution_id IS NULL THEN 1 ELSE 0 END,  -- Prefer scoped over root
  s.id DESC NULLS LAST  -- Prefer deeper (more local) scope
LIMIT 1;
```

**Simpler version if you know the scope chain:**

```sql
-- Direct lookup: check current scope, then parent, then root
SELECT * FROM bindings
WHERE name = 'result'
  AND (execution_id = 43 OR execution_id = 42 OR execution_id IS NULL)
ORDER BY execution_id DESC NULLS LAST
LIMIT 1;
```

---

## Database Interaction

The Prose VM and spawned sessions interact via the `sqlite3` CLI.

### From the VM

```bash
# Initialize database
sqlite3 .agents/prose/runs/20260116-143052-a7b3c9/state.db "CREATE TABLE IF NOT EXISTS..."

# Update execution position
sqlite3 .agents/prose/runs/20260116-143052-a7b3c9/state.db "
  INSERT INTO execution (statement_index, statement_text, status, started_at)
  VALUES (3, 'session \"Research AI safety\"', 'executing', datetime('now'))
"

# Read a binding
sqlite3 -json .agents/prose/runs/20260116-143052-a7b3c9/state.db "
  SELECT value FROM bindings WHERE name = 'research'
"

# Check parallel branch status
sqlite3 .agents/prose/runs/20260116-143052-a7b3c9/state.db "
  SELECT statement_text, status FROM execution
  WHERE json_extract(metadata, '$.parallel_id') = 'p1'
"
```

### From Spawned Sessions

The Prose VM provides the database path and instructions when spawning:

**Root scope (outside block invocations):**

```
Your output database is:
  .agents/prose/runs/20260116-143052-a7b3c9/state.db

When complete, write your output:

sqlite3 .agents/prose/runs/20260116-143052-a7b3c9/state.db "
  INSERT OR REPLACE INTO bindings (name, execution_id, binding, value, source_statement, updated_at)
  VALUES (
    'research',
    NULL,  -- root scope
    'let',
    'AI safety research covers alignment, robustness...',
    'let research = session: researcher',
    datetime('now')
  )
"
```

**Inside block invocation (include execution_id):**

```
Execution scope:
  execution_id: 43
  block: process
  depth: 3

Your output database is:
  .agents/prose/runs/20260116-143052-a7b3c9/state.db

When complete, write your output:

sqlite3 .agents/prose/runs/20260116-143052-a7b3c9/state.db "
  INSERT OR REPLACE INTO bindings (name, execution_id, binding, value, source_statement, updated_at)
  VALUES (
    'result',
    43,  -- scoped to this execution
    'let',
    'Processed chunk into 3 sub-parts...',
    'let result = session \"Process chunk\"',
    datetime('now')
  )
"
```

For persistent agents (execution-scoped):

```
Your memory is in the database:
  .agents/prose/runs/20260116-143052-a7b3c9/state.db

Read your current state:
  sqlite3 -json .agents/prose/runs/20260116-143052-a7b3c9/state.db "SELECT memory FROM agents WHERE name = 'captain'"

Update when done:
  sqlite3 .agents/prose/runs/20260116-143052-a7b3c9/state.db "UPDATE agents SET memory = '...', updated_at = datetime('now') WHERE name = 'captain'"

Record this segment:
  sqlite3 .agents/prose/runs/20260116-143052-a7b3c9/state.db "INSERT INTO agent_segments (agent_name, segment_number, prompt, summary) VALUES ('captain', 3, '...', '...')"
```

For project-scoped agents, use `.agents/prose/agents.db`. For user-scoped agents, use `~/.agents/prose/agents.db`.

---

## Context Preservation in Main Thread

The VM's conversation history is the primary execution state. The database exists for persistence and debugging.

### Compact Narration

Use minimal markers in conversation (same as filesystem/in-context state):

```
1→ research ✓
∥ [a b c] done
loop:2/5 exit
```

The host `spawn_session` calls and results are in the conversation—no need to narrate them verbosely.

### Why Both Conversation and Database?

| Purpose | Mechanism |
|---------|-----------|
| **Working memory** | Conversation (what the VM "remembers" without querying) |
| **Durable state** | Database (survives context limits, enables resumption) |
| **Debugging/inspection** | Database (queryable history) |

The conversation is primary; the database is for persistence and inspection.

---

## Parallel Execution

For parallel blocks, **append completion records** rather than updating status. Only the VM writes to the `execution` table.

```sql
-- VM appends parallel start
INSERT INTO execution (statement_index, statement_text, status, metadata)
VALUES (5, 'parallel:', 'started', '{"parallel_id": "p1", "branches": ["a", "b", "c"]}');

-- Spawned sessions write to bindings table, spawn_session signals completion
-- VM appends completion record for each branch as it returns
INSERT INTO execution (statement_index, statement_text, status, metadata)
VALUES (5, 'parallel:a', 'completed', '{"parallel_id": "p1", "branch": "a"}');

-- When all branches complete, VM appends join record
INSERT INTO execution (statement_index, statement_text, status, metadata)
VALUES (5, 'parallel:', 'joined', '{"parallel_id": "p1"}');
```

**Append-only:** No UPDATEs to existing rows. Each event is a new INSERT.

---

## Loop Tracking

```sql
-- VM appends loop start
INSERT INTO execution (statement_index, statement_text, status, metadata)
VALUES (10, 'loop', 'started', '{"loop_id": "l1", "max": 5, "condition": "**complete**"}');

-- VM appends each iteration completion
INSERT INTO execution (statement_index, statement_text, status, metadata)
VALUES (10, 'loop', 'iteration', '{"loop_id": "l1", "iteration": 1}');

INSERT INTO execution (statement_index, statement_text, status, metadata)
VALUES (10, 'loop', 'iteration', '{"loop_id": "l1", "iteration": 2}');

-- VM appends exit
INSERT INTO execution (statement_index, statement_text, status, metadata)
VALUES (10, 'loop', 'exited', '{"loop_id": "l1", "iteration": 2, "reason": "condition_satisfied"}');
```

**Append-only:** Iterations are appended, not updated. Query `MAX(iteration)` to find current state.

---

## Error Handling

```sql
-- Append failure record
INSERT INTO execution (statement_index, statement_text, status, error_message, metadata)
VALUES (15, 'session "Risky"', 'failed', 'Connection timeout after 30s', '{}');

-- Append retry attempt
INSERT INTO execution (statement_index, statement_text, status, metadata)
VALUES (15, 'session "Risky"', 'retry', '{"attempt": 2, "max": 3}');

-- Append eventual success or final failure
INSERT INTO execution (statement_index, statement_text, status, metadata)
VALUES (15, 'session "Risky"', 'completed', '{"attempt": 2}');
```

**Append-only:** Each retry is a new record. Query for the latest status by statement_index.

---

## Large Outputs

When a binding value is too large for comfortable database storage (>100KB):

1. Write content to `attachments/{binding_name}.md`
2. Store the path in the `attachment_path` column
3. Leave `value` as a summary or null

```sql
INSERT INTO bindings (name, binding, value, attachment_path, source_statement)
VALUES (
  'full_report',
  'let',
  'Full analysis report (847KB) - see attachment',
  'attachments/full_report.md',
  'let full_report = session "Generate report with findings, evidence, and caveats"'
);
```

---

## Resuming Execution

To resume an interrupted run:

```sql
-- Find current position
SELECT statement_index, statement_text, status
FROM execution
WHERE status = 'executing'
ORDER BY id DESC LIMIT 1;

-- Get all completed bindings
SELECT name, binding, value, attachment_path FROM bindings;

-- Get agent memory states
SELECT name, memory FROM agents;

-- Check parallel block status
SELECT json_extract(metadata, '$.branch') as branch, status
FROM execution
WHERE json_extract(metadata, '$.parallel_id') IS NOT NULL
  AND parent_id = (SELECT id FROM execution WHERE status = 'executing' AND statement_text LIKE 'parallel:%');
```

---

## Flexibility Encouragement

Unlike filesystem state, SQLite state is intentionally **less prescriptive**. The core schema is a starting point. You are encouraged to:

- **Add columns** to existing tables as needed
- **Create extension tables** (prefix with `x_`)
- **Store custom metrics** (timing, token counts, model info)
- **Build indexes** for your query patterns
- **Use JSON functions** for semi-structured data

Example extensions:

```sql
-- Custom metrics table
CREATE TABLE x_metrics (
    execution_id INTEGER REFERENCES execution(id),
    metric_name TEXT,
    metric_value REAL,
    recorded_at TEXT DEFAULT (datetime('now'))
);

-- Add custom column
ALTER TABLE bindings ADD COLUMN token_count INTEGER;

-- Create index for common query
CREATE INDEX idx_execution_status ON execution(status);
```

The database is your workspace. Use it.

---

## Comparison with Other Modes

| Aspect | filesystem.md | in-context.md | sqlite.md |
|--------|---------------|---------------|-----------|
| **State location** | `.agents/prose/runs/{id}/` files | Conversation history | `.agents/prose/runs/{id}/state.db` |
| **Queryable** | Via file reads | No | Yes (SQL) |
| **Atomic updates** | No | N/A | Yes (transactions) |
| **Schema flexibility** | Rigid file structure | N/A | Flexible (add tables/columns) |
| **Resumption** | Read vm.log.md | Re-read conversation | Query database |
| **Complexity ceiling** | High | Low (<30 statements) | High |
| **Dependency** | None | None | sqlite3 CLI |
| **Status** | Stable | Stable | **Experimental** |

---

## Summary

SQLite state management:

1. Uses a **single database file** per run
2. Uses **append-only writes** for minimal token overhead
3. Provides **clear responsibility separation** between the Prose VM and spawned sessions
4. Enables **structured queries** for state inspection
5. Allows **flexible schema evolution** as needed
6. Requires the **sqlite3 CLI** tool
7. Is **experimental**—expect changes

The core contract: the Prose VM appends execution events (not updates); spawned sessions write their own outputs directly to the database. The conversation is primary state; the database is for persistence and inspection.
