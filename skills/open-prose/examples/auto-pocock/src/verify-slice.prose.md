---
name: verify-slice
kind: function
---

# Verify Slice

### Description

Independently verify that the implemented behavior works end-to-end
through the slice's stated acceptance criteria, separate from the TDD
inner loop. This service is not Pocock's `qa` skill: his `qa` is an
**interactive upstream** session where the user reports bugs
conversationally and the agent files issues. This service is a
**downstream pass/fail acceptance check** before commit. The names are
deliberately different so the two are not confused.

### Parameters

- `chosen-slice`: the slice's acceptance criteria
- `green-evidence`: the focused test command from `implement-tdd`

### Returns

- `verify-report`: reproducible command, observed behavior, and pass/fail
  per acceptance criterion

### Shape

- `self`: re-run the focused test command, then exercise the acceptance
  criteria through the slice's public surface and record observed
  behavior
- `prohibited`: skipping criteria, asserting behavior the slice did not
  promise, or marking pass without an observed command output

### Strategies

- Treat a single failing acceptance criterion as overall `fail`; the
  review phase will not commit on a failing `verify-report`.
- Prefer the smallest reproducible command that demonstrates each
  criterion.
