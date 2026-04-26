# 012 Pre-Session Gates

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: enforce graph gates before pi sessions`

## What Changed

- Verified the graph runner already blocks effect-gated plans before creating
  Pi sessions.
- Tightened tests around that contract:
  - missing approval creates no provider session
  - denied approval creates no provider session
  - granted approval creates a provider session for the gated node
- Added explicit pre-session gate trace metadata:
  - `failure_class: pre_session_gate`
  - `gate: effect_approval | input | upstream | pre_session`
- Added `node.blocked` events for blocked node records.
- Updated trace text rendering so gate/failure/reason details are visible in
  human-readable traces.

Representative blocked trace line:

```text
Events:
- 2026-04-25T00:40:00.000Z: run.blocked provider[pi] failure[pre_session_gate] gate[effect_approval] message[Graph effect 'human_gate' requires a gate before execution. Graph effect 'delivers' requires a gate before execution.]
```

## Testing

- `bun test test/run-entrypoint.test.ts test/runtime-control.test.ts test/runtime-planning.test.ts`
- `bun run typecheck`
- `bun test`

Result: all local checks pass. Full suite: 202 pass, 2 skipped live-provider
tests, 0 fail.

## Notable Learning

The implementation already had the correct operational posture: unsafe graph
effects were planned as blocked before the graph runtime invoked the provider.
The missing piece was observability. A reader can now distinguish "provider
started and failed" from "OpenProse refused to start a provider session because
policy required a gate."

That is the right split for enterprise runtime behavior: policy gates should be
auditable as OpenProse decisions, not inferred from an absent Pi session.

## Next Slice

Phase 02 is complete. Next move to `01-example-ladder-and-fixtures`: use the
Pi-first runtime to build the fixture ladder and north-star examples that can
keep the runtime honest as it grows.
