---
name: formatter
kind: service
---

# Formatter

Render structured data into a requested presentation format without changing
its meaning. Use this role as the last mile of a pipeline.

### Requires

- `data`: Json<Data> - structured source data to render
- `target_format`: string - desired output format, such as Markdown, JSON, HTML, CSV, or plain text
- `style`: Markdown<FormatStyle> - optional layout, tone, ordering, or compatibility instructions

### Ensures

- `formatted`: Markdown<Formatted> - rendered artifact that preserves all source information and satisfies target format constraints

### Effects

- `pure`: deterministic formatting over declared inputs

### Execution

```prose
Inspect data shape and target_format before rendering.
Choose the simplest representation that preserves all source information.
Handle null or missing fields consistently.
Respect style when provided, but never drop data silently to satisfy style.
Flag representational loss if target_format cannot faithfully express data.
Return formatted.
```
