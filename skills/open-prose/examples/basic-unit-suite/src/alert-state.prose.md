---
name: alert-state
kind: responsibility
---

# Alert State

> Maps the `CountSummary` onto a discrete alert status. It is the node that
> demonstrates **failure containment** (U10): when a render fails, the prior valid
> `AlertState` remains the active world-model and no downstream node consumes a
> partial output.

### Requires

- `CountSummary`: the structured summary. *(Maintained by `count-summary`.)*

`alert-state` is **input-driven** off the summary.

### Maintains

The `AlertState` world-model.

- `status` — one of `quiet | warn | alert`.
- `threshold` — the crossing threshold in force.
- `evidence_refs` — the upstream receipts this status rests on.

**Postcondition:** `status` is `alert` iff `CountSummary.threshold_crossed`, `warn`
iff a positive total below threshold, else `quiet`. Self-policed before signing.

### Execution

Read `CountSummary` by reference, map it onto a status, and commit. If the read or
mapping fails, sign a failure receipt and leave the prior `AlertState` untouched.

### Failure containment

If the render fails after reading the summary, the harness signs a **failure
receipt** (status `failed`, zero fresh tokens) and commits nothing. The last
`rendered` `AlertState` stays active, `Executive Snapshot` reads that prior truth
by reference, and a later retry resumes from it — the failure is visible and
auditable without corrupting the world-model.

### Continuity

input-driven
