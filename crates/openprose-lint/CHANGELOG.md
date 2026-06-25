# Changelog

All notable crate-specific changes to `openprose-lint` are documented here.
The root `CHANGELOG.md` remains the public monorepo changelog.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this crate follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Colocated `openprose-lint` under `crates/openprose-lint/` inside
  `openprose/prose`.
- Switched the OpenProse registry mapping from a nested reference checkout to
  the parent repository checkout, with `spec-snapshot/openprose` as the packaged
  Cargo fallback.
- Moved blocking linter policy into the root `scripts/lint-prose.sh` gate.
- Added an optional true-up advisory path for maintainer drift checks while
  keeping generated `.true-up/` cache ignored.
- Added `scripts/lint-prose.sh package` for Cargo package listing, publish
  dry-run, and packaged snapshot verification.
- Added an independent `openprose-lint` version track in the root
  `.version-bump.json`.

### Added

- `crates/openprose-lint/scripts/sync-spec-snapshot.sh` to refresh and check the
  packaged OpenProse spec snapshot.

## [0.2.0]

Linter, LSP, and WASM build for the OpenProse language: linting, briefing,
capabilities, conformance fixtures, adapter manifests, and spec identity checks.

### Added

- `lint` for current Markdown programs, with `compat` and `strict` profiles.
- `briefing` for compact deterministic preflight blocks before VM execution.
- `conformance` for fixed in-repo conformance cases.
- `capabilities` for runtime capability requirements and runtime manifest
  checks.
- `adapter validate` and `adapter dogfood` for deterministic coding-agent
  adapter manifests.
- `lint-legacy` for archived imperative `.prose` files.
- `discover` for spec-gap reports over an OpenProse corpus.
- `specs` and `specs verify` for source identity inspection.
- `openprose-lsp` for editor diagnostics and hover support.
