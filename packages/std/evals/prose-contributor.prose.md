---
name: prose-contributor
kind: system
---

# Prose Contributor

Given one or more completed OpenProse runs, turn real run friction into a small, reviewable contribution to `openprose/prose`. This system is the standard path from "this run taught us something" to "there is a proposal, local patch, or draft pull request that improves the library for the next agent."

Use this when a run exposes confusing docs, missing examples, weak std contracts, brittle eval criteria, or a repeated pattern that belongs in `packages/std/`. It is not a general refactoring system. It should choose one focused contribution path, grounded in run evidence and aligned with the repository contribution guidelines. Some contributions can go directly to a local patch or draft PR; language semantics, authored syntax, cross-layer changes, and unclear boundaries should go through a proposal-first path before any PR is opened.

### Services

- contribution-context
- evidence-collector
- opportunity-selector
- proposal-gate
- patch-author
- verifier
- pr-opener

### Requires

- subjects: run[] -- completed runs, inspection runs, improver runs, or cross-run comparisons that contain the evidence for the contribution
- repository: path -- local checkout of `openprose/prose` or a fork
- scope: contribution scope, one of "std", "skills", "docs", "examples", or "platform" (default: "std")
- base-branch: target branch for the PR (default: "main")
- contribution-mode: one of "auto", "proposal-first", "local-patch", or "draft-pr" (default: "auto")
- local-patch-approval: explicit user approval to create a local branch and modify the repository
- publish-approval: explicit user approval to push a branch and open a GitHub pull request using the current authenticated GitHub identity

### Ensures

- contribution: structured report containing:
    - evidence: run IDs and specific findings that motivated the change
    - guideline_alignment: how the change satisfies the repository contribution bar and project tenets
    - selected_opportunity: the single improvement selected for this PR, with rationale and why larger alternatives were deferred
    - contribution_plan: whether the contribution should stop at a proposal, produce a local patch, or open a draft PR
    - proposal_issue: issue URL, title, and maintainer-feedback gate when the contribution needs proposal-first review
    - files_changed: list of changed files
    - verification: commands or evals run, with pass/fail status and key output
    - branch: branch name created for the contribution
    - pull_request: URL, title, draft/ready status, and base branch
    - follow_ups: related opportunities intentionally left out of this PR
- pull_request is opened as draft unless the user explicitly asks for a ready-for-review PR
- PR body includes the run evidence, verification performed, and any residual risk
- if proposal-first review is required: an issue or proposal is produced, and no PR is opened until maintainer feedback and publish approval exist
- if no evidence-backed, PR-sized improvement exists: no branch is pushed and no PR is opened

### Errors

- local-patch-approval-required: local-patch-approval is absent or ambiguous for a run that would modify the repository
- publish-approval-required: publish-approval is absent or ambiguous for a run that would push a branch or open a pull request
- maintainer-feedback-required: a proposal-first contribution needs maintainer feedback before PR creation
- no-actionable-improvement: subjects do not support a concrete, small contribution
- repository-not-found: repository path is missing or is not a git checkout
- dirty-worktree: repository contains unrelated uncommitted changes that would make authorship unclear
- gh-unavailable: GitHub CLI is unavailable or not authenticated
- verification-failed: the change was made but validation failed
- pr-create-failed: branch pushed but pull request creation failed

### Invariants

- never push directly to the base branch
- never treat local-patch-approval as permission to push or open a pull request
- never open a pull request without explicit publish-approval for this specific contribution
- never batch unrelated improvements into one PR
- never modify files outside the selected scope unless the PR body names and justifies the exception
- never move language semantics into the CLI, or harness mechanics into the skill/specs
- never turn hosted product or subscription strategy into OSS language surface without a minimal public-runtime need
- never skip proposal-first review when the selected opportunity changes authored syntax, language semantics, cross-layer contracts, or an unclear public boundary
- never hide failed validation; if verification fails, stop before opening the PR unless the user explicitly asks for a failing draft PR
- never ask for more than one giving-back action in the same run

### Strategies

