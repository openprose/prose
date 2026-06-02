---
name: integration-builder
kind: responsibility
---

# Integration Builder

> The convergence node. It merges ONLY the accepted lane outputs into one
> integrated patch set, resolves export requests, runs the configured commands,
> and records remaining failures. A rejected lane's patch NEVER appears in
> `integrated_patch_set` — that is enforced by construction, not by a downstream
> filter.

### Goal

The accepted lane outputs become one coherent integrated change with its exports
wired and its commands run, while every rejected lane is excluded and every
skipped lane reuses its prior accepted output.

### Requires

- `accepted`: the review verdict — which lanes are accepted vs rejected. *(A named
  facet of `construction-review`.)*
- the six `LaneState` truths — to pull each accepted lane's patch set (and to
  reuse a skipped lane's prior accepted output by reference). *(Maintained by the
  six `construction-lane` nodes.)*

### Maintains

The world-model schema — the integrated state.

**Type** — the maintained truth carries:

- `integrated_patch_set`: the merged patches, drawn ONLY from accepted lanes
- `excluded_lanes`: the rejected lanes that were left out
- `export_wiring`, `conflict_resolutions`, `commands_run`
- `typecheck_result`, `unit_test_result`, `smoke_test_result`, `remaining_failures`

**Canonicalization spec** — the atomic truth. Because rejected lanes are filtered
before assembly, a forbidden patch can never enter the integrated set.

### Continuity

Input-driven. Do NOT integrate rejected lane outputs. For a skipped lane,
integration consumes the prior accepted output by reference; for a changed lane,
it consumes the new output.
