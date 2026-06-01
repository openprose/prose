---
kind: responsibility
id: test.pkg-api
---

# Package test — run one package's suite

Six test responsibilities, one per package; this contract describes their shared
shape (the `pkg-api` test is the one the failing-test beat targets). A test
subscribes to **only its own build**, so it re-runs only when that build's truth
moves.

When the package is flagged broken, the test render **throws** — a render
exception, the way a component crashing during a render test would surface. A
render that throws produces a `failed` receipt: it carries **zero fresh** tokens,
publishes **no new truth**, and **wakes nothing downstream**. The prior passing
truth stands; the failure is contained.

### Requires

The test reads its own package's build world-model (atomic facet). It does not
subscribe to any other package's build.

### Maintains

A test world-model: `{ pkg, rev, cases, passed }`. Fresh cost scales with the
cases re-run (proportional to the changed lines the build recompiled).

### Continuity: input-driven

Woken only by an `input` wake from its build. A broken suite throws instead of
publishing, so the test's own truth goes stale while the build's recorded
`testStatus` is `RED` — which is exactly what drives the merge gate to BLOCKED on
that tick.

### Postconditions

- A passing run publishes `{ passed: true }` and lights its lane.
- A broken run produces a `failed` receipt (fresh 0), publishes nothing, and the
  merge gate sees a non-passing job and goes BLOCKED.
