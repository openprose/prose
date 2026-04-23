# Implementation Note 015: Publish Readiness Gate

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 011

## Purpose

The fifteenth implementation wave adds a local publish-readiness gate on top of
package metadata.

The key shift is from:

- "can we generate package facts?"

to:

- "can we turn those facts into an actionable pass/warn/fail decision before a
  real registry upload exists?"

## Scope

Added:

1. `prose publish-check` for local publish-readiness evaluation.
2. strict and non-strict modes over package blockers and advisory warnings.
3. checks for package version, source refs, source sha, typed ports, effect
   declarations, eval links, and example links.
4. fixture coverage for pass, warn, and fail cases.

## Non-Goals

- No real publish/upload flow yet.
- No signature verification or signing service yet.
- No hosted registry mutation yet.
- No org-specific policy configuration yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose publish-check <dir>` reports pass/warn/fail clearly.
- strict mode can escalate advisory gaps into blockers.

## Progress Log

- 2026-04-23: Added local publish-readiness evaluation over generated package
  metadata with pass/warn/fail reporting.

## Current Capabilities

- package quality is now actionable, not just descriptive.
- teams can gate package publication locally before any hosted catalog exists.

## Next Slice

The next implementation slice should prototype local catalog search over
generated package metadata so discovery can answer by type, effect, kind, and
quality before the hosted registry is built.
