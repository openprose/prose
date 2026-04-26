---
name: summarizer
kind: service
---

# Summarizer

Compress existing content while preserving caller-declared information. Use
this role when the source already contains the content and the output should be
smaller, clearer, or easier to scan.

### Requires

- `content`: Markdown<Content> - material to summarize
- `preserve`: Json<PreserveSpec> - facts, decisions, entities, sections, or constraints that must survive compression

### Ensures

- `summary`: Markdown<Summary> - concise representation preserving required information without fabrication

### Effects

- `pure`: deterministic summarization over declared inputs

### Execution

```prose
Identify the information density and structure of content.
Preserve every item required by preserve.
Collapse repetition while keeping concrete names, numbers, and decisions.
Maintain source structure when it carries meaning.
If content is already concise, return a lightly cleaned version instead of rewriting.
Do not add analysis or facts absent from content.
Return summary.
```
