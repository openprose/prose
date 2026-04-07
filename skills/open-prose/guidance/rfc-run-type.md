---
role: design-proposal
summary: |
  RFC: `run` as a first-class type in the OpenProse contract system.
  A run reference lets one program declare a dependency on a completed run,
  enabling provenance tracking, DAG reconstruction, fan-in composition,
  and staleness detection across agent workflows.
see-also:
  - ../prose.md: VM execution semantics (where run-type handling would be added)
  - ../forme.md: Wiring semantics (Forme needs to understand run-typed inputs)
  - ../state/filesystem.md: State management (state.md needs upstream: in header)
  - tenets.md: Design reasoning this proposal must respect
---

# RFC: `run` as a First-Class Type

## Status

Proposal (not yet implemented).

---

## Problem

When a program consumes the output of a prior run, it takes a path as a string:

```yaml
requires:
- run_path: path to a completed run directory
```

The VM sees a string. It does not know this string references a run. The dependency edge is invisible. Tonight we ran six programs -- three subject programs and three inspector meta-runs evaluating them -- and the resulting DAG exists nowhere:

```
customer-discovery -----> inspector
competitive-landscape --> inspector
grant-radar ------------> inspector
```

Each inspector received a `run_path` string. The VM bound it like any other input. No provenance was recorded. No tool can reconstruct the graph. The relationship between runs is lost the moment execution ends.

This is the same problem that Nix derivations, dbt's `ref()`, and Bazel's dependency graph solve for their respective domains: expensive computation produces persistent artifacts, and composition requires the system to understand the edges between them.

---

## Proposal

Introduce `run` as a value type in the contract system. Not a new component type (Tenet 7: two things, not three). Not a type annotation separate from the description (Tenet 17: no type/constraint separation). A `run` reference is a `requires` entry whose description the VM understands as pointing to a completed run.

---

## 1. The `run` Type in Contracts

A program declares a run dependency in its `requires`:

```yaml
requires:
- subject: run  # a single completed run to evaluate
```

For fan-in (consuming multiple runs):

```yaml
requires:
- runs: run[]  # multiple completed runs to synthesize over
```

The word after the colon -- `run` or `run[]` -- is the description. Per Tenet 17, the description IS the interface. The VM reads `subject: run` and understands this input must be a reference to a completed run directory, not an arbitrary string. Per Tenet 2, the VM resolves this by understanding, not by pattern matching on the word "run."

The caller provides the value as a run ID or path:

```bash
prose run std/evals/inspector -- subject: 20260406-201439-1a3369
prose run std/evals/inspector -- subject: .prose/runs/20260406-201439-1a3369
```

---

## 2. VM Behavior for `run`-Typed Inputs

When the VM binds a `run`-typed input during Step 2 (Bind Caller Inputs), it performs additional validation and bookkeeping beyond normal input binding:

### Validation

1. **Existence.** The referenced run directory must exist under `.prose/runs/`.
2. **Completion.** The run's `state.md` must contain a `---end` marker. An incomplete or failed run cannot be consumed as a `run` input. If the run ended with `---error`, the VM emits a warning but allows binding (an inspector may specifically want to evaluate a failed run).
3. **Structure.** The run directory must contain at minimum `state.md` and `program.md`. The VM does not require `manifest.md` (single-component programs skip Phase 1).

### Binding Format

The VM writes the run input to `bindings/caller/{name}.md` with structured metadata:

```markdown
# subject

kind: input
source: caller
type: run

---

run: 20260406-201439-1a3369
path: .prose/runs/20260406-201439-1a3369
program: customer-discovery
status: complete
```

The downstream service receives the path and can read the run's bindings, state, and manifest directly. The structured header gives the service immediate access to key metadata without traversing the filesystem.

### Provenance Recording

After binding, the VM records the upstream edge in this run's `state.md` header (see section 3).

---

## 3. State.md Provenance Header

The `state.md` header gains an optional `upstream:` field listing run IDs this run depends on:

```markdown
# run:20260407-031200-b7c4e2 inspector
upstream: [20260406-201439-1a3369]
program: std/evals/inspector

1-> [input] subject ✓
2-> evaluator ✓
---end 2026-04-07T03:15:44Z
```

For fan-in with multiple upstream runs:

```markdown
# run:20260407-040000-d9e8f7 calibrator
upstream: [20260406-201439-1a3369, 20260406-202015-c5d6e7, 20260406-203300-8f9a0b]
program: std/evals/calibrator

1-> [input] runs ✓
2-> analyzer ✓
3-> synthesizer ✓
---end 2026-04-07T04:12:33Z
```

The `program:` field records the program that produced this run. Combined with `upstream:`, this is sufficient to reconstruct the full DAG by walking `.prose/runs/`.

### Header Format

The state.md header is the block between the `#` heading and the first event marker:

```
# run:{id} {program-name}
upstream: [{comma-separated run IDs}]    # optional, present if run has run-typed inputs
program: {program path or name}          # the program that was executed

{event markers follow}
```

The `upstream:` field is omitted when a run has no `run`-typed inputs. The `program:` field is always present.

---

## 4. Fan-In Semantics

