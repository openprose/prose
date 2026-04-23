# Implementation Note 020: Package Roots and Monorepo Install

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 010, RFC 011

## Purpose

The twentieth implementation wave upgrades the first-party package roots from
legacy markdown collections into real local-registry packages, then closes the
monorepo gap that appeared once those packages were exercised for real.

The key shift is from:

- "the package tooling works on fixtures"

to:

- "the real `std` and `co` roots package, install, search, and publish-check
  correctly in the source repo they actually live in"

## Scope

Added:

1. canonical `.prose.md` source paths across `packages/std` and `packages/co`
2. `prose.package.json` manifests for `@openprose/std` and `@openprose/co`
3. git-backed source inference for package roots that omit `source.git` and
   `source.sha`
4. `source.subpath` metadata so registry installs work for monorepo packages
5. a fully typed/effect-declared `co` package as the first publish-pass
   exemplar
6. coverage for inferred git source metadata and monorepo component installs

## Validation

This slice is on track when:

- `bun test` passes
- `bunx tsc --noEmit` passes
- `prose publish-check packages/co` returns `PASS`
- `prose install registry://openprose/@openprose/co@0.11.0-dev/company-repo-checker --catalog-root packages`
  resolves a component file under `packages/co/...`
- `prose install registry://openprose/@openprose/std@0.11.0-dev --catalog-root packages`
  installs from the same source repo cleanly

## Progress Log

- 2026-04-23: Renamed executable first-party package sources to `.prose.md`
- 2026-04-23: Added publishable package manifests for `std` and `co`
- 2026-04-23: Added inferred git source metadata and monorepo source subpaths
- 2026-04-23: Upgraded `co` to typed/effect-declared publish-pass quality

## Observations

- `co` is the right place to model the ideal package shape first. It is small
  enough to fully type and annotate, and it gives the ecosystem a clean starter
  package to copy.
- `std` is now packageable and installable, but still carries advisory quality
  debt. That is acceptable for local-first progress, but the remaining untyped
  ports and undeclared effects should be treated as a future library-hardening
  pass.
- monorepo package identity needs both repo-level source identity and
  package-level subpath identity. A repo checkout alone is not enough when a
  registry ref points at a package nested inside that repo.

## Next Slice

The next implementation slice should transform
`customers/prose-openprose/` into the new best-practice reference company:
canonical `.prose.md` sources, package manifest, local dependency bootstrap,
and validation through the local OpenProse CLI surfaces.
