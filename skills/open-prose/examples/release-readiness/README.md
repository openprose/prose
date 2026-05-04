# Release Readiness

## Quick Start

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose serve
```

## What This Repository Does

Keeps a release candidate ready to ship with clear evidence, remaining risk,
user-facing notes, and rollback context.

The repository reviews merged changes, CI evidence, migration notes, docs, and
known risks, then prepares a release decision brief.

## Source Shape

- `src/`: responsibility, manual gateway, readiness system, and services
- `dist/`: compiled intent produced by `prose compile`
- `runs/`: bounded activation receipts
- `state/`: durable release readiness history
- `deps/`: installed OpenProse dependencies
