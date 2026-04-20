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
