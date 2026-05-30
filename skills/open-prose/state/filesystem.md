---
role: file-system-state-management
summary: |
  File-system state management for OpenProse. The normative reference for the
  canonical world-model artifact layout, deterministic serialization, the
  append-only receipt ledger, and the workspace (private scratch) vs published
  (canonical truth) discipline.
see-also:
  - ../prose.md: VM execution semantics + the render harness seam
  - ../forme.md: Wiring semantics (produces the topology world-model)
  - ../primitives/session.md: Session context and compaction guidelines
---

# File-System State Management

This document describes how the OpenProse VM tracks execution state using files
under `<openprose-root>`. Native repositories use the repository root as
`<openprose-root>`. Attached repositories use `repo/.agents/prose`. User-global
work uses `~/.agents/prose`.

This file is the normative reference for filesystem artifact layout and file
formats. `prose.md` summarizes the same model from the execution algorithm's
point of view; when details differ, prefer this file for paths, ownership, and
serialization formats.

## Overview

File-based state persists all execution artifacts to disk. This enables:

- **Inspection**: See exactly what happened at each step, including intermediate work
- **Resumption**: Pick up interrupted runs from the last completed receipt
- **Debugging**: Trace through the compiled intent, workspace scratch, and the published world-model
- **Auditability**: The append-only receipt ledger chains every commit; the world-model is content-addressed and diffable

**Key principle:** Files are inspectable artifacts. The directory structure IS the execution state.

**The load-bearing distinction** (`world-model.md` §1): a node's **published**
world-model is the canonical, deterministically-serialized, fingerprinted
artifact — the truth downstreams subscribe to. The render's **workspace** is
private scratch — intermediate reasoning, working notes — and is **never
fingerprinted and never subscribed to**. This is *not* mere output-visibility
(the pre-reactor `workspace/`→`bindings/` distinction): it is
fingerprint-materiality. A node updates its published world-model only when
something semantically material actually changed; immaterial churn stays in the
workspace. SQL/vector indices are **derived projections** of the canonical
artifact, never the truth.

---

## Directory Structure

