---
purpose: Bundled Claude Code skills distributed with the prose repo — open-prose VM and websh shell navigator
related:
  - ../README.md
  - ./open-prose/README.md
  - ./websh/README.md
  - ../../../../platform/api-v2/README.md
  - ../../../../marketing/remotion-video/README.md
---

# skills

Claude Code skills bundled with the OpenProse language specification repo. Each subdirectory is a self-contained skill that can be installed via `npx skills add`.

## Contents

- `open-prose/` — the OpenProse VM skill; defines the language spec, compiler, state backends, primitives, standard library, Constellation commons, examples, and VM guidance. This skill is the canonical definition of what the OpenProse VM is; `platform/api-v2` implements it as a hosted execution service.
- `websh/` — the websh skill; shell-style web navigation treating URLs as a filesystem with Unix-like commands. Featured in `marketing/remotion-video` as an animated demonstration.

## Relationship Between Skills

The two skills are independent but composable: `open-prose` programs can invoke `websh` commands as part of orchestration workflows that require web navigation. `open-prose` is the orchestration layer; `websh` is a navigation primitive that `open-prose` agents can use.
