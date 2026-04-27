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

Latest generated reports:

- [`measurements/runtime-confidence.latest.md`](measurements/runtime-confidence.latest.md)
- [`measurements/runtime-confidence.latest.json`](measurements/runtime-confidence.latest.json)

## Release Criteria

- Full OSS test suite passes.
- Typecheck passes.
- Runtime confidence matrix passes.
- Compiled Bun binary smoke passes.
- Cold-start publishable-package smoke passes.
- `smoke:live-pi` produces a clean skipped report by default and a classified
  opt-in live report when credentials are present.
- Package metadata and hosted contract fixtures are stable.
- `examples`, `packages/std`, and `packages/co` pass strict publish checks.
- The root source package stays private and does not advertise a package-manager
  `bin`.
- The generated `dist/package.json` is the publishable binary package surface.
- `dist/prose` can render help and compile
  `examples/north-star/company-signal-brief.prose.md`.
- CLI help, status, trace, and graph output explain the runtime loop clearly.
- Remaining hosted/platform-specific follow-up is documented outside the OSS
  package workstream.

## Platform Follow-Up

- Wire platform tests directly to the OSS hosted-runtime fixtures.
- Keep hosted workers on the same graph-VM/runtime-profile vocabulary as
  `prose run` and `prose remote execute`.
- Preserve OpenProse run records, artifact manifests, and traces as the shared
  contract between OSS execution and hosted execution.

## Live Pi Smoke Notes

- 2026-04-26: The runtime boundary was clarified: OpenRouter is a Pi
  model-provider profile, not an OpenProse graph VM. The real graph VM path
  remains Pi, with deterministic `--output` fixtures for repeatable smoke
  tests.
- 2026-04-26: Ran a model-backed decision graph through the Pi SDK with
  Anthropic `claude-haiku-4-5`. That proof point has now been folded into the
  north-star `lead-program-designer` ladder example.
- 2026-04-26: After OpenRouter credits were added, the full opt-in live Pi
  ladder passed with the canonical OpenRouter
  `google/gemini-3-flash-preview` profile:
  - cheap `company-signal-brief`: 1 Pi session, 44 trace events
  - medium `lead-program-designer`: 3 Pi sessions, 122 trace events
  - complex `stargazer-intake-lite`: 5 Pi sessions, 186 trace events
  The committed report is
  [`measurements/live-pi.latest.md`](measurements/live-pi.latest.md).
