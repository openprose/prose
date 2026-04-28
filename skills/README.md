---
purpose: Bundled OpenProse skill definitions distributed with the prose repo
related:
  - ../README.md
  - ./open-prose/SKILL.md
---

# skills

Bundled OpenProse skill definitions distributed with the language repo. In
environments with `npx skills`, each subdirectory can be installed as a skill;
in Codex, the same files can be loaded through the repository-local
`AGENTS.md` entry point.

Public docs and curated examples live at the repo root:

- `../docs/`
- `../examples/`

## Contents

- `open-prose/` — the current OpenProse skill router. It orients agents to
  `.prose.md` source, the Bun CLI, Pi graph-VM execution, single-component
  handoff, package metadata, and hosted-compatible run/artifact contracts.
