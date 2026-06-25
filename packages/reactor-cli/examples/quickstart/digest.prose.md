---
name: digest
kind: responsibility
version: 0.15.0
---

### Goal

A running digest of how many items have been accepted at the inbox.

### Requires

- the accepted item set from the inbox gateway

### Maintains

A digest document. Material: the digest body.

#### digest
The current digest text, derived from the upstream accepted-item set.

### Continuity

- input-driven: re-render when the upstream item set moves.
