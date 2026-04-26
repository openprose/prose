# OpenProse Measurement Report

Version: 0.3
Generated: 2026-04-26T19:29:35.600Z

## Release Checks

| Check | Status | Detail |
|---|---|---|
| examples compile | pass | 42 components, 0 errors |
| examples publish-check | pass | 0 warnings, 0 blockers |
| examples strict publish-check | pass | 0 warnings, 0 blockers |
| scripted Pi runs | pass | 4 scenarios, 13 sessions |
| live Pi smoke | skipped | Run OPENPROSE_LIVE_PI_SMOKE=1 bun run smoke:live-pi -- --tier cheap. |

## Evidence Classes

| Class | Required | Status | Scope |
|---|---|---|---|
| deterministic fixtures | yes | pass | examples/north-star/fixtures; company_signal_brief, lead_program_designer, stargazer_intake_lite, opportunity_discovery_lite |
| scripted Pi | yes | pass | 4 scenarios, 13 sessions, scripted_pi_unmetered |
| live Pi | no | skipped | openrouter/google/gemini-3-flash-preview; Run OPENPROSE_LIVE_PI_SMOKE=1 bun run smoke:live-pi -- --tier cheap. |

## Package Health

| Target | Components | Quality | Typed Ports | Effects | Publish | Strict |
|---|---:|---:|---:|---:|---|---|
| examples | 42 | 1.00 | 100% | 100% | pass | pass |
| packages/std | 58 | 1.00 | 100% | 100% | pass | pass |
| packages/co | 12 | 1.00 | 100% | 100% | pass | pass |
| customers/prose-openprose | 99 | 0.95 | 100% | 100% | pass | pass |

## Scenario Checks

### Company Signal Brief
- status: succeeded
- compile time: 0.23 ms
- run time: 26.27 ms
- eval: passed (0.93)
- scripted Pi sessions: 1
- estimated cost: n/a (scripted Pi)
- trace events: 9

### Lead Program Designer
- status: succeeded
- graph nodes: 3
- run time: 45.09 ms
- eval: passed (0.91)
- first-run sessions: 3
- first-run executed nodes: lead-profile-normalizer, lead-qualification-scorer, save-grow-program-drafter
- brand-change executed nodes: save-grow-program-drafter
- brand-change reused nodes: lead-profile-normalizer, lead-qualification-scorer
- brand-change sessions: 1
- profile-change executed nodes: lead-profile-normalizer, lead-qualification-scorer, save-grow-program-drafter
- profile-change reused nodes: (none)

### Stargazer Intake Lite
- status: succeeded
- graph nodes: 5
- run time: 58.89 ms
- eval: passed (0.94)
- scripted Pi sessions: 5
- memory artifacts: 1
- skipped rows: 2
- duplicate suppressions: 1
- high-water mark: 2026-04-26T08:15:00Z
- replay status: current
- replay saved nodes: 5

### Opportunity Discovery Lite
- status: succeeded
- graph nodes: 4
- run time: 54.60 ms
- eval: passed (0.92)
- scripted Pi sessions: 4
- stale rows rejected: 1
- missing-provenance rows rejected: 1
- duplicate suppressions: 1
- winning source: https://x.example/status/1003
- brand-change executed nodes: opportunity-classifier, opportunity-deduplicator, opportunity-summary-writer
- brand-change reused nodes: platform-scan-reader
- brand-change saved nodes: 1
- stale reasons: input_hash_changed:brand_context, upstream_stale:opportunity-classifier, upstream_stale:opportunity-deduplicator

### Approval-Gated Release
- plan status: blocked
- blocked nodes: announce-release

## Baseline Skill Folder Comparison

Baseline: plain skill folder

Assumptions:
- instruction files expose no machine-readable typed ports
- effects and approvals are conventions unless parsed by a separate system
- there is no canonical graph/run materialization record
- targeted recompute requires manual operator judgment

| Signal | OpenProse advantage |
|---|---:|
| examples quality score | 1.00 |
| typed port coverage delta | 100% |
| effect declaration delta | 100% |
| brand-change node recomputes avoided | 2 |
| brand-change sessions avoided | 2 |
| reactive-loop node recomputes avoided | 6 |
| duplicate suppressions measured | 2 |
| approval gate visible to planner | yes |
| graph trace available | yes |
| lead graph trace event count | 29 |

