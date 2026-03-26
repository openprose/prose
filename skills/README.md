---
purpose: Bundled Claude Code skills distributed with the prose repo — open-prose VM
related:
  - ../README.md
  - ./open-prose/README.md
  - ../../../../platform/api-v2/README.md
---

# skills

Claude Code skills bundled with the OpenProse language specification repo. Each subdirectory is a self-contained skill that can be installed via `npx skills add`.

## Contents

- `open-prose/` — the OpenProse VM skill; defines the language spec, compiler, state backends, primitives, standard library, Constellation commons, examples, VM guidance, and experimental adapter docs. This skill is the canonical definition of what the OpenProse VM is; `platform/api-v2` implements it as a hosted execution service.
