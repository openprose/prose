---
name: prose-contributor
kind: function
---

# Prose Contributor

Given one or more completed OpenProse runs, turn real run friction into a small, reviewable contribution to `openprose/prose`. This function is the standard path from "this run taught us something" to "there is a draft pull request that improves the library for the next agent."

Use this when a run exposes confusing docs, missing examples, weak std contracts, brittle eval criteria, or a repeated pattern that belongs in `packages/std/`. It is not a general refactoring function. It should open one focused PR, grounded in run evidence and aligned with the repository contribution guidelines, after explicit approval to use the current GitHub identity.

### Stages

- contribution-context
- evidence-collector
- opportunity-selector
- patch-author
- verifier
- pr-opener

### Parameters

- subjects: run[] -- completed runs, inspection runs, improver runs, or cross-run comparisons that contain the evidence for the contribution
- repository: path -- local checkout of `openprose/prose` or a fork
- scope: contribution scope, one of "std", "skills", "docs", "examples", or "platform" (default: "std")
- base-branch: target branch for the PR (default: "main")
- pr-approval: explicit user approval to create a branch, push it, and open a GitHub pull request using the current authenticated GitHub identity

### Returns

- contribution: structured report containing:
    - evidence: run IDs and specific findings that motivated the change
    - guideline_alignment: how the change satisfies the repository contribution bar and project tenets
    - selected_opportunity: the single improvement selected for this PR, with rationale and why larger alternatives were deferred
    - files_changed: list of changed files
    - verification: commands or evals run, with pass/fail status and key output
    - branch: branch name created for the contribution
    - pull_request: URL, title, draft/ready status, and base branch
    - follow_ups: related opportunities intentionally left out of this PR

The returned `pull_request` is opened as draft unless the user explicitly asks for a ready-for-review PR; its body includes the run evidence, verification performed, and any residual risk. If no evidence-backed, PR-sized improvement exists, the function returns with no branch pushed and no PR opened.

### Errors

- approval-required: pr-approval is absent or ambiguous
- no-actionable-improvement: subjects do not support a concrete, small contribution
- repository-not-found: repository path is missing or is not a git checkout
- dirty-worktree: repository contains unrelated uncommitted changes that would make authorship unclear
- gh-unavailable: GitHub CLI is unavailable or not authenticated
- verification-failed: the change was made but validation failed
- pr-create-failed: branch pushed but pull request creation failed

### Invariants

- never push directly to the base branch
- never open a pull request without explicit user approval for this specific contribution
- never batch unrelated improvements into one PR
- never modify files outside the selected scope unless the PR body names and justifies the exception
- never move language semantics into the CLI, or harness mechanics into the skill/specs
- never turn hosted product or subscription strategy into OSS language surface without a minimal public-runtime need
- never hide failed validation; if verification fails, stop before opening the PR unless the user explicitly asks for a failing draft PR
- never ask for more than one giving-back action in the same run

### Strategies

- before selecting a change: read `CONTRIBUTING.md`, `README.md`, `AGENTS.md`, `skills/open-prose/SKILL.md`, `skills/open-prose/guidance/tenets.md`, `skills/open-prose/guidance/authoring.md`, and the relevant CLI/std/example docs for the touched scope
- prefer the smallest change that helps a future agent: a docs clarification, a std contract fix, an eval guardrail, or an example extracted from a real run
- ground every change in evidence from the provided runs; do not invent improvements because a file "could be nicer"
- classify the change by layer before editing: language/framework semantics, std contract, CLI harness behavior, example, docs, or hosted-product-adjacent idea
- if the evidence points to source-system quality, reuse the reasoning shape of `std/evals/system-improver`
- if the evidence points to Forme or VM behavior, reuse the reasoning shape of `std/evals/platform-improver`
- if the evidence spans multiple runs, use `std/evals/cross-run-differ` thinking to identify the recurring pattern before selecting a PR
- open draft PRs by default; ready-for-review PRs require explicit user direction
- write the PR for maintainers and future agents using the shape from `CONTRIBUTING.md`: Summary, Use Case / Run Evidence, Design Boundary, Examples, Testing, Residual Risk / Follow-ups

