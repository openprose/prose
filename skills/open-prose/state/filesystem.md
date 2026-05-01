---
role: file-system-state-management
summary: |
  File-system state management for OpenProse systems. Describes the directory
  structure, file formats, and protocols for the workspace/bindings model, manifest
  storage, and execution logging.
see-also:
  - ../prose.md: VM execution semantics
  - ../forme.md: Wiring semantics (produces the manifest)
  - ../primitives/session.md: Session context and compaction guidelines
---

# File-System State Management

This document describes how the OpenProse VM tracks execution state using files
under the active OpenProse root. Project, directory, and repository scoped work
uses `./.agents/prose/` at the repository root when one is known, otherwise the
current working directory. User or global scoped work uses `~/.agents/prose/`.

This file is the normative reference for filesystem artifact layout and file
formats. `prose.md` summarizes the same model from the execution algorithm's
point of view; when details differ, prefer this file for paths, ownership, and
serialization formats.

## Overview

File-based state persists all execution artifacts to disk. This enables:

- **Inspection**: See exactly what happened at each step, including intermediate work
- **Resumption**: Pick up interrupted systems from the last completed service
- **Debugging**: Trace through the manifest, workspace artifacts, and published bindings
- **Auditability**: Every service's full working state is preserved

**Key principle:** Files are inspectable artifacts. The directory structure IS the execution state.

---

## Directory Structure

```
# Project-level OpenProse root
.agents/prose/
├── src/                                    # Authored OpenProse source
│   ├── research-system/
│   │   ├── index.prose.md                  # Conventional multi-file system root
│   │   ├── researcher.prose.md
│   │   └── synthesizer.prose.md
│   ├── patterns/
│   │   └── worker-critic.prose.md
│   └── tests/
│       └── research-system.test.prose.md
├── runs/
│   └── {YYYYMMDD}-{HHMMSS}-{random}/
│       ├── manifest.run.md                     # Wiring graph, or minimal service manifest
│       ├── root.prose.md                         # Copy of the invoked service or system file
│       ├── sources/                        # Service, system, and pattern source files copied by Phase 1
│       │   ├── researcher.prose.md
│       │   ├── critic.prose.md
│       │   └── synthesizer.prose.md
│       ├── workspace/                      # Private working directories
│       │   ├── researcher/
│       │   │   ├── notes.md                # Intermediate scratch work
│       │   │   ├── raw-results.md          # Intermediate data
│       │   │   ├── findings.md             # Ensures output (working copy)
│       │   │   ├── sources.md              # Ensures output (working copy)
│       │   │   └── __delegate/             # Runtime delegation state (if any)
│       │   │       └── {delegate}/
│       │   │           ├── {id}.md          # Request payload
│       │   │           └── {id}-response.md # Response payload
│       │   ├── critic/
│       │   │   ├── evaluation.md
│       │   │   └── verdict.md
│       │   └── synthesizer/
│       │       └── report.md
│       ├── bindings/                       # Public outputs (copied from workspace)
│       │   ├── caller/                     # Caller-provided inputs
│       │   │   └── question.md
│       │   ├── researcher/                 # Researcher's published outputs
│       │   │   ├── findings.md
│       │   │   └── sources.md
│       │   ├── critic/
│       │   │   ├── evaluation.md
│       │   │   └── verdict.md
│       │   └── synthesizer/
│       │       └── report.md
│       ├── vm.log.md                        # Append-only execution log
│       └── agents/                         # Persistent agent memory
│           └── {name}/
│               ├── memory.md
│               ├── {name}-001.md
│               └── ...
├── agents/                                 # Project-scoped agent memory
│   └── {name}/
│       ├── memory.md
│       └── ...
├── deps/                                  # Cloned dependency repos (gitignored)
│   ├── github.com/
│   │   ├── openprose/
│   │   │   └── prose/                      # Full clone of github.com/openprose/prose
│   │   │       └── packages/
│   │   │           ├── std/
│   │   │           │   └── evals/
│   │   │           │       └── inspector.prose.md
│   │   │           └── co/
│   │   │               └── systems/
│   │   │                   └── company-repo-checker/
│   │   │                       └── index.prose.md
│   │   └── alice/
│   │       └── research/
│   │           └── ...
│   └── gitlab.com/
│       └── ...
├── prose.lock                             # Pinned dependency SHAs (committed to git)
└── .env                                   # Config (simple key=value format)

# User-level state (in home directory)
~/.agents/prose/
├── src/                                    # User/global scoped source
├── runs/                                  # User/global scoped run state
├── agents/                                # User-scoped agent memory (cross-project)
│   └── {name}/
│       ├── memory.md
│       └── ...
├── deps/                                  # User/global scoped dependency cache
├── prose.lock
└── .env
```

