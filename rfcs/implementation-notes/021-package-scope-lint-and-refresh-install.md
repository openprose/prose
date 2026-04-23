# Implementation Note 021: Package-Scope Lint and Refreshable Local Install

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 010, RFC 011

## Purpose

The twenty-first implementation wave closes two local-first gaps that only
showed up once the real reference company repo was validated against the new
toolchain:

- directory linting needs package-wide visibility, not just file-local or
  subtree-local visibility
- workspace install needs an explicit way to refresh lockfile pins against the
  current source head during active local development

This takes OpenProse one step further from fixture-only confidence and one step
closer to "the real repo validates the way people will actually use it."

## Scope

Added:

1. package-aware directory linting, including subdirectory lint runs inside a
   larger package root
2. compile-time visibility of package-scoped component names for lint-only
   unresolved service checks
3. `prose install --refresh` for workspace dependency installs
4. tests covering package-scope linting and refreshed source pins

## Validation

This slice is on track when:

- `bun test` passes
- `bunx tsc --noEmit` passes
- `prose lint customers/prose-openprose/systems` resolves package-local and
  package-wide service references cleanly
- `prose install <workspace> --refresh --source-override ...` updates
  `prose.lock` to the current source HEAD

## Progress Log

- 2026-04-23: added package-scoped component visibility to directory linting
- 2026-04-23: made subdirectory lint runs inherit their nearest package scope
- 2026-04-23: added refreshable local dependency installs for active monorepo
  development

## Observations

- file-local compilation remains the right narrow waist for IR, but repo-scale
  authoring tools need package context to avoid false negatives
- local source overrides without an explicit refresh path lead to stale lockfile
  drift that is hard to notice in active development
- the reference company repo is now useful as a tooling truth test, not just as
  an example corpus

## Next Slice

The next implementation slice should checkpoint the reference company repo as a
validated local-first package workspace, then decide how far to push typed-port
and effect hardening for its public reference surface.
