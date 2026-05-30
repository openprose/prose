# Release Readiness

## Quick Start

```bash
prose compile
prose serve
```

## What This Repository Does

Keeps a release candidate ready to ship with clear evidence, remaining risk,
user-facing notes, and rollback context.

The repository reviews merged changes, CI evidence, migration notes, docs, and
known risks, then prepares a release decision brief.

## Source Shape

- `src/`: the `release-candidate-ready` responsibility, the
  `release-readiness-events` gateway, and the helper `function`s it `call`s
- `dist/`: compiled topology + canonicalizers produced by `prose compile`
- `runs/`: append-only receipt ledger
- `state/`: the canonical world-model (readiness decision + history)
- `deps/`: installed OpenProse dependencies
