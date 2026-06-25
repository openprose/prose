---
name: test-prose-author-launch-readiness
kind: test
version: 0.15.0
subject: prose-author
---

# Test Prose Author Launch Readiness

### Fixtures

- `request`: |
    I want a reusable product launch readiness workflow.

    Inputs: feature name, launch date, PR links, analytics dashboard links,
    support/search keywords, and the PM's launch goals.

    Run these checks in parallel:
    - engineering review: inspect PR status, test coverage, migration risk,
      rollback path, and unresolved technical blockers
    - quality review: inspect test plan, bug backlog, known flaky tests,
      accessibility checks, and manual QA gaps
    - product review: compare launch goals to telemetry, customer support
      themes, docs readiness, pricing/packaging impact, and success metrics

    Then synthesize a launch readiness memo with risks, blockers, owner
    assignments, go/no-go recommendation, and follow-up tasks.

    Loop with a launch editor until the editor approves the memo or 4 review
    rounds have happened. Each revision must explicitly address prior editor
    notes.

    If there are blocking risks, return a no-go decision with owners and next
    review date. If approved and no blockers, return a go decision plus the
    memo, checklist, and stakeholder summary.

### Expects

- `source_package`: prefers folder output because the workflow is reusable and
  has parallel reviews, synthesis, an approval loop, and conditional decisions
- `source_package`: maps inputs into named requires including `feature_name`,
  `launch_date`, `pr_links`, `analytics_links`, `support_keywords`, and
  `launch_goals`
- `source_package`: includes explicit parallel execution for engineering,
  quality, and product review
- `source_package`: preserves the max 4 review-round bound exactly
- `source_package`: carries prior editor notes into every revision round
- `source_package`: includes `editor_review_history` so approval is auditable
- `source_package`: returns `no-go` with owners and `next_review_date` when
  blockers remain or approval is exhausted
- `source_package`: returns `go` only when the editor approves and blockers are
  absent
- `lint_report`: has status `pass` and no blocking findings

### Expects Not

- `source_package`: converts the go/no-go branch into a single vague report
- `source_package`: loses reviewer history or prior editor notes
- `source_package`: changes the review limit from 4 rounds
