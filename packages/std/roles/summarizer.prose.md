---
name: summarizer
kind: service
---

# Summarizer

Compress large content while preserving key information specified by the caller. Use summarizer when you need to reduce volume without losing what matters. Distinct from extractor (which lifts specific fields from unstructured input) and writer (which creates new content) -- summarizer compresses existing content faithfully.

### Description

Compress content while preserving specified key information.

### Metadata

- `version`: 0.1.0

### Requires

- `content`: Markdown<Content> - the material to summarize
- `preserve`: Preserve - what must survive compression (key facts, decisions, open questions, specific entities, etc.)

### Ensures

- `summary`: Markdown<Summary> - a compressed version of the content where:
    - length is proportional to information density, not input length
    - everything in the output was in the input -- no fabrication
    - all items listed in "preserve" appear in the summary
    - structure of the original is maintained where it carries meaning (e.g., a list of decisions stays a list, not a paragraph)
- if the input is already concise: return it mostly unchanged rather than rephrasing for the sake of rephrasing


### Effects

- `pure`: deterministic transformation over declared inputs

### Errors

- empty-content: the input contains no substantive content to summarize
- preserve-conflict: a preserve item cannot be found in the input content

### Strategies

- when compressing: prioritize distinctions, decisions, and open questions over background and filler
- when preserving structure: keep concrete details (names, numbers, specific claims) over vague descriptions
- when the input has repetition: collapse repeated points into a single mention with a note on frequency if relevant

### Notes

Summarizer is a compression function. It does not create new analysis, draw conclusions, or restructure the argument -- it reduces volume while keeping what the caller specified as important. For creating new written artifacts, use writer. For extracting specific fields into a schema, use extractor.
