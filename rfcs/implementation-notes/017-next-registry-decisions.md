# Implementation Note 017: Next Registry Decisions

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 011

## Purpose

The seventeenth note is a signpost rather than a code slice.

At this point OpenProse has:

1. canonical IR and manifest projection
2. local run materialization and plan preview
3. graph, trace, lint, format, highlight, and grammar surfaces
4. package metadata generation
5. publish-readiness checks
6. local catalog search

The next work is still very promising, but it starts to shape user-facing
package identity and hosted-registry semantics. That deserves an explicit pause
and a few narrow product decisions before implementation continues.

## Decision Questions

### 1. What is the canonical registry reference syntax?

Recommended:

- define this before install-by-registry-ref
- keep it simple and Git-native in spirit
- prefer a shape like `registry://package@version/component` or an equivalent
  canonical textual ref with separate package/version/component segments

Why:

- install, search, docs, copy-paste UX, hosted APIs, and lockfiles all depend
  on the same identity model

### 2. Which package roots are publishable?

Recommended:

- require `prose.package.json` for publishable/installable packages
- continue allowing config-less roots for local search and experimentation

Why:

- package version, source SHA, hosted metadata, eval links, and license should
  not be inferred when users expect durable package identity

### 3. Should search stay structured first, or become fuzzy next?

Recommended:

- keep search structured and deterministic first
- add fuzzy text/tag ranking only after registry refs and package identity are
  settled

Why:

- the current work validates the metadata model
- ranking semantics are easier to evolve than identity semantics

### 4. What is the first install surface?

Recommended:

- after registry-ref syntax is approved, implement a local read-only
  `prose install <registry-ref>` flow that resolves metadata back to Git source
  and pinned SHA

Why:

- this is the shortest path to validating RFC 011 end to end without needing a
  hosted catalog write path yet

### 5. What should stay out of OSS for now?

Recommended:

- hosted catalog APIs
- auth and tenancy
- private package visibility
- billing/metering
- runtime serving metadata beyond shape validation

Why:

- these are platform concerns, not blockers for proving the package model

## Recommended Next Implementation Order

1. approve canonical registry-ref syntax
2. specify package publishability rules
3. build local install-by-registry-ref against generated metadata
4. only then decide whether the next step is richer search or hosted catalog
   APIs

## Validation For The Next Phase

The next phase is on track when:

- one package can be addressed by a stable registry ref
- install resolves that ref back to Git source and pinned SHA
- install works without hosted runtime execution
- package identity is described once and reused consistently across search,
  lockfiles, docs, and install UX
