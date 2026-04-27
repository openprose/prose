# OpenProse Launch Evidence

Generated: 2026-04-27T20:40:54.943Z
Status: PASS

## Confidence Gates

| Gate | Status | Checks | Elapsed | Detail |
|---|---|---:|---:|---|
| runtime confidence | pass | 20 | 19247ms |  |
| cold-start package smoke | pass | 6 | 3570ms |  |
| agent onboarding smoke | pass | 9 | 3283ms |  |
| live Pi smoke | succeeded |  |  | openrouter/google/gemini-3-flash-preview |

## Package Health

| Package | Components | Quality | Typed Ports | Effects | Strict Publish |
|---|---:|---:|---:|---:|---|
| examples | 42 | 1.00 | 100% | 100% | pass |
| packages/std | 58 | 1.00 | 100% | 100% | pass |
| packages/co | 12 | 1.00 | 100% | 100% | pass |
| customers/prose-openprose | 99 | 0.90 | 100% | 100% | pass |

## Non-Happy-Path Semantics

Package metadata:
- component contract metadata exposes strategies, declared terminal errors, finally obligations, catch guidance, and legacy invariant text when present
- catalog search entries include the same compact contract metadata so consumers can inspect non-happy-path semantics before install

Runtime channels:
- openprose_report_error records typed declared terminal failures
- openprose_submit_outputs and openprose_report_error both accept finally evidence
- catch remains intra-node recovery guidance rather than a graph-level scheduling edge

Hash surface:
- strategies, errors, finally, catch, and legacy invariants participate in source and package semantic hashes

## Technical Report Claims

- OpenProse packages expose typed ports and effect declarations at package scale.
- OpenProse package metadata exposes declared terminal errors, finally obligations, catch recovery guidance, and strategies for each component.
- Declared error/finally/catch/strategy sections participate in semantic hashes so registry consumers can detect behavior-changing contract updates.
- The runtime confidence gate exercises compile, plan, graph, run, trace, eval, remote envelope, package, publish-check, install, cold-start, and agent-onboarding paths.
- The examples measure selective recompute savings, approval visibility, duplicate suppression, and baseline skill-folder deltas.
- Live inference evidence is explicitly separated from deterministic local confidence.

## Source Reports

- `docs/measurements/latest.json`
- `docs/measurements/runtime-confidence.latest.json`
- `docs/measurements/cold-start.latest.json`
- `docs/measurements/agent-onboarding.latest.json`
- `docs/measurements/live-pi.latest.json`

