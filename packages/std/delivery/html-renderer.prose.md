---
name: html-renderer
kind: function
version: 0.15.0
---

### Shape

- `self`: render an HTML document from a template and structured data
- `delegates`: none
- `prohibited`:
  - fetching external data
  - modifying the data — you render what you're given

### Parameters

- template: path to an HTML template with placeholder markers
- data: structured output from services or systems
- output_path: where to write the rendered HTML
- strict: (optional, default false) boolean — if true, error on missing data fields; if false, use "data pending" markers for missing fields

### Returns

- rendered: confirmation the file was written successfully
- html_path: the output file path

Every template placeholder is resolved to a data value, or marked "data pending" in non-strict mode, before the rendered file path is returned.

### Errors

- template-not-found: the template path does not exist or is not readable
- data-incomplete: (strict mode only) one or more template placeholders have no corresponding data field
- unsafe-template: a placeholder is used in a context that cannot be safely escaped
- unsafe-data: a value contains raw markup or a disallowed URL scheme for its output context

### Invariants

- template structure, styling, and layout are preserved exactly — only placeholder markers are replaced
- output HTML is valid if the input template was valid
- untrusted data is never emitted as executable HTML, CSS, or script content; values are escaped for their actual HTML context (text, attribute, URL, or style)
- raw HTML is not accepted as a data value; callers must use a separately reviewed, trusted template fragment mechanism if markup is required

### Strategies

- when rendering: replace all placeholder markers in the template with corresponding values from the data. Preserve the template's structure, styling, and layout.
- when a placeholder is in an HTML attribute or URL context: apply context-specific escaping and allow only the minimum safe URL schemes (`https` and, where explicitly required by the template, `mailto`); reject ambiguous or executable contexts instead of interpolating
- when a value appears to contain markup, a script, an event-handler attribute, or a `javascript:`, `data:`, or `vbscript:` URL: signal `unsafe-data` rather than treating it as trusted HTML
- when strict is true and a data field is missing: signal data-incomplete error listing all unresolved placeholders
- when strict is false and a data field is missing: insert a visible "data pending" marker in place of the missing value
