# Auto-Pocock

An automated, non-interactive OpenProse adaptation of [Matt Pocock's public
engineering-skill workflow][pocock-skills]. One service grills, another
decides, because there is no human in the loop.

The system in [`src/auto-pocock.prose.md`](./src/auto-pocock.prose.md) chains
nine inner services that apply Pocock's published skills (`grill-with-docs`,
`to-prd`, `to-issues`, `tdd`, `setup-matt-pocock-skills`) under a single
Prose system, plus three OpenProse adaptations that make the workflow
runnable unattended.

## What it does

```
feature_brief
        │
        ▼
ensure-skills      ← setup-matt-pocock-skills (find or scaffold conventions)
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
review-and-commit  ← review + re-verify, then create one local commit
        │
        ▼
implementation_report + verify_report + review_report + commit_sha
```

## What's Pocock's, what's our adaptation

| Service             | Source                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensure-skills`     | Finds the per-repo conventions Pocock's `setup-matt-pocock-skills` produces, or scaffolds them at `docs/agents/` with Pocock's defaults if absent. The scaffold path is an **OpenProse adaptation**: Pocock's setup skill is interactive ("present what you found, confirm with the user, then write"), and this unattended version uses defaults instead of prompting, with a banner on each scaffolded file noting it was auto-created. |
| `grill-plan`        | Applies Pocock's `grill-with-docs`. **Adaptation:** non-interactive, recommending answers grounded in repository evidence rather than asking the user one question at a time, which is how Pocock's own grilling is designed to run.                                                                                                                                                                                                      |
| `decide-plan`       | **OpenProse adaptation.** Pocock resolves decisions inline within `grill-with-docs`; this service stands in for the human judgment normally provided mid-session.                                                                                                                                                                                                                                                                         |
| `produce-prd`       | Applies Pocock's `to-prd` verbatim: Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes.                                                                                                                                                                                                                                                                                  |
| `produce-issues`    | Applies Pocock's `to-issues` verbatim: vertical-slice tracer-bullet thinking, HITL vs AFK split.                                                                                                                                                                                                                                                                                                                                          |
| `triage-and-pick`   | Applies Pocock's five canonical labels from `setup-matt-pocock-skills/triage-labels.md`: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.                                                                                                                                                                                                                                                                   |
| `implement-tdd`     | Applies Pocock's `tdd` red-green-refactor loop and the rules in `tdd/tests.md`, `tdd/mocking.md`, `tdd/deep-modules.md`, `tdd/refactoring.md`, `tdd/interface-design.md`. **Adaptation:** `red_evidence` / `green_evidence` / `refactor_notes` are harness-level bindings; `tdd/SKILL.md` describes the loop in prose without naming those artifacts.                                                                                     |
| `verify-slice`      | **OpenProse adaptation.** Deliberately not named `qa`, because Pocock's `qa` skill is a different thing: an interactive **upstream** session where the user reports bugs conversationally and the agent files issues. This service is a downstream pass/fail acceptance gate.                                                                                                                                                             |
| `review-and-commit` | Inspects the implementation diff and TDD evidence, re-runs the verification command, and creates a single local commit if it passes. Returns the commit SHA, or `null` with a reason if verification did not pass.                                                                                                                                                                                                                        |

## Prerequisites

**Required.** Pocock's skills must be installed on the host harness so
the compiler can resolve the `### Skills` declarations:

```bash
npx skills@latest add mattpocock/skills/grill-with-docs \
  mattpocock/skills/to-prd \
  mattpocock/skills/to-issues \
  mattpocock/skills/tdd \
  mattpocock/skills/setup-matt-pocock-skills
```

**Optional.** If you have already run Pocock's
[`setup-matt-pocock-skills`][pocock-setup] in this repo, auto-pocock will
find and use the conventions it produced at `docs/agents/`:

- `docs/agents/issue-tracker.md`: where PRDs, issues, and notes live
- `docs/agents/triage-labels.md`: the canonical label vocabulary
- `docs/agents/domain.md`: where the domain glossary and ADRs live

If you have not run that setup, `ensure-skills` will scaffold Pocock's
defaults inline at `docs/agents/` with a banner noting they were
auto-created so you can review and edit before the next run. First-time
users do not need to do anything before running auto-pocock.

## Running it

The only required runtime input is `--feature_brief`. The system
discovers or scaffolds everything else.

**Inside a clone of `openprose/prose`** (most common):

```bash
prose run skills/open-prose/examples/auto-pocock/src/auto-pocock.prose.md \
  --feature_brief "<your feature brief>"
```

**From inside this example's directory** (matches the `cd <example>`
pattern used by every other example in `skills/open-prose/examples/`):

```bash
cd skills/open-prose/examples/auto-pocock
prose run src/auto-pocock.prose.md --feature_brief "<your feature brief>"
```

**From outside the OpenProse repo** (in your own target codebase, with
a clone of `openprose/prose` available somewhere on disk):

```bash
prose run /path/to/openprose-prose/skills/open-prose/examples/auto-pocock/src/auto-pocock.prose.md \
  --feature_brief "<your feature brief>"
```

The system is currently multi-file under `src/`, so URL-fetch shortcuts
like `prose run https://raw.githubusercontent.com/.../auto-pocock.prose.md`
do **not** work: they only fetch the top-level file and the run halts
when it cannot resolve the nine sibling service files. Use a local
clone or copy the example directory.

If `--feature_brief` is missing, the run halts with the standard
`Missing required caller inputs: feature_brief` error in
non-interactive shells, or prompts for it in a TTY.

The run produces:

- `decision_records`, `grilled_plan`, `chosen_terminology` from the
  grilling phase
- `prd`, `issues` written to your repo's `issue-tracker.md` location
- `chosen_slice` and `triage_labels_applied` from triage
- `implementation_report` plus TDD `red_evidence`, `green_evidence`,
  `refactor_notes`
- `verify_report` from the acceptance check
- `review_report` and `commit_sha`; `commit_sha: null` with a reason if
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
