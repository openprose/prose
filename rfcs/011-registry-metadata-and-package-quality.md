# RFC 011: Registry Metadata and Package Quality

**Status:** Draft
**Date:** 2026-04-23
**Author:** OpenProse design session

## Summary

Any Git repository can be a package source. OpenProse should host the canonical
registry/catalog that indexes package versions, components, schemas, evals,
examples, run fixtures, quality scores, and optional hosted runtime metadata.

The registry is not the source of code. Git is. The registry is the discovery,
quality, documentation, and trust layer.

## Decisions

1. Git repos are package sources.
2. OpenProse hosts the canonical public catalog.
3. Private catalogs should be possible later using the same metadata model.
4. Registry metadata should be generated from source, IR, evals, examples, and
   signed package versions.
5. Hosted callable runtimes are platform/backend features built on top of
   registry metadata, not required for the package source model.

## Package Manifest

A package should declare:

```yaml
name: string
version: string
description: string
source:
  git: host/owner/repo
  sha: string
components:
  - path: string
    name: string
    kind: string
    summary: string
schemas: []
evals: []
examples: []
license: string
```

Manifest fields may be generated from source plus package config, but the
registry should store the resolved version metadata.

## Component Metadata

For each component:

- name
- kind
- package path
- input ports and types
- output ports and types
- effect declarations
- access policy requirements
- evals
- examples
- quality score
- latest compatible IR version
- semantic IR hash
- source SHA

## Quality Signals

Registry ranking should prefer:

- passing evals
- typed public ports
- explicit effects
- examples with golden runs
- contract-grader score
- inspector score
- usage/import count
- recent successful hosted runs, when available

Stars may be displayed but should not dominate quality ranking.

## Publishing

Publishing should:

1. Compile package source to IR.
2. Run static lint.
3. Run required evals or record `no_evals: true`.
4. Generate registry metadata.
5. Sign source SHA and metadata.
6. Upload metadata to catalog.

The registry should not accept mutable package versions.

## Hosted Runtime Metadata

The registry may point at hosted runtime capabilities:

```yaml
hosted:
  callable: true
  endpoint: string
  pricing: string
  auth_required: true
  auth_modes: string[]
  trace_available: true
```

The OSS RFC defines metadata shape and invariants only. Backend API and storage
details belong in internal platform specs.

## Validation

### Static Checks

- Package manifest resolves all listed components.
- Component metadata can be generated from IR.
- Published components have typed public ports or explicit warnings.
- Published components have effects or explicit warnings.
- Eval links resolve.
- Signed source SHA matches the package source.

### Runtime Checks

- Registry search can answer by type, effect, component kind, and quality.
- Installing a package by registry ref resolves to Git source and pinned SHA.
- Hosted runtime metadata is ignored by local-only runners.

### Golden Fixtures

Create fixtures for:

- package with one service
- package with schemas
- package with evals
- package with hosted metadata
- package missing evals
- package with unsigned SHA

### Agent Work Instructions

Agents should keep registry indexing independent from hosted execution. First
make packages searchable and installable; only then wire hosted callable runs.

### Done Criteria

- Package metadata can be generated from canonical std/co components.
- Registry index supports component search by ports and effects.
- Publishing fails or warns on missing evals, missing types, or missing effects
  according to package policy.
- Local `prose install` remains Git-native and does not require hosted runtime.
