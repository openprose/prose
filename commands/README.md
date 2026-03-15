---
purpose: Custom Claude Code slash commands providing the primary user-facing interface for the OpenProse VM — boot, compile, and run
related:
  - ../README.md
  - ../skills/open-prose/README.md
  - ../skills/open-prose/compiler.md
---

# commands

Claude Code slash commands bundled with the prose repo. These commands provide the primary user-facing interface for the OpenProse VM.

## Contents

- `prose-boot.md` — `/prose-boot`: initialize the OpenProse VM, detect existing state, welcome new or returning users
- `prose-compile.md` — `/prose-compile`: parse and validate a .prose file without executing it; outputs a compiled execution plan
- `prose-run.md` — `/prose-run <file.prose>`: execute a .prose program; the LLM becomes the OpenProse VM and runs the program
