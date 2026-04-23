# Implementation Note 016: Local Catalog Search

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 011

## Purpose

The sixteenth implementation wave prototypes registry search locally over
generated package metadata.

The key shift is from:

- "can we generate package metadata?"

to:

- "can we answer discovery questions by type, effect, kind, and quality before
  a hosted catalog exists?"

## Scope

Added:

1. `prose search` over local package roots.
2. package-root discovery from directories containing `prose.package.json` or
   canonical `.prose.md` source.
3. filtering by type, effect, component kind, and minimum quality.
4. text and JSON result surfaces for local catalog exploration.
5. fixture coverage for effect and type-based discovery.

## Non-Goals

- No hosted registry index yet.
- No fuzzy text search or ranking beyond quality-first sort yet.
- No auth or tenancy boundaries yet.
- No install-by-registry-ref flow yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose search <dir>` can answer by type, effect, kind, and quality.
- results are derived from generated package metadata rather than handwritten
  package docs.

## Progress Log

- 2026-04-23: Added a local catalog-search prototype over generated package
  metadata.

## Current Capabilities

- OpenProse can now prototype registry discovery locally before any backend
  catalog exists.
- RFC 011 search criteria are exercised in OSS instead of living only on paper.

## Next Slice

The next implementation step likely needs product review: either install by
registry ref, richer ranking/query semantics, or hosted catalog APIs. Those
choices affect user-facing package identity and backend boundaries.
