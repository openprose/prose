---
name: release-proposal-dry-run
kind: program
---

### Services

- `qa-check`
- `release-note-writer`
- `announce-release`

### Requires

- `release_candidate`: ReleaseCandidate - release version, change summary, and linked changelog

### Ensures

- `qa_report`: Markdown<QAReport> - deployment confidence, rollback plan, and launch notes
- `release_summary`: Markdown<ReleaseSummary> - operator-facing release proposal
- `delivery_receipt`: DeliveryReceipt - dry-run record of the announcement delivery

### Effects

- `human_gate`: release manager approval is required before delivery
- `delivers`: Slack channel `#releases`

## qa-check

### Requires

- `release_candidate`: ReleaseCandidate - release version, change summary, and linked changelog

### Ensures

- `qa_report`: Markdown<QAReport> - deployment confidence, rollback plan, and launch notes

### Effects

- `pure`: review over the provided release candidate

## release-note-writer

### Requires

- `release_candidate`: ReleaseCandidate - release version, change summary, and linked changelog
- `qa_report`: Markdown<QAReport> - deployment confidence, rollback plan, and launch notes

### Ensures

- `release_summary`: Markdown<ReleaseSummary> - operator-facing release proposal

### Effects

- `pure`: release-note synthesis over declared inputs

## announce-release

### Requires

- `release_candidate`: ReleaseCandidate - release version, change summary, and linked changelog
- `release_summary`: Markdown<ReleaseSummary> - operator-facing release proposal

### Ensures

- `delivery_receipt`: DeliveryReceipt - dry-run record of the announcement delivery

### Effects

- `human_gate`: release manager approval is required before delivery
- `delivers`: Slack channel `#releases`

