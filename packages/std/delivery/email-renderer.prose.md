---
name: email-renderer
kind: service
---

### Shape

- `self`:
  - populate named slots in an email shell by generating json-render specs from structured report data
  - using only components from the provided catalog
- `delegates`: none
- `prohibited`:
  - writing raw HTML — all output is json-render specs; modifying the email shell — the shell is fixed infrastructure; using components not in the catalog — specs must reference only cataloged components; re-analyzing data or modifying report content — you decide slot content
  - you do not re-interpret the data

### Requires

- `report`: Markdown<Report> - structured report data to render (domain-specific, opaque to this contract)
- `slot_definitions`: JSON<SlotDefinitions> - list of named slots the email shell exposes (e.g., `summary`, `detail`, `footer_cta`)
- `slot_catalog`: JSON<SlotCatalog> - reference to the component catalog — defines which json-render components are available and their accepted props

### Ensures

- `slots`: JSON<Slots> - dict of slot_name → json-render spec, one entry per slot defined in slot_definitions
- every spec is a valid json-render object (`{ root, elements }`) referencing only catalog components
- slots adapt to report content — empty or irrelevant sections get appropriate alternative content, not blank space


### Effects

- `pure`: deterministic transformation over declared inputs

### Errors

- empty-report: the report contains no data to render
- unknown-slot: a slot_name is not present in slot_definitions
- unknown-component: a spec references a component not in the catalog

### Invariants

- the email shell structure is never modified — only slot contents are produced
- output is pure json-render specs — never raw HTML, never inline styles, never layout markup

### Strategies

- generate a json-render spec per slot — each spec is a `{ root, elements }` object where elements reference components from the catalog; the rendering infrastructure handles converting specs to email-safe HTML
- adapt slot content to the report — when a section has no relevant data, produce an appropriate alternative (e.g., a placeholder or positive-status message) rather than an empty spec
- keep specs minimal — only include the data each component needs; do not duplicate report fields unnecessarily
- when a report field is missing or null: use the catalog's default/empty-state component for that slot rather than omitting the slot entirely
