---
purpose: Custom Claude Code slash commands for the OpenProse VM
related:
  - ../README.md
  - ../skills/open-prose/SKILL.md
  - ../cli/README.md
---

# commands

Claude Code slash commands bundled with the prose repo. These commands provide
the primary Claude Code interface for the OpenProse VM. The optional
[`cli/`](../cli/README.md) package exposes the same `prose ...` command language
from a shell by forwarding prompts to an authenticated harness.

## Contents

- `prose-boot.md` — `/prose-boot`: initialize the OpenProse VM, detect existing state, welcome new or returning users
- `prose-run.md` — `/prose-run <file>`: execute a program; the LLM becomes the OpenProse VM and runs the program
- `prose-lint.md` — `/prose-lint <file.md>`: validate structure, schema, shapes, and contracts without executing
- `prose-preflight.md` — `/prose-preflight <file.md>`: check dependencies and environment variables before a run
- `prose-inspect.md` — `/prose-inspect <run-id>`: evaluate a completed run
- `prose-status.md` — `/prose-status`: show recent runs
