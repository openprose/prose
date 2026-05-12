---
name: auto-pocock
kind: system
---

# Auto-Pocock

### Description

An automated, non-interactive OpenProse adaptation of the public Matt Pocock
engineering-skill workflow (`grill-with-docs`, `to-prd`, `to-issues`, `tdd`,
plus his `setup-matt-pocock-skills` per-repo conventions). One subagent
grills, another decides — because there is no human in the loop. Pocock's
own `grill-with-docs` is explicitly interactive ("ask the questions one at
a time, waiting for feedback on each question before continuing"); the
two-subagent split here is our adaptation for unattended runs, not a claim
that Pocock himself runs it this way.

Names, vocabulary, and template structure are credited to Pocock and
referenced verbatim against the public `mattpocock/skills` repo wherever
possible. Where we depart from his materials, the service notes call it out
as an OpenProse adaptation rather than implying it is his teaching.

### Services

- `ensure-skills`
- `grill-plan`
- `decide-plan`
- `produce-prd`
- `produce-issues`
- `triage-and-pick`
- `implement-tdd`
- `verify-slice`
- `review-and-commit`

### Requires

- `feature_brief`: initial feature idea to challenge, clarify, and ship

The system discovers the per-repo Pocock skill conventions itself (see
`ensure-skills`). First-time users do not need to point at
`docs/agents/` explicitly — the system finds the conventions wherever
the repo already keeps them and scaffolds Pocock's defaults if absent.

### Ensures

- `decision_records`: numbered grilling decision log with recommended
  answers, confidence, source, and residual risk (OpenProse evidence
  structure layered on Pocock's grilling output)
- `grilled_plan`: clarified decisions, terminology, risks, and open
  questions ready for PRD generation
- `chosen_terminology`: final glossary used verbatim by PRD, issues,
  implementation, and review phases
- `prd`: product requirements document for the feature, written under
  Pocock's seven PRD sections
- `issues`: vertical-slice issue breakdown labeled per the repo's triage
  vocabulary
- `chosen_slice`: the single AFK slice picked for implementation, with the
  rationale for the pick
- `implementation_report`: behavior implemented, tests added or changed,
  commands run, files touched, and residual risks
- `verify_report`: independent behavior verification of the implemented
  slice with reproducible command and pass/fail
- `review_report`: review findings, fixes applied, verification commands,
  files committed, and residual risks
- `commit_sha`: the single local commit SHA when verification passes, or
  `null` with reason when it does not

### Invariants

- `ensure-skills` runs first. It discovers the per-repo Pocock skill
  conventions wherever the workspace already keeps them, or scaffolds
  Pocock's defaults at the conventional location if none exist. The
  rest of the system never operates without the three conventions
  resolved.
- Every phase answers from the repository before deferring to the user;
  `unresolved` is only used when repo evidence is genuinely absent. This
  mirrors `grill-with-docs/SKILL.md`'s explore-the-codebase stance:
  *"If a question can be answered by exploring the codebase, explore the
  codebase instead."*
- Vocabulary resolved during grilling is preserved verbatim through PRD,
  issues, implementation, and review phases. Pocock's `grill-with-docs`
  glossary rule is preserved here as a strong norm; we honor his "flag
  drift, do not invent" posture and expect glossary gaps to be named, not
  filled silently.
- Every issue carries exactly one canonical triage label from the repo's
  `triage-labels.md` (Pocock's canonical labels:
  `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
  `wontfix`).
- AFK-shippability: `chosen_slice` is an AFK slice the agent can complete
  without mid-run human review. HITL slices remain in `issues` for human
  pickup — Pocock's HITL/AFK split is preserved at the issue level; the
  autonomous pipeline simply picks from the AFK lane.
- The implementation phase makes the smallest production change that turns
  a failing behavior test green; no broad refactors or unrelated edits
  (Pocock's `tdd/SKILL.md` "DO NOT write all tests first, then all
  implementation" rule).
- `review-and-commit` does not commit when verification fails;
  `commit_sha` is `null` with a reason in that case.