### Run ID Format

Format: `{YYYYMMDD}-{HHMMSS}-{random6}`

Example: `20260317-143052-a7b3c9`

### Segment Numbering

Agent segments use 3-digit zero-padded numbers: `captain-001.md`, `captain-002.md`, etc.

---

## The Three Directories

The core of Prose state management is the separation of three directories:

### `sources/` — Source Snapshots

Service, system, and pattern `*.prose.md` files copied by Forme during Phase 1. These are the definitions as they were at wiring time — stable snapshots even if source files change during execution.

**Written by:** Forme (Phase 1)
**Read by:** The VM when constructing session prompts
**Immutable during execution.**

### `workspace/` — Private Working State

One subdirectory per service. Each service writes all its work here — intermediate notes, drafts, scratch data, and final output files.

**Written by:** Subagents (each service writes to its own subdirectory)
**Read by:** The VM reads only two things from workspace: declared `ensures` outputs (to copy to bindings) and `__error.md` (to detect errors). No other files are inspected during execution. Everything is preserved for post-run debugging.

The workspace is the service's private sandbox. It can contain anything:

```
workspace/researcher/
├── search-log.md           # What searches were attempted
├── raw-results.md          # Unfiltered search results
├── filtered-results.md     # After relevance filtering
├── notes.md                # Scratch thinking
├── findings.md             # Final output (ensures)
└── sources.md              # Final output (ensures)
```

Only the files named in the manifest's `outputs` section get copied to `bindings/`.

### `bindings/` — Public Interface

One subdirectory per service (plus `caller/` for inputs). Contains only declared `ensures` outputs — the public interface that downstream services consume.

**Written by:** The VM (copies from workspace after each service completes)
**Read by:** Downstream subagents (via input file paths in the manifest)

```
bindings/
├── caller/
│   └── question.md         # Input from the user
├── researcher/
│   ├── findings.md         # Copied from workspace/researcher/findings.md
│   └── sources.md          # Copied from workspace/researcher/sources.md
├── critic/
│   └── evaluation.md       # Copied from workspace/critic/evaluation.md
└── synthesizer/
    └── report.md           # Copied from workspace/synthesizer/report.md
```

---

## File Formats

### `manifest.run.md`

The wiring graph produced by Forme. See `forme.md` for the full format specification. Contains:

- Caller interface (requires/returns)
- Per-service entries (source, workspace, inputs with `←` mappings, outputs)
- Execution order with parallelization notes
- Warnings

**Written by:** Forme (Phase 1)
**Read by:** The VM (Phase 2)

### Caller Input Files

**Path:** `bindings/caller/{name}.md`

```markdown
# question

binding: input
source: caller

---

What are the latest developments in quantum computing?
```

**Written by:** The VM at system start (from CLI args, config, or user prompt)

#### Run-Typed Inputs

When a `requires` entry has type `run` or `run[]`, the VM writes a structured binding with metadata instead of a plain value.

For a single `run`:

```markdown
# subject

binding: input
source: caller
type: run

---

run: 20260406-201439-1a3369
path: .agents/prose/runs/20260406-201439-1a3369
root: customer-discovery
status: complete
```

For `run[]`:

```markdown
# runs

binding: input
source: caller
type: run[]

---

- run: 20260406-201439-1a3369
  path: .agents/prose/runs/20260406-201439-1a3369
  root: customer-discovery
  status: complete

- run: 20260407-031438-bf26a3
  path: .agents/prose/runs/20260407-031438-bf26a3
  root: competitive-landscape
  status: complete
```

The downstream service receives the path and can read the run's bindings, `vm.log.md`, and `manifest.run.md` directly. The structured header gives the service immediate access to key metadata without traversing the filesystem.

**Resolution order for run references:**

- Bare ID (e.g., `20260406-201439-1a3369`): resolves to `.agents/prose/runs/{id}`
- `~/{id}`: resolves to `~/.agents/prose/runs/{id}` (user scope)
- Absolute path: used as-is

**Written by:** The VM at binding time (before service execution begins)

