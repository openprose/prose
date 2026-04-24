---
name: run-aware-brief
kind: program
---

### Services

- `brief-writer`

### Requires

- `company`: CompanyProfile - normalized company profile with citations
- `subject`: run<company-intake> - prior intake run to inspect for provenance and artifacts

### Ensures

- `brief`: Markdown<ExecutiveBrief> - two-minute executive briefing with cited risks and next actions

### Environment

- SLACK_WEBHOOK_URL: webhook for the delivery channel

### Effects

- `read_external`: public web, freshness 6h

### Access

- reads: company_private.accounts
- callable_by: revenue, admin

### Execution

```prose
let brief = call brief-writer
  company: company
  subject: subject

return brief
```

## brief-writer

### Requires

- `company`: CompanyProfile - normalized company profile with citations
- `subject`: run<company-intake> - prior intake run to inspect for provenance and artifacts

### Ensures

- `brief`: Markdown<ExecutiveBrief> - two-minute executive briefing with cited risks and next actions

### Effects

- `pure`: deterministic synthesis over the declared inputs