A program that consumes multiple runs declares `run[]`:

```yaml
requires:
- runs: run[]  # completed runs to synthesize over
```

The caller provides multiple run IDs:

```bash
prose run std/evals/calibrator -- runs: 20260406-201439-1a3369,20260406-202015-c5d6e7,20260406-203300-8f9a0b
```

The VM:

1. Validates each run independently (existence, completion, structure).
2. Writes a single binding file with all run references:

```markdown
# runs

kind: input
source: caller
type: run[]

---

- run: 20260406-201439-1a3369
  path: .prose/runs/20260406-201439-1a3369
  program: customer-discovery
  status: complete

- run: 20260406-202015-c5d6e7
  path: .prose/runs/20260406-202015-c5d6e7
  program: competitive-landscape
  status: complete

- run: 20260406-203300-8f9a0b
  path: .prose/runs/20260406-203300-8f9a0b
  program: grant-radar
  status: complete
```

3. Records all upstream IDs in the `upstream:` header of `state.md`.

Fan-in is the natural generalization. A calibrator that evaluates consistency across multiple inspections, a synthesizer that merges findings from independent research runs, a dashboard that aggregates metrics from a batch -- all are `run[]` consumers.

---

## 5. Staleness Detection

A run is stale when its source program has changed since the run was created.

### Detection Mechanism

Every run directory contains `program.md` -- a snapshot of the entry point at execution time (copied by Forme in Phase 1, or by the VM for single-component programs). Staleness is detected by comparing:

- `.prose/runs/{id}/program.md` (the snapshot)
- The current source file on disk

If they differ, the run is stale. The VM does not need to diff the files character by character -- it reads both and determines whether the program's semantics have changed. A whitespace change is not staleness. A changed `ensures` clause is.

### When Staleness Matters

Staleness is informational, not blocking. The VM reports it but does not refuse to use a stale run as input:

```
[Warning] Stale run: 20260406-201439-1a3369
  Program 'customer-discovery' has changed since this run.
  The run's outputs may not reflect the current program.
```

The caller decides whether to re-run or proceed. This respects Tenet 14 (the bitter lesson) -- a smarter model may determine that the changes are immaterial. The system provides the information; the intelligence (human or model) makes the judgment.

### `prose status` Integration

`prose status` can flag stale runs:

```
Recent runs:
  20260407-031200-b7c4e2  inspector          complete  2m ago
  20260406-203300-8f9a0b  grant-radar        complete  7h ago  [stale]
  20260406-202015-c5d6e7  competitive-landscape  complete  7h ago
  20260406-201439-1a3369  customer-discovery complete  8h ago  [stale]
```

---

## 6. Interaction with Existing Constructs

### Forme

When Forme wires a program and encounters a `run`-typed `requires` entry, it treats it as an **external input** -- satisfied by the caller, not by another service's `ensures`. No service in the dependency graph produces a `run`. The run already exists; it was produced by a prior execution.

In the manifest's Caller Interface:

```markdown
requires:
- subject (from user): run — a completed run to evaluate
```

Forme does not attempt to match `run`-typed requires against any service's ensures. This is not an unresolved dependency -- it is a caller-provided input, like a `question` or `topic`.

### Copy-on-Return

Unchanged. The `run` reference is an input, not an output. A program that consumes a run still produces its own outputs via the normal workspace-to-bindings copy mechanism. The run reference flows in; the program's findings, evaluations, or reports flow out.

### State.md

Two additions to the header format:
- `upstream:` -- list of run IDs this run depends on (present only when `run`-typed inputs exist)
- `program:` -- the program that produced this run (always present)

The event marker format is unchanged. The `---end` and `---error` terminators are unchanged.

### Nested Imports

A `run` reference is NOT a nested import. Nested imports (`imports/{handle}--{slug}/`) execute a program within the current run. A `run` reference points to a *completed* run -- an artifact that already exists on disk. The distinction:

| | Nested Import | Run Reference |
|---|---|---|
| **When it executes** | During this run | Already completed |
| **Where it lives** | `imports/` within this run | `.prose/runs/{id}/` (a sibling run) |
| **Relationship** | Parent-child (this run contains it) | Upstream-downstream (this run depends on it) |
| **Declared via** | `use` statement in execution block | `run` type in `requires` |

### Dependencies (deps.md)

No changes. `run` references are orthogonal to `use` statements. A `use` statement imports a program definition. A `run` reference points to a completed execution of a program. They operate at different levels: `use` is about code, `run` is about computation.

---

## 7. Examples

### Inspector Using `run` Type

The inspector evaluates a single completed run:

```markdown
---
name: inspector
kind: service
---

requires:
- subject: run

ensures:
- evaluation: assessment of the run's quality, contract satisfaction, and methodology
- score: numeric quality score 0-100 with breakdown by dimension

errors:
- unreadable-run: the run directory is corrupted or missing critical artifacts
```

Invocation:

```bash
prose run std/evals/inspector -- subject: 20260406-201439-1a3369
```

The VM validates the run, writes the structured binding, records the upstream edge, and spawns the inspector with access to the full run directory.

