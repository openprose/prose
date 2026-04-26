# Changelog

All notable changes to OpenProse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Local runtime meta-harness** — `prose run` is now the canonical local
  execution command. It plans reactive graphs, coordinates the Pi graph VM one
  node session at a time, and materializes durable run records, artifacts,
  traces, and eval acceptance through the shared run-store model.
- **Single-component handoff** — `prose handoff` exports one component contract
  for compatible one-off agent harnesses without treating those harnesses as
  reactive graph VMs.
- **Reactive run store and eval acceptance** — Runs, graph nodes, attempts,
  artifact records, policy labels, approvals, current/latest pointers, and
  executable eval results now share one local store model.
- **Hosted registry/runtime contract fixtures** — Added vendorable
  hosted-ingest, remote-envelope, artifact-manifest, run-record, and plan
  fixtures under `fixtures/hosted-runtime/`.
- **Runtime confidence matrix** — Added `bun run confidence:runtime`, which
  smokes compile, plan, graph, run, eval, remote envelopes, package metadata,
  strict publish checks, install, status, and trace across the canonical package
  surfaces.

### Changed

- **Package metadata is executable** — Package metadata now includes package IR
  hashes, registry refs, runtime profile metadata, artifact contracts, quality
  status, hosted ingest metadata, examples, and eval links.
- **Std, co, and examples align with runtime semantics** — The canonical
  packages compile, run locally through scripted Pi deterministic outputs or
  live Pi runtime profiles, and pass strict publish checks.
- **CLI inspection is human-readable** — Help explains the runtime loop, graph
  output annotates planning context, and status/trace output includes acceptance
  reasons.

### Removed

- **Top-level fixture-centered runtime path** — The old materialization command
  family is gone from the public CLI. Deterministic `--output` values now run
  through an internal scripted Pi session under `prose run` or
  `prose remote execute`.

## [0.10.0] - 2026-04-20

### Added

- **Canonical Contract Markdown section syntax** — Added `skills/open-prose/contract-markdown.md` as the source of truth for Markdown program/service files. Canonical contracts now use `### Services`, `### Requires`, `### Ensures`, `### Runtime`, `### Shape`, and related Markdown sections, while lowercase `requires:` / `ensures:` blocks remain supported as compatibility syntax.
- **ProseScript reference** — Added `skills/open-prose/prosescript.md` to separate pinned choreography (`### Execution`, `.prose` scripts, loops, branches, retries, and explicit calls) from declarative Contract Markdown authoring.
- **Git-native dependency resolution** — Programs declare dependencies via `use "owner/repo/path"` statements; `prose install` clones repos into `.deps/` and pins versions in `prose.lock` (committed to git). Runtime resolution reads from disk only, no network calls. Replaces the earlier `p.prose.md` registry fetch with GitHub as the authoritative source.
- **`run` as a first-class keyword type** — Programs can now declare `run` and `run[]` in `requires:` to depend on completed runs, enabling provenance tracking, DAG reconstruction, and staleness detection across workflows.
- **`environment:` contract section** — Added `environment:` as a contract section for declaring runtime dependencies (API keys, secrets, tool access) with VM-enforced security constraints: variables are verified at wiring time but never logged, embedded in artifacts, or passed to subagents that don't declare them.
- **CLI commands refactored as stdlib sugar** — Added `prose lint`, `prose preflight`, `prose inspect`, and `prose status` as thin wrappers around standard-library programs. Retires the transitional `prose compile` / `prose wire` / `prose migrate` surface now that Contract Markdown is primary.
- **Agent onboarding narrative** — Added `skills/open-prose/agent-onboarding.md` so agents can quickly learn when to propose OpenProse, how to activate the skill, and how to map host primitives to the VM.
- **Codex entrypoint** — Added `AGENTS.md` at the repo root as Codex's native router into `skills/open-prose/SKILL.md`, with a recommended `[agents]` config block (`max_depth = 2`) for recursive multi-service programs.
- **LongCoT benchmark automation** — Added GitHub Actions workflows and helper scripts for LongCoT benchmarking and the `longcot-rlmify` workflow dispatcher.

### Changed

- **Services are now a Markdown contract section** — Program topology moved from frontmatter `services:` into `### Services`, matching the rest of the human-readable contract surface.
- **Skill docs now route by intent** — Reworked `skills/open-prose/SKILL.md`, `README.md`, `help.md`, Forme, VM, guidance, and examples around a smaller "load what you need first" flow for agents.
- **Examples follow current Contract Markdown** — Updated bundled examples to the section-based contract style and clarified multi-service wiring, composites, runtime hints, and execution blocks.
- **Stdlib is external** — Documentation now points to `openprose/std`; repo-local `skills/open-prose/lib/` and `std/README.md` content was removed from this package.
- **RFCs and skill references are self-contained** — Cleaned RFC and skill docs so public references no longer depend on internal planning context.

### Fixed

- **Spec-to-skill documentation alignment** — Documented `each` postcondition evaluation in `ensures:` blocks, added environment security constraints to Forme wiring rules, introduced runtime delegation markers (`__delegate/` directory), and rewrote `help.md` with Contract Markdown as the primary surface and v0 as a clearly-scoped legacy subsection.
- **Internal consistency across skill files** — Updated stale file-extension references (`.prose` → `.md`), aligned v1/v2 terminology to legacy/declarative, added the missing `prose install` command to the CLI reference, and corrected cross-file pointers.

### Removed

- **Legacy internal skill artifacts** — Removed `skills/open-prose/SOUL.md` and obsolete repo-local stdlib docs in favor of the current public skill and external stdlib model.

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
