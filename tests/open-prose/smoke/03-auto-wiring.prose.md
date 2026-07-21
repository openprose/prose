---
name: smoke-auto-wiring
kind: responsibility
version: 0.15.0
---

### Description

Verifies Forme wires a producer's `### Maintains` truth to a consumer's
`### Requires` need without explicit routing.

### Requires

- `raw-notes`: notes maintained by the collector

### Maintains

- `summary`: a two-sentence summary containing the exact phrase `auto-wiring-smoke-pass`

### Continuity

- input-driven

## collector

### Requires

- `subject`: the phrase to collect, supplied by the caller

### Maintains

- `raw-notes`: notes that include the subject and the exact phrase `collected-for-auto-wiring`

### Continuity

- input-driven
