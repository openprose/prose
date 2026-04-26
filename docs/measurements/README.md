# Measurement Evidence

This directory contains generated confidence evidence. Treat the files here as
reports, not source contracts.

## Stable Local Evidence

- `latest.json`
- `latest.md`
- `runtime-confidence.latest.json`
- `runtime-confidence.latest.md`

These files are deterministic or skipped-by-default. They are safe to use as
release gates because they do not require live model calls.

## Opt-In Live Evidence

- `live-pi.latest.json`
- `live-pi.latest.md`

These files come from `OPENPROSE_LIVE_PI_SMOKE=1 bun run smoke:live-pi`. They
exercise Pi SDK, model-provider auth, billing, timeout, and structured output
interop. They should inform release confidence, but they are not local fixtures
and should not be required from every contributor.

## Rule Of Thumb

When a test needs repeatability, depend on fixtures or scripted Pi reports.
When a test needs interop confidence, run the live smoke ladder and keep its
evidence labeled as live.
