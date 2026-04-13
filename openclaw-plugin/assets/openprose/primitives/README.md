---
purpose: Primitive operation specifications — the atomic building blocks the OpenProse VM executes
related:
  - ../README.md
  - ../state/README.md
  - ../guidance/README.md
glossary:
  Primitive: An atomic VM operation that cannot be decomposed further; the leaf nodes of a .prose execution tree
---

# primitives

Formal specifications for OpenProse primitive operations. Primitives are the atomic units the VM dispatches — everything a .prose program does ultimately resolves to one or more of these.

## Contents

- `session.md` — the `session` primitive; spawns a Claude session with a prompt and optional agent, context, and skill bindings
