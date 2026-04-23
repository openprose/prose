---
name: html-renderer
kind: service
---

### Shape

- `self`: render an HTML document from a template and structured data
- `delegates`: none
- `prohibited`:
  - fetching external data
  - modifying the data — you render what you're given

### Requires

- template: path to an HTML template with placeholder markers
- data: structured output from programs
- output_path: where to write the rendered HTML
- strict: (optional, default false) boolean — if true, error on missing data fields; if false, use "data pending" markers for missing fields

### Ensures

- rendered: confirmation the file was written successfully
- html_path: the output file path
- all template placeholders are resolved to data values, or marked "data pending" in non-strict mode

### Errors

- template-not-found: the template path does not exist or is not readable
- data-incomplete: (strict mode only) one or more template placeholders have no corresponding data field

### Invariants

- template structure, styling, and layout are preserved exactly — only placeholder markers are replaced
- output HTML is valid if the input template was valid

### Strategies

- when rendering: replace all placeholder markers in the template with corresponding values from the data. Preserve the template's structure, styling, and layout.
- when strict is true and a data field is missing: signal data-incomplete error listing all unresolved placeholders
- when strict is false and a data field is missing: insert a visible "data pending" marker in place of the missing value