```
# <openprose-root>
├── src/                                    # Authored OpenProse source
│   ├── research-system/
│   │   ├── index.prose.md                  # Conventional multi-file system root
│   │   ├── researcher.prose.md
│   │   └── synthesizer.prose.md
│   ├── patterns/
│   │   └── worker-critic.prose.md
│   └── tests/
│       └── research-system.test.prose.md
├── dist/                                   # Compiled intent (topology WM + canonicalizers + validators)
│   ├── intent.next.json                    # Newly compiled, pending activation
│   └── intent.active.json                  # Currently active compiled intent
├── runs/
│   └── {YYYYMMDD}-{HHMMSS}-{random}/
│       ├── compiled-intent.json            # Topology world-model + canonicalizers + validators (snapshot)
│       ├── root.prose.md                   # Copy of the invoked source file
│       ├── sources/                        # Source files copied at compile time
│       │   ├── researcher.prose.md
│       │   ├── critic.prose.md
│       │   └── synthesizer.prose.md
│       ├── workspace/                      # Private render scratch — NEVER fingerprinted, NEVER subscribed to
│       │   ├── researcher/
│       │   │   ├── notes.md                # Intermediate scratch work
│       │   │   ├── raw-results.md          # Intermediate data (e.g. raw poll w/ fetched_at)
│       │   │   └── __delegate/             # Runtime delegation state (if any)
│       │   │       └── {delegate}/
│       │   │           ├── {id}.md          # Request payload
│       │   │           └── {id}-response.md # Response payload
│       │   ├── critic/
│       │   │   └── evaluation.md
│       │   └── synthesizer/
│       │       └── report.md
│       ├── world-model/                    # Published canonical truth (one per node) — deterministically serialized + fingerprinted
│       │   ├── caller/                     # Caller-provided inputs (gateway-style)
│       │   │   └── question.md
│       │   ├── researcher/                 # Researcher's published world-model artifact
│       │   │   ├── findings.md
│       │   │   ├── sources.md
│       │   │   └── .version                # ContentAddress of this committed version
│       │   ├── critic/
│       │   │   ├── evaluation.md
│       │   │   └── .version
│       │   └── synthesizer/
│       │       ├── report.md
│       │       └── .version
│       ├── receipts/                       # Append-only receipt ledger (one chain per node)
│       │   ├── researcher.jsonl            # Receipt chain (prev pointers); status/fingerprints/wake/cost
│       │   ├── critic.jsonl
│       │   └── synthesizer.jsonl
│       ├── vm.log.md                        # Append-only human-readable execution log
│       └── agents/                         # Run-scoped agent memory
│           └── {name}/
│               ├── memory.md
│               ├── {name}-001.md
│               └── ...
├── state/                                  # Durable cross-run state
│   ├── agents/
│   │   └── {name}/
│   │       ├── memory.md
│   │       └── ...
│   └── world-model/                        # Durable per-node canonical truth (survives runs)
│       └── {node}/
│           ├── published/                  # Current committed canonical artifact
│           ├── versions/                   # Content-addressed prior versions ({ContentAddress})
│           └── receipts.jsonl              # The node's durable receipt ledger
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

# User-global OpenProse root
~/.agents/prose/
├── src/                                    # User/global scoped source
├── runs/                                  # User/global scoped run state
├── state/                                 # User-global durable cross-run state
│   ├── agents/
│   └── world-model/
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
**`sources/`** (immutable compiled snapshots), **`workspace/`** (private,
never-fingerprinted render scratch), and **`world-model/`** (the published,
deterministically-serialized, fingerprinted canonical truth).

### `sources/` — Source Snapshots

`*.prose.md` files copied at compile time. These are the definitions as they were at compile time — stable snapshots even if source files change during execution.

**Written by:** the compile phase
**Read by:** The VM when constructing render prompts
**Immutable during execution.**

### `workspace/` — Private Render Scratch

One subdirectory per node. The render writes all its working state here — intermediate notes, drafts, raw poll data, scratch reasoning.

**Written by:** the render (each node writes to its own subdirectory)
**Read by:** only the render that owns it, and the VM for `__error.md`. **Never fingerprinted, never subscribed to.** Everything is preserved for post-run debugging.

The workspace is the render's private sandbox. Critically, **immaterial churn lives and dies here**: a re-poll that only bumps a `fetched_at` timestamp writes to workspace, the canonicalizer drops the immaterial field, the fingerprint does not move, and nothing reaches the published truth. It can contain anything:

```
workspace/researcher/
├── search-log.md           # What searches were attempted
├── raw-results.md          # Unfiltered search results (may carry fetched_at, request ids)
├── filtered-results.md     # After relevance filtering
└── notes.md                # Scratch thinking
```

### `world-model/` — Published Canonical Truth

One subdirectory per node (plus `caller/` for external/caller inputs). The node's **maintained truth** — a content-addressable artifact (a directory by default), the public interface downstream nodes subscribe to.

**Written by:** the VM via `commit_world_model`, on a `rendered` receipt with a moved fingerprint (the **canonical-serialization-before-fingerprint pass**, below).
**Read by:** downstream renders — by reference, at a pinned content-addressed version (never inlined into context).

```
world-model/
├── caller/
│   └── question.md         # External/caller input (gateway-style node)
├── researcher/
│   ├── findings.md         # Published, structured, canonicalizable truth
│   ├── sources.md
│   └── .version            # ContentAddress of this committed version
└── synthesizer/
    ├── report.md
    └── .version
```

Note: `report.md` here is the *structured* truth that backs the fingerprint.
Free-form rendered prose is a **derived projection excluded from the
fingerprint** (`world-model.md` §3, the structured-backing rule) — otherwise an
LLM re-rendering the same paragraph hashes differently every time and falsely
re-triggers downstreams. Fingerprint the structured truth; render prose *from* it.

#### Faceted layout — one subtree per facet

When a node's `### Maintains` declares facets by **naming the parts** (a `####`
sub-heading inside `### Maintains` *is* a facet — the named-parts rule,
`delta.md` Part G; `world-model.md` §3, "Declaring facets"), the published
artifact lays each facet out as its own subtree under the node directory:
`published/<facet>/…`. The directory structure *is* the subscription surface —
the same name is the facet's fingerprint unit, its
`Requires.<facet>` ↔ `Maintains.<facet>` subscription symbol, and its on-disk
region. The canonical `competitor-activity-monitor` example
(`examples/competitor-activity/`) declares `#### funding`, `#### hiring`, and
`#### product-launches`, so its published artifact is:

