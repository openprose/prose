---
role: upgrade-history
summary: |
  Compact OpenProse version history and model-guided upgrade instructions.
  Load only for `prose upgrade`, `prose upgrade --dry-run`, or when diagnosing
  potentially outdated project structure.
---

# OpenProse Changelog

This file is the deferred upgrade brain. `SKILL.md` names old-structure smells;
load this file only after the user asks for an upgrade or wants the migration
plan.

## Current Conventions

- Authored source files are `*.prose.md`.
- Every workspace has an active OpenProse root.
- Native repositories use the repository root as the OpenProse root.
- Attached repositories use `repo/.agents/prose`.
- User-global OpenProse uses `~/.agents/prose`.
- The root contains `src/`, `dist/`, `runs/`, `state/`, `deps/`,
  `prose.lock`, and `.env`.
- Durable cross-run agents live in `state/agents/`.
- Durable responsibility status and pressure live in `state/responsibilities/`.
- Multi-file systems conventionally use `index.prose.md`.
- Generated run internals include the compiled activation manifest,
  `root.prose.md`, and `vm.log.md`.

## History

- `v0.4.x`: early skill discovery, `prose help`, filesystem state, examples in
  the skill directory, migration guide.
- `v0.5.x`: SQLite state management, recursive blocks, PostgreSQL state backend.
- `v0.6.x` and `v0.7.x`: RLM examples, mid-program inputs, remote program
  resolution, registry URL documentation, meta-level examples.
- `v0.8.x`: library and memory programs, simplified registry syntax,
  interactive example, system-prompt support.
- `v0.9.0`: v2 migration. Legacy `.prose` files were removed, examples and
  library programs moved to Contract Markdown `.md`, and the old migration
  helper moved under the open-prose skill.
- CLI `0.1.x`: real `prose` CLI and harness support shipped, including Claude
  and Codex plugin surfaces.
- Current unreleased docs: vocabulary settled on `kind: service`, `kind:
  system`, `kind: gateway`, `kind: test`, `kind: pattern`, and
  `kind: responsibility`; patterns replaced topology/composite
  language; source files moved to `*.prose.md`; generated run files were
  disambiguated; the filesystem model settled on a single OpenProse root with
  `src/`, `dist/`, `runs/`, `state/`, and `deps/`; Responsibility Runtime
  status reads active IR, trigger plans, recent runs, and responsibility
  status/pressure from the OpenProse root.

## Upgrade Command

`prose upgrade --dry-run`:

1. Inspect the current working directory, repository root when detectable, and
   any explicitly supplied path.
2. Look for old structures: `.prose/`, `~/.prose/`, `.deps/`,
   `.agents/prose/agents/`, `dist/prose/`, lockfiles outside the active
   OpenProse root, plain source `*.md` with `kind:`, standalone `*.prose`,
   `index.md`, `manifest.md`, `root.md`, and `state.md`.
3. Inspect nearby files before deciding. Do not rely only on filenames.
4. Print the exact planned moves, renames, content rewrites, and skipped
   ambiguous items. Do not edit files.

`prose upgrade`:

1. Run the same inspection and planning pass.
2. Apply only changes with clear source and destination paths.
3. Preserve content and provenance. Prefer moves/renames over delete/recreate.
4. Update nearby references after renaming files.
5. Report every change and every ambiguity left for the user.

## Migration Map

| Old | Current |
|-----|---------|
| `.prose/.env` | `<openprose-root>/.env` |
| `.prose/runs/` | `<openprose-root>/runs/` |
| `.prose/agents/` | `<openprose-root>/state/agents/` |
| `.agents/prose/agents/` | `<openprose-root>/state/agents/` |
| `~/.prose/` | `~/.agents/prose/` |
| `.deps/` | `<openprose-root>/deps/` |
| `dist/prose/` | `<openprose-root>/dist/` |
| misplaced `prose.lock` | `<openprose-root>/prose.lock` |
| source `*.md` with `kind:` | `*.prose.md` under `<openprose-root>/src/` |
| `index.md` system root | `index.prose.md` |
| standalone `*.prose` | `*.prose.md` with Contract Markdown frontmatter and `### Execution` |
| run `manifest.md` | compiled activation manifest |
| run `root.md` | `root.prose.md` |
| run `state.md` | `vm.log.md` |

## Standalone `.prose` Migration

Infer the Contract Markdown wrapper:

- `input name: "description"` becomes `### Requires` entry `name`.
- `output name = expression` becomes `### Ensures` entry `name`; preserve the
  expression in `### Execution`.
- `return value` remains the execution result.
- `use` declarations remain in the execution block only when the script is
  intentionally calling installed dependencies directly. Prefer `### Services`
  when the dependency is part of a system graph.
- Add `kind: service` unless the file clearly composes multiple services, in
  which case use `kind: system` with `### Services`.

When the old script's interface cannot be inferred confidently, dry-run must
name the uncertainty. Full upgrade should ask before changing that file.
