---
name: smoke-explicit-wiring
kind: system
---

### Services

- `left`
- `right`
- `joiner`

### Description

Verifies `### Wiring` can pin caller and service data flow.

### Requires

- `seed`: a short phrase supplied by the smoke runner

### Ensures

- `joined`: combined output containing the exact phrase `explicit-wiring-smoke-pass`

### Wiring

left:
  receives: { seed: seed } from caller

right:
  receives: { seed: seed } from caller

joiner:
  receives: { left-note } from left
  receives: { right-note } from right
  returns to caller

## left

### Requires

- `seed`: caller-provided seed text

### Ensures

- `left-note`: a note derived from the seed

## right

### Requires

- `seed`: caller-provided seed text

### Ensures

- `right-note`: a different note derived from the seed

## joiner

### Requires

- `left-note`: note from the left service
- `right-note`: note from the right service

### Ensures

- `joined`: combined output containing the exact phrase `explicit-wiring-smoke-pass`
