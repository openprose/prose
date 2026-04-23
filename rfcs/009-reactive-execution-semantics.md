# RFC 009: Reactive Execution Semantics

**Status:** Draft
**Date:** 2026-04-23
**Author:** OpenProse design session

## Summary

Reactive OpenProse execution keeps materialized graph outputs fresh. The runtime
tracks each graph node's current run, invalidates stale nodes, plans
recomputation, applies effect policy, and materializes new runs when allowed.

Authors should not need special syntax for ordinary reactive behavior. They
write contracts. The runtime reacts over the IR.

## Invalidation Inputs

A node becomes stale when any of these change:

- literal input value hash
- upstream node current run
- explicit run input
- component source hash
- component IR hash
- dependency package SHA
- port type or schema
- effect declaration or policy
- access policy
- environment binding identity or presence requirement
- feedback or memory binding hash
- freshness window for external reads
- eval requirement or eval result policy

The old run remains immutable. The node's current pointer changes only after a
new run succeeds and is accepted, or a policy explicitly chooses to accept stale
data. The node's latest pointer may still advance to a succeeded-but-unaccepted
run for debugging and audit.

## Recompute Planner

The planner walks stale nodes and classifies them:

- `ready`: can run automatically now.
- `blocked_policy`: needs approval, role, budget, or gate.
- `blocked_input`: missing input or upstream failed.
- `blocked_effect`: unsafe side effect without idempotency key.
- `skipped`: stale but not needed by any requested output.

The planner should prefer minimal recomputation. If only one upstream branch
changed, unrelated branches keep their current runs.

## Freshness

External reads need explicit freshness policy:

```markdown
### Runtime

- `freshness`: 24h
```

or effect-level policy:

```markdown
### Effects

- `read_external`: GitHub API, freshness 6h
```

When freshness expires, the node becomes stale even if source and inputs are
unchanged.

## Side Effects

Side-effecting nodes do not rerun automatically unless the effect policy says
the rerun is safe.

Safe patterns:

- pure recompute
- read-only recompute within budget
- delivery with stable idempotency key
- repo mutation dry run
- human-approved publish

Unsafe patterns:

- duplicate Slack/email delivery without dedupe key
- duplicate release tag creation
- memory write replay without transaction/idempotency
- metered API retry beyond budget

## Backpressure

Reactive execution must include backpressure:

- max concurrent nodes per graph
- max depth of cascading recompute
- per-effect budgets
- per-tenant budgets in hosted runtimes
- cancellation and pause states
- cycle detection
- recompute preview before gated work

The runtime should be able to answer "what will rerun and why?" before it does
expensive or side-effecting work.

## Evals

Evals participate in freshness and acceptance. A node can be "materialized but
not accepted" if its run succeeded but required evals failed. In that case the
latest pointer records the run, while the current pointer remains on the last
accepted run unless policy explicitly permits failed-eval outputs to flow.

Default:

- local draft execution may continue with warnings
- published packages and hosted serving require passing required evals
- company-critical workflows can require eval pass before delivery

## Validation

### Static Checks

- IR includes all inputs needed for stale calculation.
- Planner can compute dependency closure from IR.
- Nodes with side effects have recompute policy.
- Freshness policies parse to deterministic durations or named policies.

### Runtime Checks

- Changing an upstream input invalidates downstream nodes only.
- Changing a source file invalidates that component and downstream nodes.
- Changing an unrelated branch does not invalidate sibling branches.
- Pure stale nodes rerun automatically.
- Side-effect stale nodes produce recompute preview and block.
- Failed eval marks node unaccepted even when run status is succeeded.
- Failed required eval updates the latest pointer but leaves the current pointer
  unchanged by default.

### Golden Fixtures

Create fixtures for:

- two-branch graph with one branch changed
- external read freshness expiry
- schema change invalidation
- dependency SHA change
- side-effect gate
- eval failed gate
- run input staleness warning

### Agent Work Instructions

Implementation agents should build a planner that prints a recompute plan before
it executes anything. The printed plan is the first debugging surface and should
be covered by snapshot fixtures.

### Done Criteria

- `prose plan` or equivalent can explain stale nodes and blocked nodes.
- Reactive execution recomputes minimal pure subgraphs.
- Side-effecting nodes never rerun silently.
- Run records preserve old materializations after new runs succeed or fail
  acceptance.
