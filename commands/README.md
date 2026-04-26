---
purpose: Custom Claude Code slash commands that route to the current OpenProse CLI
related:
  - ../README.md
  - ../skills/open-prose/README.md
---

# commands

Claude Code slash commands bundled with the prose repo. These commands should
route to the repository CLI and current graph-VM model.

## Contents

- `prose-boot.md` — `/prose-boot`: orient the user to the current OpenProse CLI and examples
- `prose-run.md` — `/prose-run <file>`: execute a `.prose.md` program through `prose run`
- `prose-lint.md` — `/prose-lint <file.prose.md>`: validate structure, schema, shapes, and contracts without executing
- `prose-preflight.md` — `/prose-preflight <file.prose.md>`: check dependencies and environment variables before a run
- `prose-inspect.md` — `/prose-inspect <run-id>`: evaluate a completed run
- `prose-status.md` — `/prose-status`: show recent runs
