---
name: ensure-skills
kind: function
---

# Ensure Skills

### Description

Find or scaffold the per-repo Matt Pocock skill conventions so downstream
services know where the issue tracker, triage labels, and domain docs
live. The system runs even when the user has never set up Pocock's skill
conventions before — first-time users get sensible defaults at the
conventional location and a clear note that they were auto-created.

### Returns

- `issue-tracker-convention`: contents of the repo's `issue-tracker.md`
  (either found in place or freshly scaffolded with Pocock's defaults)
- `triage-label-convention`: contents of `triage-labels.md` (same)
- `domain-doc-layout`: contents of `domain.md` (same)
- `conventions-path`: the directory the conventions live at, so the
  user knows where to edit later

### Skills

- setup-matt-pocock-skills

### Shape

- `self`: search the workspace for the per-repo Pocock convention files;
  if any are missing, scaffold them at the conventional location with
  Pocock's defaults; publish all three as public bindings for downstream
  services
- `prohibited`: overwriting existing convention files, contacting any
  remote service, or proceeding without all three conventions resolved

### Strategies

- Look first at `docs/agents/`. That is Pocock's documented convention
  in `setup-matt-pocock-skills/SKILL.md`. Then check
  `.scratch/matt-skills/docs/agents/` (the local-markdown variant his
  skill scaffolds for repos that prefer not to use GitHub Issues). Then
  scan the repo's `AGENTS.md` and `CLAUDE.md` for any `## Agent skills`
  block that points elsewhere.
- If the run's working tree already has any of the three convention
  files anywhere under the searched locations, treat that location as
  the conventions directory and publish whatever is there verbatim. Do
  not overwrite.
- If none of the three convention files are found anywhere, scaffold
  them at `docs/agents/` using Pocock's defaults:
  GitHub Issues as the issue tracker (or local markdown if a
  `.scratch/` convention is already visible in the repo), the canonical
  five-label triage vocabulary (`needs-triage`, `needs-info`,
  `ready-for-agent`, `ready-for-human`, `wontfix`), and `CONTEXT.md` /
  `docs/adr/` as the domain doc layout. Top each scaffolded file with a
  one-line banner: *"Auto-created by `auto-pocock` from Pocock's
  defaults; edit to match this repo and re-run when ready."*
- This scaffold step is an OpenProse adaptation. Pocock's own
  `setup-matt-pocock-skills` is interactive ("present what you found,
  confirm with the user, then write"). The unattended adaptation here
  uses defaults instead of prompting, and flags the files so the user
  knows to review them.
- Publish the conventions verbatim so downstream services can quote
  them directly.
