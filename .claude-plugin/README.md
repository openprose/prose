---
purpose: Claude plugin configuration for the prose repo — defines the open-prose skill for distribution via the Claude Code marketplace
related:
  - ../README.md
  - ../skills/README.md
  - ../skills/open-prose/README.md
---

# .claude-plugin

Plugin manifest files that register the prose repo's skills with Claude Code's plugin system.

## Contents

- `plugin.json` — primary plugin manifest; declares the `open-prose` plugin (v0.8.1) with name, description, author, repository, and keywords
- `marketplace.json` — marketplace listing; registers the `open-prose` skill with its source path and description for discovery via `npx skills add openprose/prose`
