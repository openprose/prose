---
name: brief-writer
kind: service
---

### Requires

- `company`: CompanyProfile - normalized company profile with citations

### Ensures

- `brief`: Markdown<ExecutiveBrief> - executive summary with recommended priorities

### Effects

- `pure`: deterministic synthesis over provided inputs
