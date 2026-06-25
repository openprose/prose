---
name: implement-tdd
kind: function
version: 0.15.0
---

# Implement TDD

### Description

Apply the local Matt Pocock `tdd` skill to implement the `chosen-slice`
using a red-green-refactor loop, with evidence captured at each step so
`verify-slice` and `review-and-commit` can audit the loop independently.

### Parameters

- `chosen-slice`: the AFK slice from `triage-and-pick`
- `chosen-terminology`: glossary from `decide-plan` so tests and code use
  resolved vocabulary

### Returns

- `implementation-report`: behavior implemented, tests added or changed,
  commands run, files touched, and residual risks
- `red-evidence`: failing test name, failure output, and test file path
  (harness-level evidence; `tdd/SKILL.md` describes the red step in
  prose without demanding a named artifact)
- `green-evidence`: same test passing, with the exact focused command
  run (same caveat as `red-evidence`)
- `refactor-notes`: what changed under green, or `"none"` if no refactor
  was needed (same caveat)

### Skills

- tdd

### Shape

- `self`: write one failing behavior test, implement the smallest code
  change, rerun the focused test, refactor only when green, and publish
  the report and evidence
- `prohibited`: broad refactors, unrelated file edits, committing,
  writing all tests first before any implementation, mocking internal
  collaborators, or hiding failing tests

### Strategies

- One test → one minimal implementation → repeat. Never write a
  horizontal slice of tests first. This is Pocock's `tdd/SKILL.md`
  rule: "DO NOT write all tests first, then all implementation."
- Name tests in `chosen-terminology` vocabulary, per `tdd/tests.md`.
- Tests assert behavior through public interfaces only; no internal
  collaborator mocks. See `tdd/mocking.md`'s "Don't mock:" list
  (own classes/modules and internal collaborators).
- Prefer deep modules with small public surfaces, per
  `tdd/deep-modules.md` and `tdd/interface-design.md`.
- Refactor only on green, per `tdd/refactoring.md`.
- If the repo already contains the intended fix, prove it with a
  regression test and report `refactor-notes: "none — pre-existing"`.
