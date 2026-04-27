# OpenProse Launch Evidence

Generated: 2026-04-27T01:54:25.545Z
Status: PASS

## Confidence Gates

| Gate | Status | Checks | Elapsed | Detail |
|---|---|---:|---:|---|
| runtime confidence | pass | 20 | 15710ms |  |
| cold-start package smoke | pass | 6 | 3534ms |  |
| agent onboarding smoke | pass | 9 | 3178ms |  |
| live Pi smoke | succeeded |  |  | openrouter/google/gemini-3-flash-preview |

## Package Health

| Package | Components | Quality | Typed Ports | Effects | Strict Publish |
|---|---:|---:|---:|---:|---|
| examples | 42 | 1.00 | 100% | 100% | pass |
| packages/std | 58 | 1.00 | 100% | 100% | pass |
| packages/co | 12 | 1.00 | 100% | 100% | pass |
| customers/prose-openprose | 99 | 0.95 | 100% | 100% | pass |

## Technical Report Claims

- OpenProse packages expose typed ports and effect declarations at package scale.
- The runtime confidence gate exercises compile, plan, graph, run, trace, eval, remote envelope, package, publish-check, install, cold-start, and agent-onboarding paths.
- The examples measure selective recompute savings, approval visibility, duplicate suppression, and baseline skill-folder deltas.
- Live inference evidence is explicitly separated from deterministic local confidence.

## Source Reports

- `docs/measurements/latest.json`
- `docs/measurements/runtime-confidence.latest.json`
- `docs/measurements/cold-start.latest.json`
- `docs/measurements/agent-onboarding.latest.json`
- `docs/measurements/live-pi.latest.json`

