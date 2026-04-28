# OpenProse Runtime Confidence Gate

This is the confidence checklist for the local-first OpenProse runtime.

## Confidence Matrix

Run:

```bash
bun run confidence:runtime
bun run typecheck
bun run test
bun run smoke:binary
bun run smoke:cold-start
bun run smoke:agent-onboarding
bun run smoke:hosted-contract
bun run evidence:launch
bun run smoke:live-pi
```

The confidence script exercises the public CLI across:

- package compilation for `examples`, `packages/std`, and `packages/co`
- planning and graph rendering
- deterministic run execution through caller-provided outputs
- release-gated graph planning with expected blocked exits
- status and trace inspection
- eval execution
- remote hosted-envelope generation
- north-star measurement generation
- skipped-by-default live Pi smoke evidence
- package metadata generation
- strict publish checks for `examples`, `std`, and `co`
- registry-ref install into a temporary workspace
- cold-start execution through the publishable binary package outside the source
  checkout
- agent onboarding through the documented first operator loop
- hosted contract fixtures and distributed node request/result canaries
- launch evidence export for the technical report

See [Evidence Classes](evidence-classes.md) for the distinction between
required deterministic release confidence and opt-in live/hosted interop
evidence.

Latest generated reports:

- [`measurements/runtime-confidence.latest.md`](measurements/runtime-confidence.latest.md)
- [`measurements/runtime-confidence.latest.json`](measurements/runtime-confidence.latest.json)

## Release Criteria

- Full OSS test suite passes.
- Typecheck passes.
- Runtime confidence matrix passes.
- Compiled Bun binary smoke passes.
- Cold-start publishable-package smoke passes.
- Agent-onboarding smoke passes.
- Hosted contract smoke passes.
- Launch evidence export passes and cites only generated source reports.
- `smoke:live-pi` produces a clean skipped report by default and a classified
  opt-in live report when credentials are present.
- Package metadata and hosted contract fixtures are stable.
- `examples`, `packages/std`, and `packages/co` pass strict publish checks.
- The root source package stays private and does not advertise a package-manager
  `bin`.
- The generated `dist/package.json` is the publishable binary package surface.
- `dist/prose` can render help and compile
  `examples/north-star/company-signal-brief.prose.md`.
- [Package Publication](package-publication.md) matches the actual generated
  artifact boundary.
- CLI help, status, trace, and graph output explain the runtime loop clearly.
- Remaining hosted/platform-specific follow-up is documented outside the OSS
  package workstream.

## Platform Follow-Up

- Keep platform tests wired directly to the OSS hosted-runtime fixtures so
  fixture drift is caught before hosted runtime changes land.
- Keep hosted workers on the same graph-VM/runtime-profile vocabulary as
  `prose run` and `prose remote execute`.
- Preserve OpenProse run records, artifact manifests, and traces as the shared
  contract between OSS execution and hosted execution.

## Live Pi Smoke

OpenRouter is a Pi model-provider profile, not an OpenProse graph VM. The
graph VM path remains Pi, with deterministic `--output` fixtures for repeatable
smoke tests and an opt-in live ladder for funded model-backed evidence.

The live ladder exercises:

- cheap `company-signal-brief`: one Pi session
- medium `lead-program-designer`: three Pi sessions with upstream artifact
  handoff
- complex `stargazer-intake-lite`: five Pi sessions with approval backpressure

The latest committed live report is
[`measurements/live-pi.latest.md`](measurements/live-pi.latest.md).