- before selecting a change: read `CONTRIBUTING.md`, `README.md`, `AGENTS.md`, `skills/open-prose/SKILL.md`, `skills/open-prose/guidance/tenets.md`, `skills/open-prose/guidance/authoring.md`, and the relevant CLI/std/example docs for the touched scope
- prefer the smallest change that helps a future agent: a docs clarification, a std contract fix, an eval guardrail, or an example extracted from a real run
- ground every change in evidence from the provided runs; do not invent improvements because a file "could be nicer"
- classify the change by layer before editing: language/framework semantics, std contract, CLI harness behavior, example, docs, or hosted-product-adjacent idea
- in auto mode, choose proposal-first for language semantics, authored syntax, unclear layer boundaries, cross-layer changes, or changes that need maintainer design judgment before review
- a proposal-first run may still produce a local branch for reviewability when local-patch-approval exists, but it must stop before push or PR until maintainer feedback and publish-approval exist
- if the evidence points to source-system quality, reuse the reasoning shape of `std/evals/system-improver`
- if the evidence points to Forme or VM behavior, reuse the reasoning shape of `std/evals/platform-improver`
- if the evidence spans multiple runs, use `std/evals/cross-run-differ` thinking to identify the recurring pattern before selecting a PR
- open draft PRs by default; ready-for-review PRs require explicit user direction
- write the PR for maintainers and future agents using the shape from `CONTRIBUTING.md`: Summary, Use Case / Run Evidence, Design Boundary, Examples, Testing, Residual Risk / Follow-ups

---

## proposal-gate

Decide whether the selected opportunity should become a proposal, a local patch, or a draft PR.

### Requires

- selected-opportunity: selected PR-sized improvement
- context-pack: contribution context from contribution-context
- contribution-mode: requested contribution mode
- repository: local checkout path

### Ensures

- contribution-plan: structured plan containing:
    - mode: "proposal-first", "local-patch", or "draft-pr"
    - reason: why this path is appropriate
    - approval_boundaries: which user approvals are needed for local edits, pushing, and PR creation
    - proposal_required: whether maintainer design feedback is needed before PR creation
    - proposal_issue: issue URL or draft issue body when proposal-first review is required
    - stop_before_pr: boolean

### Errors

- no-actionable-improvement: selected-opportunity does not justify any contribution path
- maintainer-feedback-required: contribution-mode requests a draft PR but the opportunity requires proposal-first review

### Strategies

- choose proposal-first for authored syntax, language semantics, compiler/IR contract changes, cross-layer changes, unclear design boundaries, or hosted-product-adjacent ideas
- choose local-patch when a proposal-first contribution benefits from a concrete diff for review, but maintainer feedback is still needed before PR creation
- choose draft-pr only for small, evidence-backed changes whose boundary is already clear and whose tests can be run deterministically
- when proposal-first is selected, write a concise issue body using the contribution bar: use case, proposal, design boundary, diagnostics or examples, testing plan, and open questions
- preserve the user's GitHub identity gate: local branch creation, pushing, and PR creation are separate approvals

---

## contribution-context

Read the repository's contribution guidelines, project tenets, public docs, and relevant implementation docs before proposing any patch.

### Requires

- repository: local checkout path
- scope: requested contribution scope

### Ensures

- context-pack: structured context containing:
    - contribution_bar: the requirements from `CONTRIBUTING.md`
    - project_tenets: the relevant design tenets from `skills/open-prose/guidance/tenets.md` and `skills/open-prose/guidance/authoring.md`
    - boundary_map: where changes belong across the skill/specs, `packages/std/`, examples, `packages/co/`, and `tools/cli/`
    - testing_map: existing tests, evals, or structural checks available for the requested scope
    - public_positioning: public-facing framing from `README.md` and `AGENTS.md` that the PR should preserve
    - private_boundary: any detected hosted-product, billing, subscription, or business-strategy ideas that should remain out of OSS language/runtime changes unless the user explicitly scopes them

### Errors

- repository-not-found: repository cannot be inspected
- contribution-guidelines-missing: `CONTRIBUTING.md` cannot be found

### Strategies

- start with `CONTRIBUTING.md`; it is the contribution quality bar
- read `skills/open-prose/SKILL.md` to understand the agent-facing language/framework surface
- read `tools/cli/README.md` and relevant CLI source only when the proposed scope touches shell entrypoints, harness selection, deterministic compile/serve/status behavior, or tests
- read `packages/std/README.md` and neighboring std contracts when the proposed scope is a reusable library change
- treat hosted product and subscription ideas as positioning context, not OSS implementation requirements

---

## evidence-collector

Read the subject runs and extract the evidence that could justify an upstream contribution.

### Requires

- subjects: run[] binding from the caller
- context-pack: contribution context from contribution-context
- repository: local checkout path
- scope: requested contribution scope

### Ensures

- evidence-pack: structured evidence containing:
    - runs: list of run IDs, paths, systems, timestamps, and statuses
    - findings: specific friction points, failures, repeated patterns, confusing docs, missing examples, or std gaps
    - candidate_files: repository files plausibly implicated by each finding
    - existing_context: relevant current docs, std files, tests, issues, project tenets, or previous improver outputs

### Errors

