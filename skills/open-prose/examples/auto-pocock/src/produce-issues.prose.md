---
name: produce-issues
kind: service
---

# Produce Issues

### Description

Apply the local Matt Pocock `to-issues` skill to the PRD and produce
tracer-bullet vertical slices, stored where the repo's `issue-tracker.md`
says.

### Requires

- `prd`: PRD from `produce-prd`
- `chosen_terminology`: glossary from `decide-plan`
- `issue_tracker_convention`: storage location convention from
  `ensure-skills`

### Ensures

- `issues`: vertical-slice issues each with
  `{title, type: HITL|AFK, blocked_by, user_stories_covered,
  acceptance_criteria}`, written to the location named in
  `issue_tracker_convention`. The HITL/AFK split and the
  vertical-slice/tracer-bullet vocabulary come from `to-issues/SKILL.md`.

### Skills

- to-issues

### Strategies

- Honor the repo's `issue-tracker.md` for storage; do not open GitHub
  Issues unless the convention says so.
- Use `chosen_terminology` for every issue title and acceptance criterion.
- Prefer AFK over HITL slices where the work can be completed
  autonomously, per `to-issues/SKILL.md`'s "Prefer AFK over HITL where
  possible" stance.
- Number issues so `triage-and-pick` can choose deterministically.
