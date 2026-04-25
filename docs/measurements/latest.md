# OpenProse Measurement Report

Generated: 2026-04-25T06:53:17.438Z

## Package Health

| Target | Components | Quality | Typed Ports | Effects | Publish | Strict |
|---|---:|---:|---:|---:|---|---|
| examples | 15 | 0.95 | 100% | 100% | pass | pass |
| packages/std | 82 | 0.35 | 0% | 0% | warn | fail |
| packages/co | 6 | 1.00 | 100% | 100% | pass | pass |
| customers/prose-openprose | 99 | 0.95 | 100% | 100% | pass | pass |

## Scenario Checks

### Hello
- compile time: 0.40 ms
- diagnostics: 0

### Company Intake
- plan status: ready
- graph nodes: 3
- materialization set size: 3

### Run-Aware Brief
- compile time: 0.37 ms
- access rule groups: 2

### Selective Recompute
- full refresh nodes: market-sync
- targeted summary nodes: (none)
- saved node recomputes: 1
- saved graph rewrites: 1

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
| examples quality score | 0.95 |
| typed port coverage delta | 100% |
| effect declaration delta | 100% |
| selective node recomputes avoided | 1 |
| selective graph rewrites avoided | 1 |
| approval gate visible to planner | yes |
| graph trace available | yes |