### Service Output Files

**Path:** `workspace/{service}/{output-name}.md` (working copy)
**Path:** `bindings/{service}/{output-name}.md` (published copy)

Output files are simple Markdown — just the content. No special frontmatter required:

```markdown
# Findings

## Claim 1: Transformer architectures dominate NLP benchmarks
- Source: arxiv.org/abs/1706.03762
- Confidence: 0.95

## Claim 2: Scaling laws predict performance from compute
- Source: arxiv.org/abs/2001.08361
- Confidence: 0.88
```

**Written by:** Subagent (to workspace). VM copies to bindings.

### Error Files

**Path:** `workspace/{service}/__error.md`

```markdown
# Error: no-results

No relevant sources found for the topic.

Searched:
- Google Scholar: 0 relevant results
- arXiv: 2 results, both tangential

Partial data: None available.
```

The `__` prefix signals to the VM that this is an error, not a regular output.

**Written by:** Subagent (when it cannot satisfy ensures)

---

## `vm.log.md` — Append-Only Execution Log

`vm.log.md` is an **append-only log** of execution events. The VM appends entries as execution progresses.

**Only the VM writes this file.** Subagents never modify `vm.log.md`.

### Format

```markdown
# run:20260317-143052-a7b3c9 deep-research
upstream: [20260306-112233-f4a5b6]     # optional — present when run has run-typed inputs
root: research/deep-research          # always present — the invoked service or system file

1→ [input] question ✓
2→ researcher ✓
3→ ∥start critic,fact-checker
3a→ critic ✓
3b→ fact-checker ✓
3→ ∥done
4→ synthesizer ✓
---end 2026-03-17T14:35:22Z
```

The header is the block between the `#` heading and the first event marker:

- `upstream:` is written once at binding time, before service execution begins. Omitted when the run has no `run`-typed inputs.
- `root:` is always present — the invoked service or system file.
- On resumption, the VM reads these as context but does not re-process them.

### Event Markers

| Marker | Meaning | Example |
|--------|---------|---------|
| `N→ [input] name ✓` | Caller input bound | `1→ [input] question ✓` |
| `N→ service ✓` | Service completed, outputs copied to bindings | `2→ researcher ✓` |
| `N→ ∥start a,b` | Parallel services started | `3→ ∥start critic,fact-checker` |
| `Na→ a ✓` | Parallel service completed | `3a→ critic ✓` |
| `N→ ∥done` | All parallel services complete | `3→ ∥done` |
| `N→ service ✗ error-name` | Service signaled an error | `3→ researcher ✗ no-results` |
| `N→ service ⇒ delegate (delegate: {id})` | Service yielded to a runtime delegate | `4→ server ⇒ synthesizer (delegate: req-001)` |
| `N→   delegate ✓` | Runtime delegate completed | `4→   synthesizer ✓` |
| `N→ service ⟳ (resumed)` | Service resumed after delegation | `4→ server ⟳ (resumed)` |
| `N→ [eval] assertion ✓` | Test assertion passed | `5→ [eval] assertion ✓` |
| `N→ [eval] assertion ✗` | Test assertion failed | `5→ [eval] assertion ✗` |
| `---test PASS` | Test passed (all assertions satisfied) | `---test PASS` |
| `---test FAIL (N/M assertions)` | Test failed | `---test FAIL (2/3 assertions)` |
| `---end TIMESTAMP` | System completed | `---end 2026-03-17T14:35:22Z` |
| `---error TIMESTAMP msg` | System failed | `---error 2026-03-17T... no-results` |

### When the VM Writes

| Event | Action |
|-------|--------|
| Caller input bound | Append input marker |
| Service completes | Append completion marker |
| Parallel starts/joins | Append parallel markers |
| Error occurs | Append error marker |
| Delegation spawned | Append `⇒` marker |
| Delegate completes | Append delegate `✓` marker |
| Service resumed | Append `⟳` marker |
| System ends | Append end marker |

The VM does NOT rewrite the entire file. Each write is a single line append.

### Resumption

To resume an interrupted run:

1. Read `vm.log.md` — find the last completed service
2. Read `manifest.run.md` — get the execution order
3. Scan `bindings/` — confirm existing outputs
4. Continue from the next service in execution order

---

## Who Writes What

