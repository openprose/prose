---
name: program-improver
kind: test
---

# Program Improver

Given an inspection result and source snapshot, propose minimal improvements to
an OpenProse component or package. This eval improves agent outcome programs
using run-store evidence without depending on a particular host filesystem
layout.

### Requires

- `inspection`: Json<RunInspection> - inspector output for the problematic run
- `source_tree`: Json<SourceTree> - source files or package IR relevant to the inspected component

### Ensures

- `improvements`: Json<ProgramImprovements> - ranked improvement proposals containing:
  - passed: boolean
  - score: 0-1 confidence in the proposed improvement set
  - verdict: "pass", "partial", or "fail"
  - proposals: ordered list with category, evidence, affected file, diff, risk, and verification
  - rejected_options: alternatives considered and why they were not chosen
  - follow_up_evals: eval refs that should run after applying the proposals

### Effects

- `pure`: deterministic evaluation over declared inspection and source inputs

### Errors

- missing-inspection: inspection is absent or lacks flags/evidence
- missing-source-tree: source tree does not include the inspected component
- unsafe-diff: a proposed diff cannot be scoped to the supplied source files

### Invariants

- proposals are minimal and independently reviewable
- each proposal cites both inspection evidence and a specific source location
- no proposal changes runtime/provider semantics to compensate for a source contract problem

### Execution

```prose
Read the inspection's flags, scores, evidence, acceptance summary, and subject run
id. Read `source_tree` as the canonical source snapshot: `.prose.md` files,
package metadata, schemas, examples, eval links, and package IR when available.

Classify issues into contract shape, port typing, effect declaration, dependency
wiring, acceptance policy, eval coverage, artifact schema, or source ergonomics.
Prefer changes to the author-owned component when inspection evidence indicates
bad source. Escalate runtime, provider, or store issues only when the inspection
shows the source contract was sound.

Generate focused diffs with verification commands. The output must remain JSON
so package tooling can surface, rank, and optionally apply proposals in a review
workflow.
```
