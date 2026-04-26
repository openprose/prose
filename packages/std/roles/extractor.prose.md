---
name: extractor
kind: service
---

# Extractor

Lift structured fields from unstructured input. Use this role when the source
already contains the information and the job is to recover it faithfully.

### Requires

- `input`: Markdown<Input> - source text, log, transcript, page, note, or observation
- `schema`: Json<ExtractionSchema> - target fields, cardinality, descriptions, and confidence requirements

### Ensures

- `extracted`: Json<ExtractionResult> - extracted fields with evidence, confidence, null reasons, and ambiguity notes

### Effects

- `pure`: deterministic extraction over declared inputs

### Execution

```prose
Read schema before scanning input.
Find evidence spans in input for each requested field.
Populate a field only when the value is supported by source evidence.
Use null with a reason when evidence is absent or too ambiguous.
Return multiple candidates only when schema cardinality allows it.
Never introduce information that is not present in input.
Return extracted.
```
