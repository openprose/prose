# 031j Reference Company Validation Refresh

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Customer branch: `build/reactive-openprose-company`
Customer latest commit: `09ffd6c chore: refresh openprose validation lock`
Commit target: `docs: record reference company validation refresh`

## What Changed

- Updated the reference-company validation script to call the current
  `prose run` command instead of the removed `prose materialize` command.
- Let the validation install step refresh `prose.lock` to the current
  source-sync pins:
  - `github.com/openprose/prose@dd426d094dd040cdaf7e319da65316fc6a9a3e77`
  - `github.com/openprose/prose-openprose@4234c8e6acbf0837ea0e4ef859f134453b801bfc`
- Added a follow-up customer lockfile commit,
  `09ffd6c chore: refresh openprose validation lock`, after rerunning
  validation from the new customer tip.
- Confirmed the validation script exercises install, lint, package,
  publish-check, compile, graph, preflight, local run, status, trace, and
  registry install paths.

## Why It Matters

The reference company now has a single local smoke command that follows the
current runtime vocabulary. This keeps Phase 07.3 honest: golden evidence can
be promoted only after the company package can run through the current graph VM
surface without relying on stale fixture-materializer commands.

## Tests Run

From `customers/prose-openprose`:

- `scripts/validate-openprose-local.sh`

## Test Results

- install: pass
- full `systems` lint: pass, 0 diagnostics
- package: pass
- publish-check: pass, 99 components
- compile `company.prose.md`: pass
- graph `company.prose.md`: pass
- preflight `release-on-demand`: pass
- preflight `gtm-pipeline`: pass
- preflight `agent-index-refresh`: pass
- preflight `saas-index-refresh`: pass
- local `prose run` smoke: pass, run status `succeeded`
- `prose status` and `prose trace`: pass
- Startino package install from registry ref: pass

## Tests Not Run

- No fresh golden run fixtures were promoted or replayed in this slice.
- The existing dirty `.prose/` runtime artifacts in the customer repo remain
  intentionally uncommitted.

## Next Slice

- Decide whether Phase 07.3 should create semantic golden snapshots for a
  small set of customer examples, or defer golden evidence until the Pi-first
  runtime shape replaces the temporary fixture provider in local smoke tests.

## Design Learnings

- The validation script is useful as backpressure only when it exercises the
  same public CLI surface that users will see.
- Full run-directory promotion is still premature. The better first golden
  evidence is semantic: output names, dependency shape, effects, accepted run
  status, and artifact classes.
