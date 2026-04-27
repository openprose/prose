# 002: Control Plane Boundary Clarity

Date: 2026-04-26

## Summary

Refreshed RFC 016 so it matches the current North Star and implementation:

- hosted control planes must run OSS OpenProse as the graph VM;
- library embedding and CLI invocation are both valid control-plane packaging
  shapes;
- CLI invocation is first-class when the host needs version isolation, process
  isolation, stdout/stderr capture, cancellation, or exact commit pinning;
- neither embedding nor CLI invocation should become a second hosted runtime
  model;
- the current OSS implementation state is explicit in the RFC.

## Why

The previous wording called direct library embedding the "eventual" packaging
goal. That undersold the architectural decision we have already made: the core
requirement is not the packaging mechanism, but that the hosted platform runs
the OSS graph VM semantics and delegates only atomic node execution.

## Tests

- `bun test test/distributed-graph-runtime.test.ts test/runtime-profiles.test.ts`
- `bun run typecheck`
- `git diff --check`

## Next

Keep platform work aligned to this boundary: control plane owns graph execution
through OSS OpenProse; worker capsules execute `NodeExecutionRequest` envelopes
and return `NodeExecutionResult` envelopes.
