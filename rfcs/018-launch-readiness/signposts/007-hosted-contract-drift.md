# Signpost 007: Hosted Contract Drift Visibility

Date: 2026-04-27
Branch: `rfc/reactive-openprose`

## Summary

Made the OSS-to-hosted runtime contract visible as a launch canary.

Added:

- `docs/hosted-contract.md`
- `bun run smoke:hosted-contract`

The doc identifies the OSS-owned portable boundary:

- package hosted-ingest metadata
- remote envelopes
- artifact manifests
- run records
- graph plans
- distributed node request/result shapes

It also records the platform responsibility boundary: orgs, auth, storage,
scheduling, approvals, billing, workspace allocation, and operator UX.

## Tests

Passed:

```bash
bun run smoke:hosted-contract
bun test test/docs-public.test.ts
git diff --check
```

## Next

RFC 018 launch readiness is now complete on the OSS side. Move back to the
platform launch plan and start the platform readiness audit for self-serve Org
as Code.

