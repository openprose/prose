---
name: digest
kind: responsibility
version: 0.15.0
---

### Goal

A running digest of how many support tickets have been accepted.

### Requires

- the accepted ticket set from the inbox gateway

### Maintains

A digest document. Material: the digest body.

#### digest
The current digest text, derived from the upstream accepted-ticket set.

### Continuity

- input-driven: re-render when the upstream ticket set moves.
