# Changelog

All notable changes to OpenProse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-03-23

### Breaking Changes

- **Prose v2: programs are now Markdown files** — `.md` with YAML frontmatter and contract-based semantics (`requires:`/`ensures:`) replaces imperative `.prose` syntax as the primary format. Legacy `.prose` files still run via v0 mode.
- **Two-phase execution** — Programs with multiple services run through Forme (Phase 1: contract wiring) then the Prose VM (Phase 2: execution). Single-service programs skip Phase 1.
- **Removed**: `websh` skill, voice alts, common library (moved elsewhere).

### Added

- **Forme Container (Phase 1)** — Auto-wires multi-service programs by matching `requires:`/`ensures:` contracts across components. Produces a manifest that the VM executes.
- **Contract semantics** — Programs declare inputs (`requires:`) and outputs (`ensures:`) instead of imperative orchestration. The container figures out the wiring.
- **Shapes** — Typed structure declarations for contract values.
- **Strategies** — Declarative guidance for how the VM should handle edge cases during execution.
- **Errors** — Structured error declarations for programs.
- **Invariants** — Runtime constraints that must hold throughout execution.
- **Test programs** — `prose test` command for running test suites against programs.
- **Standard library** (`lib/`) — 9 utility programs: calibrator, cost-analyzer, error-forensics, inspector, profiler, program-improver, project-memory, user-memory, vm-improver.
- **Migration tooling** — `prose migrate` converts `.prose` files to `.md` format.
- **50 example programs** — All examples rewritten in v2 `.md` format, covering basics through complex multi-service orchestrations.

### Changed

- **v0 VM moved to `v0/`** — Legacy specs (`prose.md`, `compiler.md`, `state/`, `primitives/`) relocated to `v0/` subdirectory.
- **New `prose.md`** — v2 VM execution semantics for `.md` programs.
- **New `forme.md`** — Forme container semantics for Phase 1 wiring.
- **New `state/filesystem.md`** — v2 file-based state with workspace/bindings model.
- **Guidance directory** — `guidance/tenets.md`, `guidance/patterns.md`, `guidance/antipatterns.md` for program authoring.

## [0.8.1] - 2025-01-23

### Changed

- **Token efficiency improvements**: State tracking is now significantly more compact, reducing context usage during long-running programs. Append-only logs replace verbose state files, and compact markers replace verbose narration.

## [0.8.0] - 2025-01-23

### Breaking Changes

- **Registry syntax simplified**: The `@` prefix is no longer required for registry references.
  - **Migration**: Update your imports and run commands:
    - `prose run @irl-danb/habit-miner` becomes `prose run irl-danb/habit-miner`
    - `use "@alice/research"` becomes `use "alice/research"`
  - Resolution rules: URLs fetch directly, paths with `/` resolve to p.prose.md, otherwise local file

### Added

- **Memory Programs** (recommend sqlite+ backend):
  - `user-memory.prose`: Cross-project persistent personal memory with teach/query/reflect modes
  - `project-memory.prose`: Project-scoped institutional memory with ingest/query/update/summarize modes

- **Analysis Programs**:
  - `cost-analyzer.prose`: Token usage and cost pattern analysis with single/compare/trend scopes
  - `calibrator.prose`: Validates light vs deep evaluation reliability
  - `error-forensics.prose`: Root cause analysis for failed runs

- **Improvement Loop Programs**:
  - `vm-improver.prose`: Analyzes inspection reports and proposes PRs to improve the OpenProse VM
  - `program-improver.prose`: Analyzes inspection reports and proposes PRs to improve .prose source code

- **Skill Security Scanner v2**: Enhanced with progressive disclosure, model tiering (Sonnet for checklist, Opus for deep analysis), parallel scanners with graceful degradation, and persistent scan history

- **Interactive Example**: New example demonstrating input primitives
- **System Prompt**: Added system prompt configuration

### Removed

- **Telemetry system**: Removed all telemetry-related code, config, and documentation including USER_ID/SESSION_ID tracking and analytics endpoint calls

### Changed

- User-scoped persistent agents now stored in `~/.prose/agents/`
- Documentation updates for registry syntax changes
