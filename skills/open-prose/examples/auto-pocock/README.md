# Auto-Pocock

An automated, non-interactive OpenProse adaptation of [Matt Pocock's public
engineering-skill workflow][pocock-skills]. One subagent grills, another
decides — because there is no human in the loop.

The system in [`src/auto-pocock.prose.md`](./src/auto-pocock.prose.md) chains
nine inner services that apply Pocock's published skills (`grill-with-docs`,
`to-prd`, `to-issues`, `tdd`, `setup-matt-pocock-skills`,
`git-guardrails-claude-code`) under a single Prose system, plus three
OpenProse adaptations that make the workflow runnable unattended.

## What it does

```
feature_brief + agent_skills_config
        │
        ▼
ensure-skills      ← setup-matt-pocock-skills (verify only, no scaffold)
        │
        ▼
grill-plan         ← grill-with-docs (recommend, do not decide)
        │
        ▼
decide-plan        ← OpenProse adaptation (stands in for the human)
        │
        ▼
produce-prd        ← to-prd (Pocock's 7 PRD sections, verbatim)
        │
        ▼
produce-issues     ← to-issues (HITL/AFK vertical slices)
        │
        ▼
triage-and-pick    ← Pocock's 5 canonical triage labels
        │
        ▼
implement-tdd      ← tdd (one test → minimal code → repeat)
        │
        ▼
verify-slice       ← OpenProse adaptation (pass/fail acceptance gate)
        │
        ▼
review-and-commit  ← git-guardrails-claude-code (no push, no force, local commit only)
        │
        ▼
implementation_report + verify_report + review_report + commit_sha
```

## What's Pocock's, what's our adaptation

| Service | Source |
| --- | --- |
| `ensure-skills` | Verifies the per-repo conventions Pocock's `setup-matt-pocock-skills` produces. Does not run setup itself (that skill is interactive). |
| `grill-plan` | Applies Pocock's `grill-with-docs`. **Adaptation:** non-interactive — recommends answers grounded in repository evidence rather than asking the user one question at a time, which is how Pocock's own grilling is designed to run. |
| `decide-plan` | **OpenProse adaptation.** Pocock resolves decisions inline within `grill-with-docs`; this service stands in for the human judgment normally provided mid-session. |
| `produce-prd` | Applies Pocock's `to-prd` verbatim — Problem, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes. |
| `produce-issues` | Applies Pocock's `to-issues` verbatim — vertical-slice tracer-bullet thinking, HITL vs AFK split. |
| `triage-and-pick` | Applies Pocock's five canonical labels from `setup-matt-pocock-skills/triage-labels.md`: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. |
| `implement-tdd` | Applies Pocock's `tdd` red-green-refactor loop and the rules in `tdd/tests.md`, `tdd/mocking.md`, `tdd/deep-modules.md`, `tdd/refactoring.md`, `tdd/interface-design.md`. **Adaptation:** `red_evidence` / `green_evidence` / `refactor_notes` are harness-level bindings; `tdd/SKILL.md` describes the loop in prose without naming those artifacts. |
| `verify-slice` | **OpenProse adaptation.** Deliberately not named `qa`, because Pocock's `qa` skill is a different thing: an interactive **upstream** session where the user reports bugs conversationally and the agent files issues. This service is a downstream pass/fail acceptance gate. |
| `review-and-commit` | Enforces the no-push, no-force, no-`reset --hard`, no-`checkout .` discipline from Pocock's [`git-guardrails-claude-code`][pocock-guardrails] skill. The discipline is encoded as service invariants and prohibitions; the skill is referenced in prose but not declared in `### Skills` so the example compiles without requiring users to install it. |

## Prerequisites

This example expects the per-repo Pocock conventions to be set up first.
Run Pocock's [`setup-matt-pocock-skills`][pocock-setup] in your repo to
scaffold the three convention files:

- `docs/agents/issue-tracker.md` — where PRDs, issues, and notes live
- `docs/agents/triage-labels.md` — the canonical label vocabulary
- `docs/agents/domain.md` — where the domain glossary and ADRs live

Auto-Pocock reads these verbatim via `ensure-skills` and halts if any are
missing.

## Running it

```bash
prose run skills/open-prose/examples/auto-pocock/src/auto-pocock.prose.md \
  --feature_brief "<your feature brief>" \
  --agent_skills_config "<path to docs/agents/>"
```

The run produces:

- `decision_records`, `grilled_plan`, `chosen_terminology` from the
  grilling phase
- `prd`, `issues` written to your repo's `issue-tracker.md` location
- `chosen_slice` and `triage_labels_applied` from triage
- `implementation_report` plus TDD `red_evidence`, `green_evidence`,
  `refactor_notes`
- `verify_report` from the acceptance check
- `review_report` and `commit_sha` — `commit_sha: null` with a reason if
  verification did not pass

## Credit

Matt Pocock publishes the underlying skills at
[github.com/mattpocock/skills][pocock-skills]. He has written and talked
extensively about the workflow this example automates; this example is a
tribute, not a substitute. Where his skills are interactive by design, we
say so plainly and mark our non-interactive split as an OpenProse
adaptation, not as how Pocock himself runs it.

[pocock-skills]: https://github.com/mattpocock/skills
[pocock-setup]: https://github.com/mattpocock/skills/blob/main/setup-matt-pocock-skills/SKILL.md
[pocock-guardrails]: https://github.com/mattpocock/skills/tree/main/git-guardrails-claude-code
