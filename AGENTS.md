# OpenProse for Codex

This repository includes the full OpenProse specification and skill content needed to run OpenProse workflows in Codex.

## When to activate

Treat OpenProse as active when the user:

- runs any `prose` command such as `prose run`, `prose compile`, `prose migrate`, `prose help`, or `prose test`
- asks to execute a `.prose` or OpenProse `.md` program
- mentions OpenProse, Prose programs, Forme, or multi-agent orchestration defined by contracts

## Entry point

Read `skills/open-prose/SKILL.md` first. It is the canonical router for all `prose` commands and points to the minimum additional files required for each task.

Do not search the workspace for alternate copies of the OpenProse documentation. The canonical files are the ones bundled under `skills/open-prose/`.

## Execution model

OpenProse assumes a Prose Complete environment:

- the agent can read and write files
- the agent can execute tool calls
- the agent can spawn or coordinate subagents when available

If those capabilities are available, use the bundled specifications directly. No separate runtime is required.

## File routing

- For `.md` programs, follow the two-phase routing described in `skills/open-prose/SKILL.md`.
- For `.prose` programs, use the legacy v0 routing described there.
- For authoring new programs, load the guidance files referenced by the skill before writing code.

## Scope

The files in `commands/` are Claude Code slash-command wrappers. They are optional convenience entry points, not the language runtime itself.