- repository-not-found: repository cannot be inspected
- no-actionable-improvement: no finding maps to a concrete repository file or contribution target

### Strategies

- read vm logs, final bindings, inspector outputs, and improver outputs before reading broad source files
- search the repository for the exact docs or std APIs that the run used
- when the same friction appears in multiple subjects, mark it as higher confidence
- when evidence is only a vague preference, exclude it

---

## opportunity-selector

Choose exactly one PR-sized improvement from the evidence pack.

### Requires

- evidence-pack: collected run evidence
- context-pack: contribution context from contribution-context
- scope: requested contribution scope

### Ensures

- selected-opportunity: one improvement containing:
    - title: short human-readable title
    - category: "docs", "std-contract", "eval", "example", "skill-guidance", or "platform"
    - affected_files: files to edit
    - rationale: why this improves future runs
    - design_boundary: why the change belongs in these files and not another layer
    - test_strategy: how the change can be retested on future PRs
    - evidence_refs: run findings that justify the change
    - risk: "low", "medium", or "high"
    - deferred: related opportunities intentionally excluded

### Errors

- no-actionable-improvement: no candidate is small enough and evidence-backed enough for a PR

### Strategies

- prefer low-risk changes that are obviously useful to agents who will run the same system later
- prefer one file or one tightly related set of files
- reject candidates that cannot name a concrete use case, design boundary, and retestable success condition
- defer broad architecture changes, speculative API additions, and style-only rewrites
- if the best change is large, select a preparatory docs/example PR instead

---

## patch-author

Create a branch and apply the selected opportunity as a concrete patch.

### Requires

- selected-opportunity: selected PR-sized improvement
- contribution-plan: path selected by proposal-gate
- repository: local checkout path
- base-branch: target base branch
- local-patch-approval: explicit approval to create a contribution branch and modify the local repository

### Ensures

- patch: applied change containing:
    - branch: created branch name
    - files_changed: list of changed files
    - diff: concise diff summary
    - commit: commit SHA and message

### Errors

- local-patch-approval-required: approval is absent or does not cover branch creation and local edits
- dirty-worktree: unrelated local changes are present
- repository-not-found: repository is not a git checkout

### Strategies

- create a branch named `prose-contributor/<short-topic>`
- check `git status --short` before editing; stop if unrelated dirty files are present
- apply the smallest patch that satisfies the selected opportunity
- if contribution-plan.stop_before_pr is true, leave the patch local and report the maintainer-feedback gate
- use a commit message that starts with the affected area, for example `std: add contributor guidance to evals`

---

## verifier

Validate the patch before it is pushed.

### Requires

- patch: applied patch from patch-author
- selected-opportunity: selected opportunity
- context-pack: contribution context from contribution-context
- repository: local checkout path

### Ensures

- verification: validation record containing:
    - commands: commands or evals run
    - results: pass/fail per command
    - residual_risk: anything not covered by validation
    - ready_to_push: boolean

### Errors

- verification-failed: validation failed or the patch cannot be reviewed safely

### Strategies

- for std files: run the narrowest available lint, tests, or structural checks for the changed package
- for docs-only changes: validate links and check that referenced files exist
- for examples: run or inspect the example enough to confirm it is executable by a Prose Complete host
- for CLI changes: run the narrowest affected Vitest suite, then `npm run typecheck` when practical
- if no deterministic validation exists, say so in residual_risk instead of inventing a pass

---

## pr-opener

Push the branch and open a pull request.

### Requires

- patch: committed patch
- verification: verification record with ready_to_push true
- selected-opportunity: selected opportunity
- contribution-plan: path selected by proposal-gate
- context-pack: contribution context from contribution-context
- repository: local checkout path
- base-branch: target base branch
- publish-approval: explicit approval to push and open the PR

### Ensures

- pull_request: PR record containing:
    - url: GitHub PR URL
    - title: PR title
    - branch: pushed branch
    - base: base branch
    - draft: boolean
    - body: PR body text or path to saved PR body
- contribution: final top-level report

### Errors

- publish-approval-required: approval does not cover pushing and opening a PR
- maintainer-feedback-required: contribution-plan requires proposal-first review before PR creation
- gh-unavailable: `gh` is missing or not authenticated
- pr-create-failed: `gh pr create` fails

### Strategies

- stop before pushing when contribution-plan.stop_before_pr is true
- use `gh auth status` before pushing
- push only the contribution branch
- create a draft PR unless the user explicitly requested ready-for-review
- include these PR body sections: Summary, Use Case / Run Evidence, Design Boundary, Examples, Testing, Residual Risk / Follow-ups
- tag the PR title or body with `agent-experience` when the contribution came from agent-facing friction
