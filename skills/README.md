---
purpose: Bundled OpenProse skill definitions distributed with the prose repo — open-prose VM
related:
  - ../README.md
  - ./open-prose/README.md
  - ../../../../platform/api-v2/README.md
---

# skills

Bundled OpenProse skill definitions shipped with the language specification repo. In environments with `npx skills`, each subdirectory can be installed as a skill; in Codex, the same files can be loaded through the repository-local `AGENTS.md` entry point.

## Contents

- `open-prose/` — the OpenProse VM skill; defines the language spec, compiler, state backends, primitives, standard library, Constellation commons, examples, and VM guidance. This skill is the canonical definition of what the OpenProse VM is; `platform/api-v2` implements it as a hosted execution service.
