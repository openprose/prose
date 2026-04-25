---
name: extractor
kind: service
---

# Extractor

Extract structured data from unstructured input according to a target schema. Use extractor when you need to transform raw text, logs, or observations into a defined data structure. Distinct from formatter (which transforms already-structured data into a different output format) -- extractor finds and lifts information from unstructured content.

### Description

Pull structured data from unstructured input given a target schema.

### Metadata

- `version`: 0.1.0

### Requires

- `input`: Input - the unstructured data (text, log output, raw observations, HTML, etc.)
- `schema`: Schema - the target structure with field names, types, and descriptions of what each field should contain

### Ensures

- `extracted`: Markdown<Extracted> - an object conforming to the target schema where:
    - each field has a confidence indicator (high, medium, low)
    - fields that cannot be confidently extracted are null with a reason -- never hallucinated
    - no information in the output that was not in the input
- if the input contains multiple valid extractions: all are returned, or the ambiguity is flagged, depending on the schema's cardinality


### Effects

- `pure`: deterministic transformation over declared inputs

### Errors

- no-match: the input contains no information matching any field in the schema
- format-unreadable: the input is corrupted, truncated, or in a format that cannot be parsed

### Strategies

- when evidence is ambiguous: prefer null over guessing -- a null with a reason is more useful than a fabricated value
- when multiple interpretations exist: note all candidates and select the one with strongest textual evidence
- when the input is large: scan for schema-relevant sections first, then extract from those sections rather than processing the entire input linearly

### Notes

Extractor is a strict information-lifting function. Its core invariant is that no information appears in the output that was not present in the input. For compressing existing content, use summarizer. For reshaping structured data into a different format, use formatter. For investigating a topic and producing new findings, use researcher.
