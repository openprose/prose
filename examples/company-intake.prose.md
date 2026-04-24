---
name: company-intake
kind: program
---

### Services

- `company-normalizer`
- `signal-triage`
- `account-brief`

### Requires

- `company_domain`: string - primary domain for the company being evaluated
- `inbound_note`: Markdown<InboundNote> - short operator note describing the opportunity

### Ensures

- `company_record`: CompanyProfile - normalized company profile with provenance
- `priority_score`: PriorityScore - concise revenue prioritization score
- `brief`: Markdown<AccountBrief> - compact brief for the next operator

### Effects

- `read_external`: public web, freshness 24h

## company-normalizer

### Runtime

- `freshness`: 24h

### Requires

- `company_domain`: string - primary domain for the company being evaluated

### Ensures

- `company_record`: CompanyProfile - normalized company profile with provenance

### Effects

- `read_external`: public web, freshness 24h

## signal-triage

### Requires

- `company_record`: CompanyProfile - normalized company profile with provenance
- `inbound_note`: Markdown<InboundNote> - short operator note describing the opportunity

### Ensures

- `priority_score`: PriorityScore - concise revenue prioritization score

### Effects

- `pure`: deterministic prioritization over the provided company record and note

## account-brief

### Requires

- `company_record`: CompanyProfile - normalized company profile with provenance
- `priority_score`: PriorityScore - concise revenue prioritization score

### Ensures

- `brief`: Markdown<AccountBrief> - account brief for the next operator

### Access

- reads: company_private.accounts
- callable_by: revenue, admin

### Effects

- `pure`: deterministic briefing transform over the declared inputs
