---
name: wiring-declaration-demo
kind: program
---

### Services

- `researcher`
- `critic`
- `synthesizer`

### Description

Demonstrates Level 2 explicit wiring. When Forme's auto-wiring would be ambiguous, the author can pin the wiring with a `### Wiring` section.

### Requires

- `question`: what the user wants answered

### Ensures

- `report`: a critically evaluated research report

### Wiring

researcher:
  receives: { topic: question } from caller

critic:
  receives: { findings, sources } from researcher

synthesizer:
  receives: { findings } from researcher
  receives: { evaluation } from critic
  returns to caller

## researcher

### Requires

- `topic`: what to investigate

### Ensures

- `findings`: sourced findings relevant to the topic
- `sources`: source list with enough detail for critique

## critic

### Requires

- `findings`: research findings to evaluate
- `sources`: source list to inspect for quality and coverage

### Ensures

- `evaluation`: critique of the findings, including confidence and gaps

## synthesizer

### Requires

- `findings`: research findings to summarize
- `evaluation`: critique to incorporate

### Ensures

- `report`: critically evaluated research report
