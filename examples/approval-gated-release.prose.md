---
name: approval-gated-release
kind: program
---

### Services

- `qa-check`
- `release-note-writer`
- `announce-release`

### Requires

- `release_candidate`: ReleaseCandidate - the release version, summary, and linked changelog

### Ensures

- `delivery_receipt`: DeliveryReceipt - record of the release announcement delivery

### Effects

- `human_gate`: release manager approval is required before delivery
- `delivers`: Slack channel `#releases`

## qa-check

### Requires

- `release_candidate`: ReleaseCandidate - the candidate being checked

### Ensures

- `qa_report`: Markdown<QAReport> - deployment confidence, rollback plan, and launch notes

### Effects

- `pure`: deterministic review over the provided release candidate

## release-note-writer

### Requires

- `release_candidate`: ReleaseCandidate - the candidate being described
- `qa_report`: Markdown<QAReport> - launch context to incorporate

### Ensures

- `release_summary`: Markdown<ReleaseSummary> - operator-facing summary for the release

### Effects

- `pure`: deterministic release-note synthesis

## announce-release

### Requires

- `release_candidate`: ReleaseCandidate - the candidate being announced
- `release_summary`: Markdown<ReleaseSummary> - content to announce

### Ensures

- `delivery_receipt`: DeliveryReceipt - proof of announcement

### Effects

- `human_gate`: release manager approval is required before delivery
- `delivers`: Slack channel `#releases`
