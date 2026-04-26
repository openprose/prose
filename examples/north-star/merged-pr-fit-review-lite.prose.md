---
name: merged-pr-fit-review-lite
kind: program
---

### Services

- `merged-pr-auditor`
- `pr-review-memory-writer`
- `pr-fit-summary-writer`

### Requires

- `merged_pr_batch`: Json<MergedPullRequestBatch> - merged PR metadata, summaries, file lists, and commit SHAs
- `prior_review_memory`: Json<PullRequestReviewMemory> - prior reviewed PRs and spirit anchors

### Ensures

- `pr_review_findings`: Json<PullRequestReviewFindings> - per-PR fit review findings with cited files
- `pr_memory_delta`: Json<PullRequestReviewMemoryDelta> - proposed memory update for reviewed PRs
- `pr_fit_summary`: Markdown<PullRequestFitSummary> - adjudicated summary and follow-up recommendations

### Effects

- `writes_memory`: commits reviewed PR memory only after the graph succeeds

## merged-pr-auditor

### Requires

- `merged_pr_batch`: Json<MergedPullRequestBatch> - merged PR metadata, summaries, file lists, and commit SHAs
- `prior_review_memory`: Json<PullRequestReviewMemory> - prior reviewed PRs and spirit anchors

### Ensures

- `pr_review_findings`: Json<PullRequestReviewFindings> - per-PR fit review findings with cited files

### Effects

- `pure`: audits only declared PR metadata and prior memory

## pr-review-memory-writer

### Requires

- `pr_review_findings`: Json<PullRequestReviewFindings> - per-PR fit review findings with cited files
- `prior_review_memory`: Json<PullRequestReviewMemory> - prior reviewed PRs and spirit anchors

### Ensures

- `pr_memory_delta`: Json<PullRequestReviewMemoryDelta> - proposed memory update for reviewed PRs

### Effects

- `writes_memory`: prepares memory changes for commit after graph success

## pr-fit-summary-writer

### Requires

- `pr_review_findings`: Json<PullRequestReviewFindings> - per-PR fit review findings with cited files
- `pr_memory_delta`: Json<PullRequestReviewMemoryDelta> - proposed memory update for reviewed PRs

### Ensures

- `pr_fit_summary`: Markdown<PullRequestFitSummary> - adjudicated summary and follow-up recommendations

### Effects

- `pure`: summarizes accepted review findings and memory updates

