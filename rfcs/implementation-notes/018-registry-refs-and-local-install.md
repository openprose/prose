# Implementation Note 018: Registry Refs and Local Install

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 011

## Purpose

The eighteenth implementation wave makes package identity explicit and gives the
local runtime a real install path.

The key shift is from:

- "can we search package metadata?"

to:

- "can we address a package by a stable ref and install its pinned Git source
  locally?"

## Scope

Added:

1. canonical registry ref parsing and construction.
2. package metadata fields for catalog and package registry ref.
3. `prose install <registry-ref>` for local install through package metadata.
4. lockfile support for both source pins and registry-ref pins.
5. fixture coverage for installing a package from a local catalog root into
   `.deps/`.

## Canonical Ref Shape

Current canonical shape:

`registry://<catalog>/<package>@<version>`

Optional component addressing:

`registry://<catalog>/<package>@<version>/<component>`

Examples:

- `registry://openprose/@openprose/catalog-demo@0.1.0`
- `registry://openprose/@openprose/catalog-demo@0.1.0/brief-writer`

## Non-Goals

- No hosted registry API yet.
- No install-by-query flow yet.
- No transitive dependency install from package refs yet.
- No registry-aware runtime resolution in execution paths yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose install <registry-ref>` clones the pinned Git source into `.deps/`.
- `prose.lock` records both source pins and registry-ref pins.

## Progress Log

- 2026-04-23: Added canonical registry refs, local install-by-ref, and
  lockfile support for registry pins.

## Current Capabilities

- package identity is now explicit in a way search, docs, and install can all
  share.
- local install works without any hosted registry API.

## Next Slice

The next implementation slice should make local dependency install real for
workspace source trees, not only explicit registry refs, so `std/` and `co/`
consumers can bootstrap entirely through the Bun CLI.
