# IR Contract Metadata Slice

**Date:** 2026-04-25
**Phase:** 02.4 Capture Schemas, Evals, Examples, And Policies In IR

Package IR now carries package-level contract metadata directly instead of
leaving it as manifest-only context.

## Shape

`PackageIR` now includes:

- `resources`: manifest-declared schemas, evals, and examples with existence,
  source hash, linked component ids, and resource diagnostics.
- `policy`: a package-wide policy projection containing effects, access rules,
  and policy labels derived from access and port labels.
- `hashes`: split hashes for source, semantic contract, dependencies, policy,
  and runtime config.

The top-level `semantic_hash` remains equal to `hashes.semantic_hash`.

## Hash Semantics

- `source_hash`: raw source/resource content hash. Formatting-only source churn
  changes this hash.
- `semantic_hash`: executable package contract hash. Formatting-only source
  churn should not change this hash.
- `dependency_hash`: package dependency pins.
- `policy_hash`: effect declarations, access rules, and labels.
- `runtime_config_hash`: runtime settings, environment declarations, and hosted
  runtime metadata.

This gives the planner and hosted runtime more precise stale reasons: source
changed, dependency pins changed, policy changed, or runtime config changed.

## Fixtures

The focused fixture for this slice is:

- `fixtures/package-ir/contract-metadata/`

The broad package IR goldens now also include hashes, resources, and policy
summaries:

- `fixtures/package-ir/examples.summary.json`
- `fixtures/package-ir/std.summary.json`
- `fixtures/package-ir/co.summary.json`

## Current Gaps

- Schema resources are hashed and linked, but JSON schema contents are not yet
  parsed into structural type IR. Phase 06 owns schema compatibility and output
  validation.
- Policy labels are projected from access rules and port labels; a more
  ergonomic port-level source syntax still needs to be finalized before the
  stdlib migration.
- Package metadata generation still has its own metadata builder. A later
  cleanup should make `prose package` a projection of package IR rather than a
  sibling compiler path.
