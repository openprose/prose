# Package IR Slice

**Date:** 2026-04-25
**Phase:** 02.1 Compile Packages As First-Class Units

OpenProse now has a package/workspace compiler entry point:

- library: `compilePackagePath(path)`
- CLI: `prose compile <dir>`

## Shape

`PackageIR` is the first package-level executable contract. It contains:

- `package_ir_version`
- `semantic_hash`
- `root`
- package manifest metadata from `prose.package.json`
- package files with source hashes, per-file semantic hashes, component ids,
  and per-file diagnostics
- package dependency pins discovered across files
- package-scoped components with relative source maps
- package-scoped graph nodes and edges
- package diagnostics

This does not replace `ProseIR` yet. It wraps and coordinates file-level
compilation while establishing the package as the runtime unit.

## Golden Fixtures

The package IR contract is guarded by summary goldens:

- `fixtures/package-ir/examples.summary.json`
- `fixtures/package-ir/std.summary.json`
- `fixtures/package-ir/co.summary.json`

The summaries intentionally include package hash, manifest metadata, file list,
component ids, component refs, graph edge counts, dependencies, and diagnostic
counts. They are compact enough to review while still catching meaningful
contract drift.

## Current Gaps

- The package graph uses package-wide exact port matching and service reference
  edges. Structured execution IR now exists, but the package graph does not yet
  fully derive dependency edges from every structured control construct.
- Duplicate common port names can produce package-wide ambiguity warnings.
  Phase 02.5 should replace this with accepted intelligent wiring proposals.
- `schemas`, eval declarations, examples, and policy details are represented
  from package metadata, but schema and eval execution are not yet real.
- `packagePath` still generates registry metadata by compiling files
  independently. Later slices should make package metadata a projection of
  package IR.
