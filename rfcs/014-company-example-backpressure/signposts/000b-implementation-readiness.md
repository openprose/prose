# 000b: Implementation Readiness

**Date:** 2026-04-26
**Branch:** `rfc/reactive-openprose`
**Commit:** This documentation slice.

## What Changed

- Added `implementation-readiness.md` with the package scan, deletion map,
  implementation order, target module shape, and test posture.
- Added `phases/README.md` to clarify that implementation should start with
  Phase 02 before example fixtures.
- Added implementation guides under every RFC 014 phase.

## How It Was Tested

- Documentation-only slice.
- Run `git diff --check`.
- Run trailing-whitespace scan over RFC 014 docs.

## Next Slice

Start Phase 02.1A: remove public provider graph-runtime semantics and replace
them with runtime-layer language.

## Design Learning

The existing package is not too far off, but its old provider experiment is now
the main source of conceptual drag. The fastest path to the ideal form is to
delete that public shape early, keep the run/store/planner foundations, and
move deterministic execution into scripted Pi-session test infrastructure.
