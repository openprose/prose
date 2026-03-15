---
purpose: The websh skill — shell-style web navigation that treats URLs as a filesystem and DOM content as queryable files
related:
  - ../README.md
  - ../../README.md
  - ../../../../../marketing/remotion-video/README.md
glossary:
  websh: A shell interface where URLs are paths, cached page content is the filesystem, and Unix-like commands (ls, grep, cat, cd) operate on web pages
---

# websh

A Claude Code skill that turns web browsing into shell navigation. Activates on `websh` commands or shell-style URL navigation requests.

## Contents

- `SKILL.md` — skill activation rules and interface definition
- `PLAN.md` — implementation plan and design notes
- `commands.md` — available websh commands and their semantics
- `help.md` — user-facing help output
- `shell.md` — shell state model (current URL, page cache, navigation history)
- `state/` — state management for the websh session (cached pages, history)
