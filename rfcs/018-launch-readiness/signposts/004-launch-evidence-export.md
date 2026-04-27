# Signpost 004: Launch Evidence Export

Date: 2026-04-27
Branch: `rfc/reactive-openprose`

## Summary

Added a generated OSS launch evidence bundle for the private technical report.

New command:

```bash
bun run evidence:launch
```

It reads:

- `docs/measurements/latest.json`
- `docs/measurements/runtime-confidence.latest.json`
- `docs/measurements/cold-start.latest.json`
- `docs/measurements/agent-onboarding.latest.json`
- `docs/measurements/live-pi.latest.json` when present

It writes:

- `docs/measurements/launch-evidence.latest.json`
- `docs/measurements/launch-evidence.latest.md`

## Tests

Passed:

```bash
bun run evidence:launch
bun test test/binary-package.test.ts test/docs-public.test.ts
git diff --check
```

Current generated evidence:

- launch evidence export: pass, 4 confidence gates
- package health includes `examples`, `packages/std`, `packages/co`, and
  `customers/prose-openprose`

## Next

Update the private platform technical report to cite the generated OSS launch
evidence and then add platform-hosted evidence aggregation for the Native
Company dev proof.

