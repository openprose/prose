---
purpose: Custom Claude Code slash commands for the OpenProse CLI
related:
  - ../README.md
  - ../skills/open-prose/README.md
---

# commands

Claude Code slash commands bundled with the prose repo. They route to the
repository CLI and graph-VM model.

## Contents

- `prose-boot.md` — `/prose-boot`: orient the user to the OpenProse CLI and examples
- `prose-run.md` — `/prose-run <file>`: execute a `.prose.md` program through `prose run`
- `prose-handoff.md` — `/prose-handoff <file>`: export a single component contract for a compatible one-off harness
- `prose-lint.md` — `/prose-lint <file.prose.md>`: validate structure, schema, shapes, and contracts without executing
- `prose-preflight.md` — `/prose-preflight <file.prose.md>`: check dependencies and environment variables before a run
- `prose-inspect.md` — `/prose-inspect <run-id>`: inspect a completed run and decide whether to run evals
- `prose-status.md` — `/prose-status`: show recent runs