| Artifact | Written By | When |
|----------|------------|------|
| `manifest.run.md` | Forme for systems; VM for single-service runs | Before execution |
| `root.prose.md` | Forme for systems; VM for single-service runs | Before execution |
| `sources/*.prose.md` | Forme for systems; VM for single-service runs | Before execution |
| `bindings/caller/*.md` | VM | At system start |
| `bindings/caller/*.md` (run-typed) | VM | At binding time (before service execution) |
| `workspace/{service}/*` | Subagent | During service execution |
| `workspace/{service}/__delegate/{delegate}/{id}.md` | Subagent | Before delegation yield |
| `workspace/{service}/__delegate/{delegate}/{id}-response.md` | VM | After delegate completes |
| `bindings/{service}/*` | VM (copy from workspace) | After service completes |
| `vm.log.md` | VM | After each event |
| `agents/{name}/memory.md` | Persistent agent | During service execution |
| `agents/{name}/{name}-NNN.md` | Persistent agent | During service execution |

**Key principle:** The VM orchestrates and copies. Subagents write their own outputs to workspace. The VM publishes them to bindings. The VM never reads full output content — it tracks file paths and copies files.

---

## The Copy-on-Return Protocol

This is the core mechanism of Prose state management. When a service completes:

1. **Service writes** all its work to `workspace/{service}/`
2. **Service returns** a confirmation message listing its output files
3. **VM verifies** the listed outputs exist in workspace
4. **VM copies** each declared `ensures` output:
   `workspace/{service}/{output}.md` → `bindings/{service}/{output}.md`
5. **VM appends** completion marker to `vm.log.md`

The copy is the "publish" step. Before the copy, the output exists only in the service's private workspace. After the copy, it's available to downstream services via `bindings/`.

If the service wrote `__error.md` instead:

1. **VM reads** `workspace/{service}/__error.md`
2. **VM checks** for conditional ensures clauses in the system
3. **VM either** handles the degraded case or propagates the error
4. **VM appends** error marker to `vm.log.md`

---

## Agent Memory Files

### `agents/{name}/memory.md`

The agent's current accumulated state:

```markdown
# Agent Memory: captain

## Current Understanding

The project is implementing a research pipeline for quantum computing.
Researcher produces good breadth but sometimes lacks depth on subtopics.

## Decisions Made

- 2026-03-17: Approved initial research scope, flagged need for deeper source verification
- 2026-03-17: Set confidence threshold at 0.7 for claim inclusion

## Open Concerns

- Source diversity is low — too many arXiv papers, not enough industry reports
```

### `agents/{name}/{name}-NNN.md`

Prior segment records:

```markdown
# Segment 001

timestamp: 2026-03-17T14:32:15Z

## Summary

- Reviewed: researcher output (findings.md, sources.md)
- Found: 12 claims extracted, 3 below confidence threshold
- Decided: Accept 9 claims, request broader source search for rejected 3
- Next: Review critic evaluation, verify source diversity improved
```

### Memory Scoping

| Scope | Declaration | Path | Lifetime |
|-------|-------------|------|----------|
| Execution (default) | `### Runtime` with `persist: true` | `.agents/prose/runs/{id}/agents/{name}/` | Dies with run |
| Project | `### Runtime` with `persist: project` | `.agents/prose/agents/{name}/` | Survives runs |
| User | `### Runtime` with `persist: user` | `~/.agents/prose/agents/{name}/` | Survives projects |

---

## `.agents/prose/.env`

Simple key=value configuration:

```env
OPENPROSE_DEFAULT_MODEL=opus
OPENPROSE_MAX_PARALLEL=5
```

---

## Nested System Imports

When a system imports and invokes another system (via installed dependency or
local file), the imported system runs in its own subdirectory:

```
.agents/prose/runs/{id}/imports/{handle}--{slug}/
├── manifest.run.md
├── root.prose.md
├── sources/
├── workspace/
├── bindings/
├── vm.log.md
├── imports/                    # Further nesting
│   └── ...
└── agents/
```

Same structure recursively, enabling unlimited nesting depth.

---

## Summary

Prose file-system state management is built on three directories:

1. **`sources/`** — immutable source snapshots (what was wired)
2. **`workspace/`** — private working state (how each service did its work)
3. **`bindings/`** — public interface (what each service produced)

The manifest defines the graph. The VM walks it. Services write to workspace. The VM copies ensures outputs to bindings. `vm.log.md` logs every event. Everything is on disk, everything is inspectable.
