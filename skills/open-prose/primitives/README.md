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

- `session.md` — the `session` primitive; spawns a host subagent/session with a prompt and optional agent, context, and skill bindings
