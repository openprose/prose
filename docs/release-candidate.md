# OpenProse Runtime Release Candidate

This is the release-candidate checklist for the local-first OpenProse runtime.

## Confidence Matrix

Run:

```bash
bun run confidence:runtime
bun run typecheck
bun run test
bun run smoke:binary
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

Latest generated reports:

- [`measurements/runtime-confidence.latest.md`](measurements/runtime-confidence.latest.md)
- [`measurements/runtime-confidence.latest.json`](measurements/runtime-confidence.latest.json)

## Release Criteria

- Full OSS test suite passes.
- Typecheck passes.
- Runtime confidence matrix passes.
- Compiled Bun binary smoke passes.
- `smoke:live-pi` produces a clean skipped report by default and a classified
  opt-in live report when credentials are present.
- Package metadata and hosted contract fixtures are stable.
- `examples`, `packages/std`, and `packages/co` pass strict publish checks.
- `dist/prose` can render help and compile
  `examples/north-star/company-signal-brief.prose.md`.
- CLI help, status, trace, and graph output explain the runtime loop clearly.
- Remaining hosted/platform-specific follow-up is documented outside the OSS
  package workstream.

## Follow-Up After RC

- Wire platform tests directly to the OSS hosted-runtime fixtures.
- Capture a successful opt-in live Pi smoke once model-provider credits are
  available.
- Decide the hosted runtime contract for Sprites/Pi once the platform
  Workstream 03 pass begins.

## Live Pi Smoke Notes

- 2026-04-26: `prose run examples/north-star/company-signal-brief.prose.md
  --graph-vm pi` reached the Pi graph VM through an OpenRouter model profile
  and correctly surfaced the upstream model error as the run acceptance reason.
- The smoke did not yet produce an accepted run because the available
  OpenRouter account returned an insufficient-credits response.
- The adapter now records Pi event-level model errors before output validation,
  so future live failures should point at auth, billing, model, or runtime issues
  instead of collapsing into missing-output diagnostics.
- 2026-04-26: Retested the opt-in Pi smoke with OpenRouter
  `google/gemini-3-flash-preview`. The Pi session again reached OpenRouter and
  produced a `pi_model_error`; OpenRouter reported that the account has not
  purchased credits. This remains billing/account configuration evidence, not
  an OpenProse runtime failure.
- 2026-04-26: The runtime boundary was clarified: OpenRouter is a Pi model
  provider profile, not an OpenProse graph VM. The real graph VM path remains
  Pi, with deterministic `--output` fixtures for repeatable smoke tests.
- 2026-04-26: Ran a model-backed decision graph through the Pi SDK with
  Anthropic `claude-haiku-4-5`. That proof point has now been folded into the
  north-star `lead-program-designer` ladder example.
