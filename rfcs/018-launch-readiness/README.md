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

Recommended slice: add a cold-start smoke script that builds the binary package,
copies or installs it into a temp workspace, runs `prose help`, compiles the
smallest example, runs one deterministic example, and prints a compact report.

### R002: Agent Onboarding Should Become A Measured Surface

The skill and docs are much cleaner now, but the launch claim includes that a
coding agent can onboard quickly. That deserves a tiny empirical harness rather
than a vibes-only assertion.

Recommended slice: add a checked `docs/agent-onboarding.md` with a 5-minute
path and a matching smoke command that exercises the same commands.

### R003: Technical Report Evidence Should Be Generated, Not Hand-Copied

The technical report in the private platform repo needs tables from the OSS
measurement reports plus the hosted Native Company dev proof. Manual copying
will drift.

Recommended slice: add a small evidence-export command or documented JSON
contract that the platform report can consume from `docs/measurements/*.json`.

### R004: Live Inference Evidence Needs A Public Narrative

Live Pi/OpenRouter evidence is opt-in and already separated from deterministic
evidence. The launch docs should explain that split crisply: deterministic
evidence is required for every contributor, live inference evidence proves the
agent path when credentials are present.

Recommended slice: tighten `docs/measurement.md`, `docs/release-candidate.md`,
and the report appendix around evidence classes.

### R005: Package Publication Story Needs One More End-To-End Check

The root package is private and the generated `dist/` package is the publishable
surface. This is a good architecture, but a public launch should have one
artifact-level publication check that verifies package metadata, files, binary,
README expectations, and install instructions all agree.

Recommended slice: extend `smoke:binary` or add `smoke:publishable-package`.

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

