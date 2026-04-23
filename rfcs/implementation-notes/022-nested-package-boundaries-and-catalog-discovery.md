# Implementation Note 022: Nested Package Boundaries and Catalog Discovery

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 010, RFC 011

## Purpose

The twenty-second implementation wave makes package boundaries behave like real
package boundaries.

This was surfaced by the reference company repo, which now has:

- a root company package
- a nested customer package
- a real desire to search and install both cleanly from a local catalog

Without this wave, parent package metadata absorbed child package components,
catalog discovery stopped too early, and default search results were dominated
by test artifacts instead of reusable components.

## Scope

Added:

1. nested package boundary handling when packaging a root package
2. nearest-package-root resolution for `prose package <file>`
3. nested configured package discovery for local catalog/search/install flows
4. publish-quality scoring that ignores test components in aggregate warnings
5. default catalog search behavior that excludes tests unless explicitly
   requested

## Validation

This slice is on track when:

- `bun test` passes
- `bunx tsc --noEmit` passes
- `prose package <root>` excludes descendant packages with their own
  `prose.package.json`
- `prose search <catalog-root>` finds both parent and nested configured
  packages
- `prose install registry://.../<nested-component>` resolves a component inside
  a nested package cleanly from a local catalog root

## Progress Log

- 2026-04-23: excluded nested package roots from parent package metadata walks
- 2026-04-23: enabled nested configured package discovery in search/install
- 2026-04-23: constrained publish-quality scoring to publishable components
- 2026-04-23: hid test components from default search results

## Observations

- a Company-as-Code monorepo really does want both parent packages and child
  customer packages to coexist without flattening into one metadata blob
- catalog discovery and package metadata need different traversal rules:
  discovery should find nested packages; packaging should stop at them
- test components matter for evaluation history, but they should not be the
  first thing people see when browsing a catalog

## Next Slice

The next implementation slice should codify nested-package discovery in the
reference company validation script, then continue hardening the public-facing
reference package surface with better typed ports and explicit effects.
