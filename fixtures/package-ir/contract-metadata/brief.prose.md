---
name: brief-builder
kind: service
---

### Requires

- `company`: CompanyProfile - normalized company profile

### Ensures

- `brief`: Markdown<Brief> - concise executive brief

### Runtime

- freshness: 12h

### Effects

- `read_external`: public web, freshness 12h

### Access

- reads: company_private.accounts
- callable_by: revenue, admin
