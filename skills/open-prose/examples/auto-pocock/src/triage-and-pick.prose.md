---
name: triage-and-pick
kind: function
---

# Triage And Pick

### Description

Re-apply Pocock's canonical triage vocabulary across every issue and
select the single AFK slice this run will implement. `to-issues` already
attaches a publish-time label per its `SKILL.md` ("publish them with the
correct triage label unless instructed otherwise"); this service labels
every issue against the full five-state vocabulary and picks the
implementation target.

### Parameters

- `issues`: issue breakdown from `produce-issues`
- `triage-label-convention`: canonical labels from `ensure-skills`

### Returns

- `triage-labels-applied`: mapping of `issue_id -> triage_label` using
  exactly one canonical label per issue from
  `setup-matt-pocock-skills/triage-labels.md`
- `chosen-slice`: the single highest-value AFK slice picked for
  `implement-tdd`, including `issue_id`, `acceptance_criteria`, and a
  rationale for the pick

### Shape

- `self`: assign one canonical label per issue (Pocock's full vocabulary,
  including HITL ones), then pick the lowest-numbered AFK slice with no
  unresolved blockers as `chosen-slice`
- `prohibited`: inventing labels not in `triage-label-convention`, or
  picking a slice whose `blocked_by` is not yet resolved

### Strategies

- Label all five Pocock states where they apply: `needs-triage`,
  `needs-info`, `ready-for-agent` (AFK), `ready-for-human` (HITL),
  `wontfix`. Pocock's HITL/AFK split is preserved at the labeling layer;
  picking only AFK for `chosen-slice` is a property of the autonomous
  pipeline, not of his teaching.
- When two AFK slices tie, prefer the lowest issue number so the pick is
  reproducible.
