---
name: smoke-fan-in-wiring
kind: responsibility
version: 0.15.0
---

### Description

Verifies Forme resolves deliberate fan-in: two producers of distinct truths
reconverge at one consumer.

### Requires

- `left-note`: the note maintained by the left producer
- `right-note`: the note maintained by the right producer

### Maintains

- `joined`: combined output containing the exact phrase `fan-in-wiring-smoke-pass`

### Continuity

- input-driven

## left

### Requires

- `seed`: caller-provided seed text

### Maintains

- `left-note`: a note derived from the seed

### Continuity

- input-driven

## right

### Requires

- `seed`: caller-provided seed text

### Maintains

- `right-note`: a different note derived from the seed

### Continuity

- input-driven
