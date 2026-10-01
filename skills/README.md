---
purpose: Bundled OpenProse skill definitions distributed with the prose repo — open-prose VM
related:
  - ../README.md
  - ./open-prose/SKILL.md
---

# skills

Bundled OpenProse skill definitions shipped with the language specification repo. In environments with `npx skills`, each subdirectory can be installed as a skill; in Codex, the same files can be loaded through the repository-local `AGENTS.md` entry point.

## Contents

- `open-prose/` — the OpenProse VM skill; defines the `*.prose.md` responsibility/function/gateway/test/pattern contract format, Forme wiring, ProseScript, state backends, primitives, package libraries, examples, and VM guidance. Start with [contract authoring](open-prose/guidance/authoring.md#requirements-and-composition) to express intent through reusable requirements. The skill defines VM semantics; execution and enforcement depend on the selected host.
