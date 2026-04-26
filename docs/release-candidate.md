# OpenProse Runtime Release Candidate

This is the release-candidate checklist for the local-first OpenProse runtime.

## Confidence Matrix

Run:

```bash
bun run confidence:runtime
bun run typecheck
bun run test
bun run smoke:binary
```

The confidence script exercises the public CLI across:

- package compilation for `examples`, `packages/std`, and `packages/co`
- planning and graph rendering
- fixture-provider execution
- status and trace inspection
- eval execution
- remote hosted-envelope generation
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
- Package metadata and hosted contract fixtures are stable.
- `examples`, `packages/std`, and `packages/co` pass strict publish checks.
- `dist/prose` can render help and compile `examples/hello.prose.md`.
- CLI help, status, trace, and graph output explain the runtime loop clearly.
- Remaining hosted/platform-specific follow-up is documented outside the OSS
  package workstream.

## Follow-Up After RC

- Wire platform tests directly to the OSS hosted-runtime fixtures.
- Add a live Pi provider smoke to release evidence when credentials and runtime
  cost are acceptable.
- Decide the hosted provider contract for Sprites/Pi once the platform
  Workstream 03 pass begins.

## Live Provider Smoke Notes

- 2026-04-26: `prose run examples/hello.prose.md --provider pi` reached the Pi
  provider through OpenRouter and correctly surfaced the upstream model error as
  the run acceptance reason.
- The smoke did not yet produce an accepted run because the available
  OpenRouter account returned an insufficient-credits response.
- The adapter now records Pi event-level model errors before output validation,
  so future live provider failures should point at provider/auth/model issues
  instead of collapsing into missing-output diagnostics.
- 2026-04-26: Retested the opt-in Pi provider smoke with OpenRouter
  `google/gemini-3-flash-preview`. The provider again reached OpenRouter and
  produced a `pi_model_error`; OpenRouter reported that the account has not
  purchased credits. This remains provider/account configuration evidence, not
  an OpenProse runtime failure.
