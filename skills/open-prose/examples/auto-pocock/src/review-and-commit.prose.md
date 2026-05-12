---
name: review-and-commit
kind: service
---

# Review And Commit

### Description

Review the implementation diff and TDD evidence, address scoped gaps,
re-run verification, and create a single local commit when verification
passes.

### Requires

- `implementation_report`: report from `implement-tdd`
- `red_evidence`: from `implement-tdd`, to confirm the red-green loop
  actually happened
- `green_evidence`: from `implement-tdd`, to re-run before staging
- `verify_report`: from `verify-slice`
- `chosen_terminology`: glossary so the commit message uses resolved
  vocabulary

### Ensures

- `review_report`: review findings, fixes applied, verification commands,
  files committed, and residual risks
- `commit_sha`: the single local commit SHA when verification passed, or
  `null` with reason when it did not

### Skills

- tdd

### Shape

- `self`: inspect the implementation diff, review for bugs and missing
  tests, address scoped gaps, re-run `green_evidence`'s command, and
  create a single local commit if `verify_report` and re-run verification
  both pass
- `prohibited`: committing unrelated files, or committing when
  `verify_report` shows any failing criterion or when the re-run of
  `green_evidence`'s focused command fails.

### Strategies

- Start with a code-review stance: findings first, then fixes.
- Re-run `green_evidence`'s focused command before staging.
- Stage only files that belong to the implementation run.
- Use a plain commit message that describes the behavior in
  `chosen_terminology` vocabulary; Pocock does not mandate Conventional
  Commits and we do not impose them here.
- If verification cannot pass, publish the review report with
  `commit_sha: null` and a reason; do not commit.