---

## contribution-context

Read the repository's contribution guidelines, project tenets, public docs, and relevant implementation docs before proposing any patch.

### Parameters

- repository: local checkout path
- scope: requested contribution scope

### Returns

- context-pack: structured context containing:
    - contribution_bar: the requirements from `CONTRIBUTING.md`
    - project_tenets: the relevant design tenets from `skills/open-prose/guidance/tenets.md` and `skills/open-prose/guidance/authoring.md`
    - boundary_map: where changes belong across the skill/specs, `packages/std/`, examples, `packages/co/`, and the Reactor harness (`packages/reactor*/`)
    - testing_map: existing tests, evals, or structural checks available for the requested scope
    - public_positioning: public-facing framing from `README.md` and `AGENTS.md` that the PR should preserve
    - private_boundary: any detected hosted-product, billing, subscription, or business-strategy ideas that should remain out of OSS language/runtime changes unless the user explicitly scopes them

### Errors

- repository-not-found: repository cannot be inspected
- contribution-guidelines-missing: `CONTRIBUTING.md` cannot be found

### Strategies

- start with `CONTRIBUTING.md`; it is the contribution quality bar
- read `skills/open-prose/SKILL.md` to understand the agent-facing language/framework surface
- read `packages/reactor*/README.md` and relevant harness source only when the proposed scope touches the Reactor SDK, the `reactor` CLI, deterministic compile/run/serve behavior, or tests
- read `packages/std/README.md` and neighboring std contracts when the proposed scope is a reusable library change
- treat hosted product and subscription ideas as positioning context, not OSS implementation requirements

---

## evidence-collector

Read the subject runs and extract the evidence that could justify an upstream contribution.

### Parameters

- subjects: run[] binding from the caller
- context-pack: contribution context from contribution-context
- repository: local checkout path
- scope: requested contribution scope

### Returns

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

### Parameters

- evidence-pack: collected run evidence
- context-pack: contribution context from contribution-context
- scope: requested contribution scope

### Returns

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

### Parameters

- selected-opportunity: selected PR-sized improvement
- repository: local checkout path
- base-branch: target base branch
- pr-approval: explicit approval to create a contribution branch

### Returns

- patch: applied change containing:
    - branch: created branch name
    - files_changed: list of changed files
    - diff: concise diff summary
    - commit: commit SHA and message

### Errors

- approval-required: approval is absent or does not cover branch creation and PR opening
- dirty-worktree: unrelated local changes are present
- repository-not-found: repository is not a git checkout

### Strategies

- create a branch named `prose-contributor/<short-topic>`
- check `git status --short` before editing; stop if unrelated dirty files are present
- apply the smallest patch that satisfies the selected opportunity
- use a commit message that starts with the affected area, for example `std: add contributor guidance to evals`

---

## verifier

Validate the patch before it is pushed.

### Parameters

- patch: applied patch from patch-author
- selected-opportunity: selected opportunity
- context-pack: contribution context from contribution-context
- repository: local checkout path

### Returns

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

### Parameters

- patch: committed patch
- verification: verification record with ready_to_push true
- selected-opportunity: selected opportunity
- context-pack: contribution context from contribution-context
- repository: local checkout path
- base-branch: target base branch
- pr-approval: explicit approval to push and open the PR

### Returns

- pull_request: PR record containing:
    - url: GitHub PR URL
    - title: PR title
    - branch: pushed branch
    - base: base branch
    - draft: boolean
    - body: PR body text or path to saved PR body
- contribution: final top-level report

### Errors

- approval-required: approval does not cover pushing and opening a PR
- gh-unavailable: `gh` is missing or not authenticated
- pr-create-failed: `gh pr create` fails

### Strategies

- use `gh auth status` before pushing
- push only the contribution branch
- create a draft PR unless the user explicitly requested ready-for-review
- include these PR body sections: Summary, Use Case / Run Evidence, Design Boundary, Examples, Testing, Residual Risk / Follow-ups
- tag the PR title or body with `agent-experience` when the contribution came from agent-facing friction
