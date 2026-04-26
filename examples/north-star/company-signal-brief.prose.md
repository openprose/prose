---
name: company-signal-brief
kind: service
---

### Requires

- `signal_notes`: Markdown<SignalNotes> - operator notes, customer quotes, market observations, or pasted evidence
- `brand_context`: Markdown<BrandContext> - positioning, target customer, and product constraints

### Ensures

- `company_signal_brief`: Markdown<CompanySignalBrief> - concise business brief with signals, implications, and next actions

### Effects

- `pure`: synthesis over caller-provided notes and brand context

