# Signpost 001: OSS Deployment Identity

## Summary

Added the first OSS deployment primitive:

- deployment identity and release keys
- deployment manifests
- package entrypoint discovery for program workflows
- environment binding preflight
- `prose deployment <dir>` CLI preflight
- deterministic hosted node prompt envelope artifacts

The key implementation refinement is that `deployment_id` is stable across
package promotion. The active package version, source SHA, and package semantic
hash live in `release_key` and package identity fields.

The hosted fixture check also exposed an unstable artifact hash caused by an
absolute workspace path inside `openprose-node-envelope.json`. The persisted
prompt envelope now uses `.` for the agent-visible workspace path while the
runtime request still carries the real worker path.

## Test Notes

Passed:

```bash
bun test test/deployment.test.ts
bun test test/deployment.test.ts test/hosted-contract-fixtures.test.ts
bun run typecheck
bun test
bun run prose package examples --format json --no-pretty
bun run prose package /Users/sl/code/openprose/customers/prose-openprose --format json --no-pretty
```

## Next

Continue Phase 01 by hardening entrypoint discovery and deployment preflight
against the full `customers/prose-openprose` package, then proceed to
package-level entrypoint graph planning.
