---
purpose: Bundled OpenProse skill definitions distributed with the prose repo — open-prose VM
related:
  - ../README.md
  - ./open-prose/SKILL.md
---

# skills

Bundled OpenProse skill definitions shipped with the language specification repo. In environments with `npx skills`, each subdirectory can be installed as a skill; in Codex, the same files can be loaded through the repository-local `AGENTS.md` entry point.

## Contents

- `open-prose/` — the OpenProse VM skill; defines the language spec, compiler, state backends, primitives, standard library, examples, and VM guidance. This skill is the canonical definition of what the OpenProse VM is; OpenProse Cloud is the hosted execution service that implements this spec.
