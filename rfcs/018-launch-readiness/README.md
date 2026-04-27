# RFC 018: Launch Readiness

Status: Active

## Goal

Make the OSS package presentable as the local developer entry point for the
OpenProse launch.

This RFC sits above the public hardening queue in RFC 015. RFC 015 tracks
package internals and cleanup. RFC 018 tracks whether a new developer, a coding
agent, and the launch technical report can all independently confirm the same
claim:

> OpenProse is a local, contract-first, Pi-backed reactive graph VM for agent
> outcomes, with typed ports, effect policy, durable runs, package discipline,
> and measurement evidence.

## Launch Bar

The OSS package is ready for the launch only when:

- a developer can install or clone it and get to a meaningful example quickly
- a coding agent can onboard from the repo docs and empirically validate the
  package without private context
- deterministic confidence is required and cheap to run
- live inference confidence is opt-in, clearly labeled, and easy to run when
  credentials exist
- examples demonstrate the uniquely OpenProse capabilities: React-like
  selective recompute, run-aware composition, approval gates, memory/state
  loops, package quality, and traceable outcomes
- the CLI, README, docs, skill entry point, examples, and generated reports use
  the same runtime vocabulary
- package publication instructions and generated binary metadata agree
- the hosted platform can consume the same run/artifact/deployment contracts
  without special private semantics

## Current Baseline

The baseline taken on 2026-04-27 is strong:

- `bun run typecheck` passes
- `bun run test` passes: 282 pass, 1 skipped live-Pi-style test, 0 failures
- `bun run confidence:runtime` passes: 18 checks, 9225ms
- `bun run smoke:binary` passes
- generated package health reports show:
  - `examples`: 42 components, quality 1.00, 100% typed ports/effects, strict
    publish-check pass
  - `packages/std`: 58 components, quality 1.00, 100% typed ports/effects,
    strict publish-check pass
  - `packages/co`: 12 components, quality 1.00, 100% typed ports/effects,
    strict publish-check pass
  - `customers/prose-openprose`: 99 components, quality 0.95, 100% typed
    ports/effects, strict publish-check pass

## Open Readiness Work

These are launch-level concerns, not necessarily code defects.

### R001: Fresh Install Needs A Cold-Start Gate

The repo-local gates are green, but the launch needs a simulated fresh user
path that starts from a clean temp directory and proves the publishable binary
or package artifact works without repo-local assumptions.

Status: done in signpost 002.

Resolved slice: added `bun run smoke:cold-start`, which builds the binary
package, copies only the dist artifact into a temp workspace, runs `prose help`,
compiles a tiny temp program, plans it, runs it, and inspects `status` and
`trace` outside the source checkout. The runtime confidence matrix now includes
this as a required deterministic check.

### R002: Agent Onboarding Should Become A Measured Surface

The skill and docs are much cleaner now, but the launch claim includes that a
coding agent can onboard quickly. That deserves a tiny empirical harness rather
than a vibes-only assertion.

Status: done in signpost 003.

Resolved slice: added `docs/agent-onboarding.md` and
`bun run smoke:agent-onboarding`. The smoke checks the public onboarding docs
exist and runs the first operator loop: help, lint, preflight, graph, run,
status, trace, package, and strict publish-check. The runtime confidence matrix
now includes this as a required deterministic check.

### R003: Technical Report Evidence Should Be Generated, Not Hand-Copied

The technical report in the private platform repo needs tables from the OSS
measurement reports plus the hosted Native Company dev proof. Manual copying
will drift.

Status: done in signpost 004 for OSS evidence.

Resolved slice: added `bun run evidence:launch`, which reads generated
measurement reports and writes `docs/measurements/launch-evidence.latest.*`
for the technical report. The artifact rolls up package health, confidence
gates, evidence classes, scenario signals, baseline comparison, and report-safe
claim candidates. Platform-side evidence aggregation remains a separate launch
plan slice because hosted dev proof lives in the private platform repo.

### R004: Live Inference Evidence Needs A Public Narrative

Live Pi/OpenRouter evidence is opt-in and already separated from deterministic
evidence. The launch docs should explain that split crisply: deterministic
evidence is required for every contributor, live inference evidence proves the
agent path when credentials are present.

Status: done in signpost 005 for OSS docs.

Resolved slice: added `docs/evidence-classes.md` and linked it from the docs
index, measurement guide, release confidence gate, and private report evidence
index. The rule is explicit: deterministic fixtures, scripted Pi, cold-start,
and agent onboarding are required local confidence; live Pi and hosted dev
smokes are interop evidence and must be cited with context.

### R005: Package Publication Story Needs One More End-To-End Check

The root package is private and the generated `dist/` package is the publishable
surface. This is a good architecture, but a public launch should have one
artifact-level publication check that verifies package metadata, files, binary,
README expectations, and install instructions all agree.

Status: done in signpost 006.

Resolved slice: documented the source-workspace versus generated-CLI-artifact
boundary in `docs/package-publication.md`. The artifact-level check is
`smoke:cold-start`, backed by `smoke:binary` and `test/binary-package.test.ts`.

### R006: Hosted Contract Drift Must Stay Visible

The platform now successfully runs the Native Company in dev, but OSS release
readiness should keep hosted contract fixtures and remote envelopes visible so
the hosted product cannot become a separate execution model.

Recommended slice: keep `prose remote execute`, hosted fixtures, and platform
fixture consumption in the launch readiness matrix.

## Per-Slice Discipline

Every RFC 018 slice must:

1. Re-read this file, RFC 015, and `docs/release-candidate.md`.
2. Make the smallest coherent improvement toward the launch bar.
3. Run focused tests for the changed surface.
4. Run at least one broader confidence gate when the slice touches public CLI,
   docs, examples, measurement, or packaging.
5. Write a signpost under `rfcs/018-launch-readiness/signposts/`.
6. Commit and push `rfc/reactive-openprose`.
7. If the platform submodule pointer changes, update and commit the platform
   pointer on `reactive-openprose-platform`.

## Default Gates

Use these as the baseline gates unless a slice documents a narrower reason:

```bash
bun run typecheck
bun run test
bun run confidence:runtime
bun run smoke:binary
```

Opt-in live evidence:

```bash
OPENPROSE_LIVE_PI_SMOKE=1 bun run smoke:live-pi -- --tier cheap
```
