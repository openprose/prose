---
name: review-and-commit
kind: function
---

# Review And Commit

### Description

Review the implementation diff and TDD evidence, address scoped gaps,
re-run verification, and create a single local commit when verification
passes.

### Parameters

- `implementation-report`: report from `implement-tdd`
- `red-evidence`: from `implement-tdd`, to confirm the red-green loop
  actually happened
- `green-evidence`: from `implement-tdd`, to re-run before staging
- `verify-report`: from `verify-slice`
- `chosen-terminology`: glossary so the commit message uses resolved
  vocabulary

### Returns

- `review-report`: review findings, fixes applied, verification commands,
  files committed, and residual risks
- `commit-sha`: the single local commit SHA when verification passed, or
  `null` with reason when it did not

### Skills

- tdd

### Shape

- `self`: inspect the implementation diff, review for bugs and missing
  tests, address scoped gaps, re-run `green-evidence`'s command, and
  create a single local commit if `verify-report` and re-run verification
  both pass
- `prohibited`: committing unrelated files, or committing when
  `verify-report` shows any failing criterion or when the re-run of
  `green-evidence`'s focused command fails.

### Strategies

- Start with a code-review stance: findings first, then fixes.
- Re-run `green-evidence`'s focused command before staging.
- Stage only files that belong to the implementation run.
- Use a plain commit message that describes the behavior in
  `chosen-terminology` vocabulary; Pocock does not mandate Conventional
  Commits and we do not impose them here.
- If verification cannot pass, publish the review report with
  `commit_sha: null` and a reason; do not commit.
