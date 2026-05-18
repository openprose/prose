---
name: test-prose-author-parallel-research-approval
kind: test
subject: prose-author
---

# Test Prose Author Parallel Research Approval

### Fixtures

- `request`: |
    workflow: weekly competitor intelligence brief
    input: company names, market segment, cutoff date

    for each company in parallel:
      research recent product launches, pricing changes, partnerships, hiring signals
      verify every major claim against at least two sources when possible
      extract notable moves, source links, confidence, and why it matters

    merge findings into a ranked brief:
      lead with the top 5 strategic changes
      include watchlist items separately from confirmed facts
      call out unknowns and weak evidence

    editor reviews the brief
    loop up to 3 times until editor approves:
      editor gives notes on unsupported claims, unclear significance, missing competitors
      analyst revises the brief and evidence table

    return final brief, source table, unresolved caveats, and editor approval record

### Expects

- `source_package`: prefers folder output because the workflow includes
  parallel research, claim verification, synthesis, revision, and approval
- `source_package`: maps the input line into `### Requires` items for
  `companies`, `market_segment`, and `cutoff_date`
- `source_package`: preserves all domain outputs from the return line:
  `final_brief`, `source_table`, `unresolved_caveats`, and
  `editor_approval_record`
- `source_package`: includes explicit fan-out/fan-in choreography for
  per-company parallel research rather than leaving it only as strategy text
- `source_package`: makes claim provenance first class when verification,
  source links, and confidence are requested
- `source_package`: includes a bounded approval loop with max 3 review rounds
- `source_package`: declares the exhausted-loop outcome when editor approval is
  not reached
- `lint_report`: has status `pass` and no blocking findings

### Expects Not

- `source_package`: collapses the return line into one vague `report` output
- `source_package`: drops `source_table` or confidence/provenance fields
- `source_package`: hides the non-approved final state
