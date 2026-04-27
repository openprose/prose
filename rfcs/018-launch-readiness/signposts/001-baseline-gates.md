# Signpost 001: Launch Readiness Baseline Gates

Date: 2026-04-27
Branch: `rfc/reactive-openprose`

## Summary

Created RFC 018 as the OSS launch readiness layer.

The public hardening queue in RFC 015 remains the implementation cleanup
inventory. RFC 018 adds the launch bar above it: fresh install confidence,
agent onboarding confidence, generated technical-report evidence, clear
deterministic-versus-live evidence classes, package publication confidence,
and hosted contract drift prevention.

## Baseline Results

Passed:

```bash
bun run typecheck
bun run test
bun run confidence:runtime
bun run smoke:binary
```

Notable generated evidence:

- `bun run test`: 282 pass, 1 skipped, 0 fail
- `bun run confidence:runtime`: PASS, 18 checks, 9225ms
- generated measurement reports show strict publish-check pass for
  `examples`, `packages/std`, `packages/co`, and the 99-component
  `customers/prose-openprose` package

## Why This Matters

The launch needs three artifacts to agree:

- the OSS package as the local developer experience
- the private technical report as evidence and architectural explanation
- the hosted Org-as-Code platform as the managed version of the same runtime
  model

This signpost records that the OSS baseline is already healthy enough to start
working through launch-specific confidence gaps rather than broad structural
repairs.

## Next

Start with `R001`: add a fresh-install/cold-start gate for the publishable
binary package. That is the most direct way to catch hidden repo-local
assumptions before public launch.