### Calibrator Using `run[]` for Fan-In

The calibrator evaluates consistency across multiple inspection runs:

```markdown
---
name: calibrator
kind: program
services: [analyzer, synthesizer]
---

requires:
- inspections: run[]

ensures:
- calibration-report: cross-run consistency analysis with variance metrics
```

```markdown
## analyzer

requires:
- inspections: completed inspection runs to compare

ensures:
- per-run-scores: extracted scores and dimensions from each inspection
- variance-matrix: score variance across runs by dimension
```

```markdown
## synthesizer

requires:
- per-run-scores: extracted scores from each run
- variance-matrix: where scores diverge

ensures:
- calibration-report: synthesis of consistency findings with recommendations
```

Invocation:

```bash
prose run std/evals/calibrator -- inspections: 20260407-031200-b7c4e2,20260407-031500-e3f4a5,20260407-032000-9b0c1d
```

### Program-Improver Consuming Both a Run and Its Inspection

A program-improver takes a subject run and its inspection, then suggests improvements to the source program:

```markdown
---
name: program-improver
kind: service
---

requires:
- subject: run       # the original program run
- inspection: run    # the inspector's evaluation of that run

ensures:
- improvements: specific, actionable changes to the source program
- diff: proposed edits in patch format
```

Invocation:

```bash
prose run std/evals/program-improver \
  -- subject: 20260406-201439-1a3369 \
  -- inspection: 20260407-031200-b7c4e2
```

The VM records both as upstream dependencies:

```markdown
# run:20260407-050000-a1b2c3 program-improver
upstream: [20260406-201439-1a3369, 20260407-031200-b7c4e2]
program: std/evals/program-improver
```

### `prose status --graph` Output

Walking all runs in `.prose/runs/` and reading each `state.md` header, the CLI can reconstruct and display the DAG:

```
$ prose status --graph

20260406-201439-1a3369  customer-discovery     complete  8h ago
20260406-202015-c5d6e7  competitive-landscape  complete  7h ago
20260406-203300-8f9a0b  grant-radar            complete  7h ago
  |                       |                      |
  v                       v                      v
20260407-031200-b7c4e2  inspector              complete  2h ago
20260407-031500-e3f4a5  inspector              complete  2h ago
20260407-032000-9b0c1d  inspector              complete  2h ago
  |
  v
20260407-050000-a1b2c3  program-improver       complete  15m ago
```

The graph is derived entirely from `upstream:` fields in `state.md`. No additional index or database is needed. The filesystem IS the graph.

---

## 8. Why Now

Three domains have independently invented "the computation is a trackable, composable thing":

**Build systems** (Nix, Bazel). A derivation is a function from inputs to outputs. The system tracks which derivations produced which artifacts. Rebuilds are triggered by input changes. The dependency graph is the core abstraction.

**Data pipelines** (dbt, Airflow). `ref('stg_orders')` tells dbt that this model depends on `stg_orders`. The system can then compute lineage, detect staleness, and orchestrate incremental runs. Before `ref()`, the SQL referenced tables by name -- the dependency was invisible to the tool.

**Agent workflows** (OpenProse). A program produces a run. Another program consumes that run. Today the dependency is a string path. The system cannot see the edge.

The pattern is identical each time: (1) computation is expensive, (2) results are persistent artifacts, (3) composition requires the system to understand the edges. The trigger is always the same -- someone tries to build a pipeline of computations and discovers the system cannot see the graph.

### What Is Genuinely Novel

Agent runs add a dimension that build systems and data pipelines lack: **the meta-computation is the same kind of thing as the computation**.

In Nix, a derivation that checks whether another derivation is up-to-date is not itself a derivation. In dbt, a test that validates a model is a different construct than a model. The inspector is a different thing than the thing it inspects.

In OpenProse, the inspector IS a Prose program. It produces a run. That run has bindings, state, a manifest. It can itself be inspected. The `program-improver` consumes both the original run and the inspection run -- and produces a third run that can be inspected in turn.

This self-similarity is not a design choice -- it is a consequence of the substrate. When computation and meta-computation are both LLM sessions producing artifacts on disk, there is no natural boundary between levels. The same primitive recurses at every layer. Deep DAGs emerge not by design but because there is no reason to stop.

The `run` type makes this recursion legible to the system. Without it, each layer is ad-hoc -- programs passing string paths, humans remembering which run was the input to which. With it, the system sees the full graph, from the leaf computation through every layer of evaluation and improvement.

---

## Proposed Spec Changes (Summary)

This RFC does NOT modify any existing spec files. If accepted, it would require changes to:

| File | Change |
|------|--------|
| `prose.md` | Add `run` type handling to Step 2 (Bind Caller Inputs): validation, structured binding format, provenance recording |
| `forme.md` | Add guidance for `run`-typed requires in auto-wiring: treat as external input, do not match against service ensures |
| `state/filesystem.md` | Add `upstream:` and `program:` to state.md header format; document the binding format for run-typed inputs |
| `prose.md` (CLI section) | Add `prose status --graph` command |

No changes to: `deps.md`, `primitives/session.md`, or the copy-on-return mechanism.
