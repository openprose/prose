# Signpost 005: OSS Local Company Smoke

## Summary

Added `bun run smoke:company:local`, a local OpenProse Native Company smoke for
`customers/prose-openprose`.

The smoke:

- resolves the reference company root
- initializes an `openprose-company-dev` deployment
- stores dev-safe bindings without secret values
- enables the four RFC 017 acceptance entrypoints
- triggers each entrypoint through the local deployment runtime
- emits a compact JSON summary with deployment id, state root, preflight
  evidence, run ids, plan statuses, and pointer ids

Passing local run:

- `openprose-company`: succeeded / ready
- `intelligence-daily`: succeeded / ready
- `gtm-pipeline`: succeeded / ready
- `stargazer-daily`: succeeded / ready

## Test Notes

Passed:

```bash
bun run smoke:company:local
bun run typecheck
```

The smoke currently validates deployment state, package graph planning, and
pointer movement. It does not yet execute the package graph nodes through real
Pi sessions; that remains the next important OSS/runtime depth step before the
hosted platform treats this as a full live company execution.

## Next

Move into reference-company acceptance depth: either synthesize package
entrypoint source for local scripted execution, or teach the graph runtime to
execute package IR directly. The second path is the more ideal long-term shape
because hosted control plane execution also needs package-IR-native runs.
