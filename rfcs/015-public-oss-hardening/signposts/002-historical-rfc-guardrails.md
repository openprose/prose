# 002 Historical RFC Guardrails

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: mark historical runtime notes as superseded`

## Finding

RFC 013 and the implementation notes preserve useful history, but several
phase docs still read like active instructions for flat providers, fixture
providers, local-process providers, and old command shapes. That can send a new
agent down a path the package has already outgrown.

## What Changed

- Added a historical-status banner to the RFC 013 phase index.
- Updated the RFC 013 phase index to describe the current RFC 014 vocabulary:
  Pi graph VM, node runners, and model providers inside Pi runtime profiles.
- Replaced old `--provider` phase-index smoke examples with `--graph-vm pi`
  examples.
- Added a supersession banner to the old Phase 04 provider-protocol document.
- Added `rfcs/implementation-notes/README.md` to frame older implementation
  notes as diary evidence, not current implementation guidance.
- Marked the RFC 015 TODO item as done.

## Tests Run

- `bun test test/cli-ux.test.ts`
- `git diff --check`

## Result

The current RFC entry points now steer readers toward RFC 014 and RFC 015 before
they encounter historical provider wording. Old signposts remain intact as
evidence, but the top-level navigation no longer presents them as live plans.

## Next Slice

Move to public release quality: normalize generated measurement reports so
committed evidence does not contain machine-local absolute paths.
