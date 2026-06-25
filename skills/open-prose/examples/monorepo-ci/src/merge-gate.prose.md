---
name: merge-gate
kind: responsibility
version: 0.15.0
id: gate.merge
---

# Merge gate — the terminal verdict

The terminal node. It fans in from **all six tests + all six lints + the review
node + the typecheck node** and renders the merge verdict: `GREEN` (mergeable)
or `BLOCKED`. It is the widest fan-in in the graph, but it still only wakes when
one of its inputs actually moves — a quiet re-scan leaves it skipped.

### Requires

- Every package's recorded CI test status (read off each build's `testStatus`),
  every package's lint result, the `review` verdict, and the `typecheck` total.
- A failed test publishes no new passing truth, but the build's recorded
  `testStatus` is `RED`, so the gate sees the regression even though the test
  node's own truth is stale (the realistic "the test job failed" read).

### Maintains

A gate world-model: `{ tests, review, typecheck, merge }` where `merge` is
`GREEN` iff every recorded test status is `GREEN` and the review verdict is
`approved`; otherwise `BLOCKED`.

### Continuity: input-driven

Woken by an `input` wake when any fan-in producer moves, and by a `self` wake on
a bare re-tick. A `self` tick in a quiet world finds no moved input and writes a
`skipped` receipt — the audit floor: no work, no cost.

### Postconditions

- On the failing-`pkg-api`-test tick the gate renders `merge: BLOCKED`.
- On the cold boot and after the fix lands the gate renders `merge: GREEN`.
- A self-tick with no moved input is a `skipped` receipt that lights no lane.
