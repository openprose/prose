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
- `agent_skills_config`: path to the `docs/agents/` directory defining the
  issue tracker, triage labels, and domain doc layout for this repo, per
  Pocock's `setup-matt-pocock-skills/SKILL.md`

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

- `ensure-skills` runs first and halts the system if `docs/agents/` is
  missing the issue-tracker, triage-labels, or domain conventions Pocock's
  `setup-matt-pocock-skills` expects.
- Every phase answers from the repository before deferring to the user;
  `unresolved` is only used when repo evidence is genuinely absent. This
  mirrors `grill-with-docs/SKILL.md`'s "answer from the repository when
  the answer is discoverable" stance.
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
- The system never pushes, force-operates, rewrites history, or commits
  when verification fails. `commit_sha` refers to a local commit only.
  This stance aligns with Pocock's `git-guardrails-claude-code` skill,
  which blocks `git push`, `git reset --hard`, `git clean -f`, and
  `git checkout .`.

## ensure-skills

### Description

Confirm that the per-repo Pocock skill conventions exist and are readable,
so downstream skills know where the issue tracker, triage labels, and
domain docs live. Halts the system if any are missing, per
`setup-matt-pocock-skills/SKILL.md`'s "do not bootstrap or repair beads
unless the user asked" stance applied to conventions.

### Requires

- `agent_skills_config`: path to `docs/agents/` for this repo

### Ensures

- `issue_tracker_convention`: contents of `issue-tracker.md` describing
  where PRDs, issues, and notes live
- `triage_label_convention`: contents of `triage-labels.md` describing the
  canonical label vocabulary
- `domain_doc_layout`: contents of `domain.md` describing the domain
  glossary and ADR locations

### Skills

- setup-matt-pocock-skills

### Shape

- `self`: read the three conventions from `agent_skills_config` and
  publish them as public bindings for downstream services
- `prohibited`: scaffolding new convention files mid-run, contacting any
  remote service, or proceeding when a convention file is missing

### Strategies

- Treat each missing convention as a hard halt with a single actionable
  message naming the absent file.
- Do not paraphrase the conventions; publish them verbatim so downstream
  services can quote them.
