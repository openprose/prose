---
name: publish-brief
kind: program
---

### Services

- `brief-writer`

### Requires

- `company`: CompanyProfile - normalized company profile with citations
- `subject`: run<company-enrichment> - prior enrichment run to inspect

### Ensures

- `brief`: Markdown<ExecutiveBrief> - two-minute executive briefing

### Environment

- SLACK_WEBHOOK_URL: webhook for delivery channel

### Effects

- `read_external`: GitHub API, freshness 6h
- `delivers`: Slack channel `#company-intel`

### Access

- reads: company_private.leads
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
- `subject`: run<company-enrichment> - prior enrichment run to inspect

### Ensures

- `brief`: Markdown<ExecutiveBrief> - two-minute executive briefing

