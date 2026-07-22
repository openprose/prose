---
purpose: Primitive operation specifications — the atomic building blocks the OpenProse VM executes
related:
  - ../SKILL.md
  - ../state/README.md
  - ../guidance/README.md
glossary:
  Primitive: An atomic VM operation that cannot be decomposed further; the leaf nodes of an OpenProse execution tree
---

# primitives

Formal specifications for OpenProse primitive operations. Primitives are the atomic VM operations dispatched during execution — every Contract Markdown service or system, and every ProseScript script, ultimately resolves to one or more of these.

## Contents

- `session.md` — the render's harness contract: how a bounded session that is a render reads its inputs and prior world-model by reference, satisfies its `### Maintains` postconditions, writes the canonical world-model, and signs a receipt with the fingerprints. A render is complete standalone; mounting adds composition around it.
