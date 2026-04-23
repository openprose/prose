# Implementation Note 014: Package Metadata Generation

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 011

## Purpose

The fourteenth implementation wave turns canonical source into registry-shaped
package metadata.

The key shift is from:

- "can we compile individual components?"

to:

- "can we describe a package, its components, and its quality signals in a form
  the catalog can consume?"

## Scope

Added:

1. `prose package` to generate package/registry metadata from canonical source.
2. support for optional `prose.package.json` package config.
3. component metadata projection with ports, effects, access, hashes, and
   warnings.
4. package quality summary with explicit warnings for missing version, source,
   evals, or effect declarations.
5. fixture coverage for configured and config-less package roots.

## Non-Goals

- No publishing/upload flow yet.
- No signature verification yet.
- No hosted catalog API yet.
- No install flow yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose package <dir>` emits package metadata from canonical `.prose.md`
  source.
- missing package config fields produce explicit warnings rather than silent
  omissions.

## Progress Log

- 2026-04-23: Added package metadata generation, package quality summaries, and
  fixture coverage for registry-shaped metadata.

## Current Capabilities

- OpenProse can now project a package root into a catalog-friendly metadata
  document.
- registry work can build on generated facts instead of handwritten README
  fragments.

## Next Slice

The next implementation slice should add a publish-readiness gate that turns
package metadata and diagnostics into a local pass/fail report before any real
registry upload exists.
