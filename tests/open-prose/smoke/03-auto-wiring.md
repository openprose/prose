---
name: smoke-auto-wiring
kind: program
---

### Services

- `collector`
- `summarizer`

### Description

Verifies auto-wiring from one service's declared output to another service's
declared input.

### Requires

- `subject`: a short phrase supplied by the smoke runner

### Ensures

- `summary`: a two-sentence summary containing the exact phrase `auto-wiring-smoke-pass`

## collector

### Requires

- `subject`: the phrase to collect

### Ensures

- `raw-notes`: notes that include the subject and the exact phrase `collected-for-auto-wiring`

## summarizer

### Requires

- `raw-notes`: notes produced by the collector

### Ensures

- `summary`: a two-sentence summary containing the exact phrase `auto-wiring-smoke-pass`