```
world-model/
└── competitor-activity-monitor/
    ├── competitors.md          # shared, un-facetted fields (name, last_corroborated)
    ├── published/
    │   ├── funding/            # #### funding facet subtree
    │   │   └── events.md       # structured funding events (round, amount, date)
    │   ├── hiring/             # #### hiring facet subtree
    │   │   └── roles.md        # department set + open-role count
    │   └── product-launches/   # #### product-launches facet subtree
    │       └── launches.md     # launch set + shipped status
    └── .version                # ContentAddress of this committed version
```

**The fingerprinting rule with facets** (`world-model.md` §3; the
canonical-serialization pass below):

- The **atomic `@atomic` token is computed over the whole `published/` tree** —
  every facet subtree plus the shared un-facetted fields — and is always emitted.
  It is the diamond-reconvergence primitive and the free default.
- Each declared facet additionally emits **one token computed over only its
  subtree's material content**. A downstream that `### Requires` `funding` and
  resolves to `#### funding` subscribes to that facet's token: a move in
  `published/hiring/` advances the `hiring` token and the `@atomic` token but
  **not** the `funding` token, so the funding-only subscriber does not wake (the
  selector boundary, `world-model.md` §3).
- Shared un-facetted fields (here `competitors.md`'s `name` /
  `last_corroborated`) sit *outside* any `published/<facet>/` subtree, so they
  move only the `@atomic` token.

Atomic-only nodes (no `####` parts) keep the flat layout above — facets are
purely additive, and the `@atomic` token over the whole artifact is unchanged.
Correctness holds either way (the canonicalizer fingerprints over normalized
paths regardless); the subtree layout is what makes "the directory *is* the
state" literally true for a faceted node.

---

## The Canonical-Serialization-Before-Fingerprint Pass

This is the pass the old `workspace/`→`bindings/` copy lacked. Publishing a
node's world-model is **not a dumb file copy**; it is *serialize canonically →
canonicalize (drop immaterial) → fingerprint → sign receipt*:

1. **Collect** the node's published artifact files from its commit set.
2. **Canonically serialize** the artifact deterministically: stable file
   ordering (sorted by normalized path), path/encoding normalization, and
   sorted-key JSON for any structured records (reuses the receipt's canonical-JSON
   machinery). The same byte sequence must result regardless of write order or
   filesystem enumeration order (`architecture.md` §5.2, §10).
3. **Apply the compiled canonicalizer** for this node (`### Maintains`
   canonicalization spec, frozen at compile time): drop immaterial fields
   (`fetched_at`, request ids, cosmetic ordering), normalize sets/numbers/text to
   declared tolerances. This yields the **canonical (material) form**.
