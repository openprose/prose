---
name: brief-writer
kind: service
---

### Requires

- `company`: CompanyProfile - normalized company profile with citations

### Ensures

- `brief`: Markdown<ExecutiveBrief> - executive summary with recommended priorities

### Errors

- `input_unusable`: company profile is missing the facts needed to write a sourced brief
- `scope_unclear`: priorities cannot be chosen without a narrower launch or audience frame

### Finally

- Record whether the brief was produced or withheld, including the evidence refs inspected.

### Catch

- If market context is incomplete, produce a caveated brief only when the missing context is explicit in the output.

### Effects

- `pure`: deterministic synthesis over provided inputs

### Strategies

- Preserve citation pointers from the company profile in the final brief.