- This service does not run `setup-matt-pocock-skills` itself — Pocock's
  setup skill is interactive ("present what you found, confirm with the
  user, then write"). This service only verifies the artifacts a prior
  setup run produced.

## grill-plan

### Description

Apply the local Matt Pocock `grill-with-docs` skill to challenge the
feature brief and surface the decision tree. Pocock's grilling is
interactive by design ("ask the questions one at a time, waiting for
feedback on each question"); in this auto-pocock pipeline, this subagent
recommends answers grounded in repository evidence rather than asking the
user. Decision-making is split out into `decide-plan` as a separate
service so the recommend-vs-decide boundary is explicit.

### Requires

- `feature_brief`: initial feature idea to challenge and clarify
- `domain_doc_layout`: where the domain glossary lives in this repo

### Ensures

- `grill_brief`: focused challenge report with questions, why they matter,
  recommended answers, risks, terminology corrections, and unresolved
  unknowns
- `decision_records`: numbered list of
  `{question, recommended_answer, confidence, source, residual_risk}`
  where `source` is one of `brief`, `repo`, or `unresolved`
- `terminology_glossary`: resolved domain terms with avoid-aliases,
  conflicts flagged against the existing glossary, ready to write back to
  the domain-glossary file named in `domain_doc_layout`

### Skills

- grill-with-docs

### Shape

- `self`: challenge the plan, inspect the repository for discoverable
  answers, recommend answers, and identify unresolved questions
- `prohibited`: making final product or implementation decisions, opening
  GitHub Issues, or writing into the issue-tracker location (that is
  `produce-issues`' job)

### Strategies

- Convert every would-be user question into a `decision_record` with a
  recommended answer, confidence, source, and residual risk. Note: the
  named-evidence shape (`decision_records` as a structured binding) is an
  OpenProse harness adaptation; `grill-with-docs/SKILL.md` describes the
  output in prose, not as a typed record.
- If a question can be answered from the repository, mark `source: repo`
  and cite the file; otherwise mark `source: brief` or `source: unresolved`.
- Use the existing domain glossary in `domain_doc_layout` as the starting
  vocabulary; flag drift instead of inventing terms, per
  `grill-with-docs/CONTEXT-FORMAT.md`.
- Offer an ADR only when the decision is hard-to-reverse AND surprising
  AND a real trade-off, per `grill-with-docs/ADR-FORMAT.md`; otherwise
  omit ADR scope.
- When a term is resolved, capture the resolution in
  `terminology_glossary` so `decide-plan` can commit it to the live
  glossary, mirroring Pocock's "update CONTEXT.md right there, don't
  batch these up" rule applied at the service boundary.

## decide-plan

### Description

Turn the griller's challenge report into a decision-ready plan and lock
the terminology the rest of the run must use verbatim. This service is an
OpenProse adaptation — Pocock's `grill-with-docs` resolves decisions
inline within the same interactive session and does not have a separate
"decider" step. The split exists here only because the grilling subagent
is non-interactive; the decider service stands in for the human
judgment Pocock's flow normally provides.

### Requires

- `feature_brief`: original feature brief
- `grill_brief`: challenge report from `grill-plan`
- `decision_records`: numbered decision log from `grill-plan`
- `terminology_glossary`: drafted glossary from `grill-plan`

### Ensures

- `grilled_plan`: clarified decisions, terminology, risks, and open
  questions ready for PRD generation
- `chosen_terminology`: final glossary that PRD, issues, implementation,
  and review must use verbatim
- `open_questions`: questions intentionally left unresolved, each with the
  exact plan risk the unresolved question creates

### Shape

- `self`: make final planning decisions from the original brief,
  repository evidence, and the griller's recommendations
- `prohibited`: reopening a live user interview, hiding unresolved
  questions, inventing evidence, or introducing new domain terms beyond
  `terminology_glossary`

### Invariants

- Decisions never silently drop a `decision_record`; unanswered ones must
  appear in `open_questions` with explicit residual risk.

### Strategies

- Prefer the griller's recommended answer when it is grounded in
  repository evidence or the original brief.
- When the griller identifies unresolved ambiguity, choose a conservative
  v1 decision and record the residual risk in `open_questions`.
- Lock `chosen_terminology` before drafting the plan; do not coin new
  domain terms here.

## produce-prd

### Description

Apply the local Matt Pocock `to-prd` skill to the grilled plan and produce
a PRD using `to-prd/SKILL.md`'s seven sections verbatim.

### Requires

- `grilled_plan`: clarified plan from `decide-plan`
- `chosen_terminology`: glossary from `decide-plan`
- `issue_tracker_convention`: storage location convention so the PRD
  lands where the repo expects it

### Ensures

- `prd`: product requirements document with the seven Pocock sections —
  Problem, Solution, User Stories, Implementation Decisions, Testing
  Decisions, Out of Scope, Further Notes — written to the path named in
  `issue_tracker_convention`

### Skills

- to-prd

### Strategies

- Apply the `to-prd/SKILL.md` PRD template verbatim. Section names and
  ordering come from Pocock, not from us.
- Use `chosen_terminology` for every domain noun; do not introduce new
  domain terms here.
- Identify deep-module opportunities for testability and name them in
  Implementation Decisions, per `tdd/deep-modules.md`.
- Keep public-repo-sensitive workflow notes out of the PRD unless they
  are part of the product behavior.

## produce-issues

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

## triage-and-pick

### Description

Apply Pocock's canonical triage vocabulary to each issue and select the
single AFK slice this run will implement.

### Requires

- `issues`: issue breakdown from `produce-issues`
- `triage_label_convention`: canonical labels from `ensure-skills`

### Ensures

- `triage_labels_applied`: mapping of `issue_id -> triage_label` using
  exactly one canonical label per issue from
  `setup-matt-pocock-skills/triage-labels.md`
- `chosen_slice`: the single highest-value AFK slice picked for
  `implement-tdd`, including `issue_id`, `acceptance_criteria`, and a
  rationale for the pick

### Shape

- `self`: assign one canonical label per issue (Pocock's full vocabulary,
  including HITL ones), then pick the lowest-numbered AFK slice with no
  unresolved blockers as `chosen_slice`
- `prohibited`: inventing labels not in `triage_label_convention`, or
  picking a slice whose `blocked_by` is not yet resolved

### Strategies

- Label all five Pocock states where they apply: `needs-triage`,
  `needs-info`, `ready-for-agent` (AFK), `ready-for-human` (HITL),
  `wontfix`. Pocock's HITL/AFK split is preserved at the labeling layer;
  picking only AFK for `chosen_slice` is a property of the autonomous
  pipeline, not of his teaching.
- When two AFK slices tie, prefer the lowest issue number so the pick is
  reproducible.

## implement-tdd

### Description

Apply the local Matt Pocock `tdd` skill to implement the `chosen_slice`
using a red-green-refactor loop, with evidence captured at each step so
`verify-slice` and `review-and-commit` can audit the loop independently.

### Requires

- `chosen_slice`: the AFK slice from `triage-and-pick`
- `chosen_terminology`: glossary from `decide-plan` so tests and code use
  resolved vocabulary

### Ensures

- `implementation_report`: behavior implemented, tests added or changed,
  commands run, files touched, and residual risks
- `red_evidence`: failing test name, failure output, and test file path
  (harness-level evidence; `tdd/SKILL.md` describes the red step in
  prose without demanding a named artifact)
- `green_evidence`: same test passing, with the exact focused command
  run (same caveat as `red_evidence`)
- `refactor_notes`: what changed under green, or `"none"` if no refactor
  was needed (same caveat)

### Skills

- tdd

### Shape

- `self`: write one failing behavior test, implement the smallest code
  change, rerun the focused test, refactor only when green, and publish
  the report and evidence
- `prohibited`: broad refactors, unrelated file edits, pushing, committing,
  writing all tests first before any implementation, mocking internal
  collaborators, or hiding failing tests

### Strategies

- One test → one minimal implementation → repeat. Never write a
  horizontal slice of tests first. This is Pocock's `tdd/SKILL.md`
  rule: "DO NOT write all tests first, then all implementation."
- Name tests in `chosen_terminology` vocabulary, per `tdd/tests.md`.
- Tests assert behavior through public interfaces only; no internal
  collaborator mocks. Pocock's `tdd/mocking.md` is the source —
  "Don't mock... your own classes/modules, internal collaborators".
- Prefer deep modules with small public surfaces, per
  `tdd/deep-modules.md` and `tdd/interface-design.md`.
- Refactor only on green, per `tdd/refactoring.md`.
- If the repo already contains the intended fix, prove it with a
  regression test and report `refactor_notes: "none — pre-existing"`.

## verify-slice

### Description

Independently verify that the implemented behavior works end-to-end
through the slice's stated acceptance criteria, separate from the TDD
inner loop. This service is not Pocock's `qa` skill: his `qa` is an
**interactive upstream** session where the user reports bugs
conversationally and the agent files issues. This service is a
**downstream pass/fail acceptance check** before commit. The names are
deliberately different so the two are not confused.

### Requires

- `chosen_slice`: the slice's acceptance criteria
- `green_evidence`: the focused test command from `implement-tdd`

### Ensures

- `verify_report`: reproducible command, observed behavior, and pass/fail
  per acceptance criterion

### Shape

- `self`: re-run the focused test command, then exercise the acceptance
  criteria through the slice's public surface and record observed
  behavior
- `prohibited`: skipping criteria, asserting behavior the slice did not
  promise, or marking pass without an observed command output

### Strategies

- Treat a single failing acceptance criterion as overall `fail`; the
  review phase will not commit on a failing `verify_report`.
- Prefer the smallest reproducible command that demonstrates each
  criterion.

## review-and-commit

### Description

Review the implementation diff and TDD evidence, address scoped gaps,
re-run verification, and create a local commit only when verification
passes. Pocock's `git-guardrails-claude-code` skill is the source of the
"never push, never force-operate" stance enforced here.

### Requires

- `implementation_report`: report from `implement-tdd`
- `red_evidence`: from `implement-tdd`, to confirm the red-green loop
  actually happened
- `green_evidence`: from `implement-tdd`, to re-run before staging
- `verify_report`: from `verify-slice`
- `chosen_terminology`: glossary so the commit message uses resolved
  vocabulary

### Ensures

- `review_report`: review findings, fixes applied, verification commands,
  files committed, and residual risks
- `commit_sha`: the single local commit SHA when verification passed, or
  `null` with reason when it did not

### Skills

- tdd
- git-guardrails-claude-code

### Shape

- `self`: inspect the implementation diff, review for bugs and missing
  tests, address scoped gaps, re-run `green_evidence`'s command, and
  create a single local commit if `verify_report` and re-run verification
  both pass
- `prohibited`: pushing, force operations, committing unrelated files,
  rewriting history, committing when verification fails, or committing
  when `verify_report` shows any failing criterion. These prohibitions
  match `git-guardrails-claude-code`'s explicit blocks on `git push`,
  `git reset --hard`, `git clean -f`, and `git checkout .`.

### Strategies

- Start with a code-review stance: findings first, then fixes.
- Re-run `green_evidence`'s focused command before staging.
- Stage only files that belong to the implementation run.
- Use a plain commit message that describes the behavior in
  `chosen_terminology` vocabulary; Pocock does not mandate Conventional
  Commits and we do not impose them here.
- If verification cannot pass, publish the review report with
  `commit_sha: null` and a reason; do not commit.