4. **Fingerprint** = a plain digest over the canonical material form, producing
   the `FingerprintMap` — the atomic `@atomic` token (over the whole `published/`
   tree) always, plus one token per declared facet (over only that
   `published/<facet>/` subtree's material content; see *Faceted layout* above).
5. **Compare** against the node's prior receipt `fingerprints`. If nothing moved,
   write a `skipped` receipt (unchanged fingerprints copied forward, empty
   `semantic_diff`, zero `cost`) and **publish nothing new**. If a fingerprint
   moved, write the canonical artifact to `world-model/{node}/`, stamp its
   `.version` with the content address, and emit a `rendered` receipt carrying the
   new `fingerprints`.

The reconciler's wake decision is this fingerprint comparison — deterministic,
total, no LLM. **Only a `rendered` receipt with a moved fingerprint propagates to
downstreams** (`world-model.md` §8).

---

## File Formats

### Compiled Intent

The compile-phase output. For filesystem runs it may be snapshotted as
`compiled-intent.json`. See `forme.md` and the compiler IR for the full format.
Contains:

- the **topology world-model** (Forme's output): `nodes` (declared contracts),
  `edges` (resolved subscriptions: `subscriber.Requires.<facet>` →
  `producer.Maintains.<facet>`), `entry_points`, and `acyclic: true`
- per-node **canonicalizers** (the frozen `### Maintains` canonicalization spec)
- per-node **postcondition validators** (`deterministic` | `render-attested`)
- `contract_fingerprints` frozen at compile

**Written by:** the compile phase (Forme + canonicalizer-compile + postcondition-compile)
**Read by:** the run phase (the reconciler resolves propagation targets from `edges`)

### Caller / Gateway Input Files

**Path:** `world-model/caller/{name}.md`

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
path: <openprose-root>/runs/20260406-201439-1a3369
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
  path: <openprose-root>/runs/20260406-201439-1a3369
  root: customer-discovery
  status: complete

- run: 20260407-031438-bf26a3
  path: <openprose-root>/runs/20260407-031438-bf26a3
  root: competitive-landscape
  status: complete
```

The downstream render receives the path and can read the run's published
`world-model/`, `receipts/`, `vm.log.md`, and compiled intent directly. The
structured header gives the render immediate access to key metadata without
traversing the filesystem.

**Resolution order for run references:**

- Bare ID (e.g., `20260406-201439-1a3369`): resolves to `<openprose-root>/runs/{id}`
- `~/{id}`: resolves to `~/.agents/prose/runs/{id}` (user scope)
- Absolute path: used as-is

**Written by:** The VM at binding time (before service execution begins)

### World-Model Artifact Files

**Path:** `workspace/{node}/{name}.md` (private render scratch — never fingerprinted)
**Path:** `world-model/{node}/{name}.md` (published canonical truth — fingerprinted)

Artifact files are simple Markdown — just the structured content. No special frontmatter required:

```markdown
# Findings

## Claim 1: Transformer architectures dominate NLP benchmarks
- Source: arxiv.org/abs/1706.03762
- Confidence: 0.95

## Claim 2: Scaling laws predict performance from compute
- Source: arxiv.org/abs/2001.08361
- Confidence: 0.88
```

**Written by:** the render (to workspace). The VM commits the published artifact via
`commit_world_model` — *serialize canonically → canonicalize → fingerprint → sign* — and
publishes only when a fingerprint moved.

### Error Files

**Path:** `workspace/{node}/__error.md`

```markdown
# Error: no-results

No relevant sources found for the topic.

Searched:
- Google Scholar: 0 relevant results
- arXiv: 2 results, both tangential

Partial data: None available.
```

The `__` prefix signals to the VM that this is an error, not a committed artifact.

**Written by:** the render (when it cannot satisfy its `### Maintains`). Triggers a `failed` receipt; nothing commits, no fingerprint moves.

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
| `N→ node ✓ rendered` | Render committed a moved world-model | `2→ researcher ✓ rendered` |
| `N→ node ∅ skipped` | Reconciler skipped: no fingerprint moved | `2→ researcher ∅ skipped` |
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

1. Read the `receipts/` ledger — the append-only chain is the source of truth; find the last committed receipt per node
2. Read the compiled intent — get the topology and propagation edges
3. Scan `world-model/` — confirm published canonical artifacts (and their `.version`)
4. Re-derive reconciler dirty/coalesce state from unconsumed upstream receipts and continue (`architecture.md` §8)

---

## Who Writes What

| Artifact | Written By | When |
|----------|------------|------|
| compiled intent | the compile phase | Before execution |
| `root.prose.md` | the compile phase | Before execution |
| `sources/*.prose.md` | the compile phase | Before execution |
| `world-model/caller/*.md` | VM | At entry / gateway boot |
| `workspace/{node}/*` | the render | During the render |
| `workspace/{node}/__delegate/{delegate}/{id}.md` | the render | Before delegation yield |
| `workspace/{node}/__delegate/{delegate}/{id}-response.md` | VM | After delegate completes |
| `world-model/{node}/*` + `.version` | VM (`commit_world_model`) | On a `rendered` receipt with a moved fingerprint |
| `receipts/{node}.jsonl` | VM | After each render or skip |
| `vm.log.md` | VM | After each event |
| `runs/{id}/agents/{name}/memory.md` | Execution-scoped agent | During the render |
| `runs/{id}/agents/{name}/{name}-NNN.md` | Execution-scoped agent | During the render |
| `state/agents/{name}/memory.md` | Durable cross-run agent | During the render |
| `state/agents/{name}/{name}-NNN.md` | Durable cross-run agent | During the render |
| `state/world-model/{node}/published/` + `versions/` + `receipts.jsonl` | VM | On durable commit |

**Key principle:** The VM orchestrates. The render writes its working state to its
private workspace. The VM publishes the canonical world-model via the
canonical-serialization-before-fingerprint pass and signs a receipt — never a dumb copy.

---

## The Commit-and-Sign Protocol

This replaces the old copy-on-return for nodes. When a render completes:

1. **The render writes** all its working state to `workspace/{node}/`.
2. **The render returns** a confirmation listing its committed artifact files and
   attesting its `### Maintains` postconditions (no separate judge beat).
3. **The VM runs the canonical-serialization-before-fingerprint pass**
   (serialize canonically → apply the compiled canonicalizer → fingerprint).
4. **The VM compares** the new `FingerprintMap` against the node's prior receipt.
   - *No fingerprint moved* → write a `skipped` receipt (unchanged fingerprints
     copied forward, empty `semantic_diff`, zero `cost`); publish nothing.
   - *A fingerprint moved* → write the canonical artifact to `world-model/{node}/`,
     stamp `.version`, and emit a `rendered` receipt with the new `fingerprints`.
5. **The VM appends** the receipt to `receipts/{node}.jsonl` (with its `prev`
   pointer) and a marker to `vm.log.md`.

Publishing is *write world-model + sign receipt*. Only a `rendered` receipt with a
moved fingerprint propagates to downstreams.

If the render wrote `__error.md` instead:

1. **VM reads** `workspace/{node}/__error.md`
2. **VM emits a `failed` receipt** — a failed render commits nothing; the prior
   world-model stands and no fingerprint moves (`architecture.md` §8: failure = no-commit)
3. **VM appends** error marker to `vm.log.md`

---

## Agent Memory Files

Agent memory lives under `runs/{id}/agents/{name}/` for execution-scoped
sessions and under `state/agents/{name}/` for durable cross-run sessions.

### `{agent-scope}/{name}/memory.md`

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

### `{agent-scope}/{name}/{name}-NNN.md`

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
| Execution (default) | `### Runtime` with `persist: true` | `<openprose-root>/runs/{id}/agents/{name}/` | Dies with run |
| Project | `### Runtime` with `persist: project` | `<openprose-root>/state/agents/{name}/` | Survives runs |
| User | `### Runtime` with `persist: user` | `~/.agents/prose/state/agents/{name}/` | Survives projects |

---

## `<openprose-root>/.env`

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
<openprose-root>/runs/{id}/imports/{handle}--{slug}/
├── compiled-intent.json
├── root.prose.md
├── sources/
├── workspace/
├── world-model/
├── receipts/
├── vm.log.md
├── imports/                    # Further nesting
│   └── ...
└── agents/
```

Same structure recursively, enabling unlimited nesting depth.

---

## Summary

Prose file-system state management separates **private scratch** from
**published, fingerprinted truth**:

1. **`sources/`** — immutable source snapshots (what was compiled)
2. **`workspace/`** — private render scratch (how a node did its work) — **never fingerprinted, never subscribed to**
3. **`world-model/`** — the published canonical truth per node (deterministically serialized + fingerprinted) — what downstreams subscribe to
4. **`receipts/`** — the append-only receipt ledger (the source of truth for reconciler state)

The compiled intent defines the topology. The reconciler walks it by comparing
fingerprints — deterministic, total, no LLM. The render writes to workspace. The
VM commits the canonical world-model through the
canonical-serialization-before-fingerprint pass and signs a receipt — never a
dumb copy. SQL/vector indices, when present, are **derived projections** of the
canonical truth (`world-model.md` §1). Everything is on disk, everything is
inspectable, everything is auditable through the signed receipt chain.
