---
name: formatter
kind: service
---

# Formatter

Transform structured data into a specified output format -- Markdown, JSON, HTML, CSV, plain text, or any other target. Use formatter as the last mile of a pipeline, converting internal data structures into the presentation format the consumer needs. Distinct from extractor (which lifts structure from unstructured input) and writer (which creates new content) -- formatter reshapes existing structured data without adding or removing information.

### Description

Transform structured data into a specified output format with no information loss.

### Metadata

- `version`: 0.1.0

### Requires

- data: the structured input to format
- target_format: the desired output format (e.g., Markdown, JSON, HTML, CSV) with any style or layout requirements

### Ensures

- formatted: the data rendered in the target format where:
    - all information from the input is present in the output -- no fields dropped silently
    - the output is valid in the target format (valid JSON parses, valid HTML renders, valid CSV has consistent columns)
    - missing or null fields are handled gracefully (omitted with a note, rendered as empty, or replaced with a placeholder -- consistent throughout)

### Errors

- unsupported-format: the target format is not recognized or cannot represent the input data
- data-unstructured: the input data has no discernible structure to format

### Strategies

- when the data has nested structures: flatten or indent according to the target format's conventions, preserving hierarchy
- when fields are missing: use a consistent strategy throughout (do not omit some nulls and placeholder others)
- when the target format has length limits: truncate content fields before metadata fields, and indicate truncation
- when multiple layout options exist: prefer the layout that makes the data scannable (tables over paragraphs for tabular data, lists over prose for enumerations)

### Notes

Formatter is a shape-preserving transformation. It does not analyze, summarize, or create -- it presents. For lifting structured data from unstructured input, use extractor. For compressing content, use summarizer. For creating new written content, use writer. Formatter is the role that makes output consumable by its final audience, whether that audience is a human reading Markdown or a system parsing JSON.
