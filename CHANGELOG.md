# Changelog

All notable changes to OpenProse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`prose start` onboarding coach** — Added the post-install `prose start`
  route, `skills/open-prose/start.md` onboarding playbook, README quickstart
  guidance, and CLI forwarding/tests so shell users can invoke the same
  agent-session onboarding command.
- **Declared `### Skills` section** — Components may now declare the agent
  harness skills they require in a `### Skills` section using the
  `namespace:name` colon form (e.g. `document-skills:pdf`). The compiler
  program resolves declared skills against `./skills/`, `~/.claude/skills/`,
  `~/.codex/skills/`, and `~/.agents/skills/`, and `prose compile` fails closed
  with a `skill_unresolved` diagnostic naming the skill and the searched paths
  if any are missing. OpenProse never installs harness skills — installing them
  remains the user's responsibility (BYO harness). See
  `skills/open-prose/contract-markdown.md` (Skills),
  `skills/open-prose/compiler/index.prose.md` (skills_resolver), and
  `skills/open-prose/examples/declared-skills/` for the spec and a worked
  example. Resolves [#60](https://github.com/openprose/prose/issues/60).
- **Declared `### Tools` section** — Components may now declare host CLI
  executables they require in a `### Tools` section using `cli:<name>`
  declarations. The compiler program resolves supported declarations through a
  PATH executable check, fails closed with `tool_invalid`,
  `tool_unsupported_kind`, or `tool_unresolved` diagnostics, and emits resolved
  tools into Forme manifests with `requiredBy` attribution. OpenProse never
  installs or modifies host tools. Tracks
  [#76](https://github.com/openprose/prose/issues/76).

### Fixed

- **Serve shutdown logging** — In-flight activations interrupted by `prose serve`
  shutdown now log as shutdown cancellations instead of generic trigger
  failures.
- **Status wording** — `prose status` now describes absent responsibility state
  as `no runtime status yet` instead of `missing`.
- **Compiler discipline** — The bundled compiler program now returns after
  writing `manifest.next.json` and leaves deterministic validation to the CLI.
- **Smoke postconditions** — OpenProse smoke checks now trust verified run
  artifacts when a model exits nonzero after satisfying the fixture contract.

## [0.13.1] - 2026-05-05

### Fixed

- **Compile success detection** — `prose compile` now accepts a freshly written
  valid `manifest.next.json` when the harness exits nonzero afterward, while
  still rejecting missing manifests, invalid IR, error diagnostics, and aborted
  runs.
- **Serve trigger behavior** — HTTP triggers now acknowledge immediately while
  dispatching activations in the background, and cron-only manifests still expose
  the local health endpoint.
- **Smoke fixture isolation** — Responsibility Runtime smoke fixtures stay
  inside their source root and include the local pattern dependencies needed by
  the compiler.

## [0.13.0] - 2026-05-04

### Added

- **Canonical compiler IR contract** — Added `skills/open-prose/compiler/ir-v0.md` and refactored the bundled compiler into a compact ProseScript service that emits the v0 repository IR directly.
- **Unified release preflight** — Added one OpenProse release preflight for CLI, SKILL, plugin manifests, installer defaults, changelog notes, npm uniqueness, and GitHub release/tag uniqueness.

### Changed

- **Single release train** — The CLI, SKILL metadata, plugin manifests, package lock, and tarball installer now share one OpenProse version.
- **Release workflow** — Replaced split CLI/plugin release ownership with one protected OpenProse release workflow.
- **Smoke visibility** — OpenProse smoke fixtures now run as separate GitHub Actions jobs and emit progress while live agent cases are running.

## [0.12.0] - 2026-05-04

### Added

- **Responsibility Runtime live serve** — `prose serve` now runs local cron and HTTP trigger adapters from compiled `triggers[]`, dispatches events into ordinary bounded `prose run` activations, and feeds unhealthy judge status into deduped pressure fulfillment.
- **Responsibility Runtime source model** — Added Responsibility-Oriented Architecture docs for standing goals, Reactor reconciliation, gateways, compile-time Forme wiring, judge activations, pressure, and deterministic runtime status.
- **Compiler program docs** — Added `skills/open-prose/compiler/` with the bundled compiler program and pass docs for source discovery, responsibility lowering, gateway lowering, Forme compilation, IR emission, and IR validation.
- **Native repository examples** — Replaced the old numbered examples with eight small OpenProse Native Repositories: `stargazer-outreach`, `incident-briefing-room`, `customer-risk-radar`, `release-readiness`, `vendor-renewal-watch`, `research-inbox-triage`, `content-performance-loop`, and `compliance-evidence-tracker`.

### Changed

- **OpenProse root model** — Documented native, attached, and user-global OpenProse roots with `src/`, `dist/`, `runs/`, `state/`, `deps/`, `prose.lock`, and `.env` as the current filesystem convention.
- **Command routing** — Restored `prose compile` as the Responsibility Runtime compiler command that emits `dist/manifest.next.json`; `prose serve` consumes `dist/manifest.active.json`, and `prose status` inspects active IR and runtime receipts.
- **Plugin descriptions** — Updated plugin metadata to describe run receipts under the active OpenProse root instead of assuming only `.agents/prose/runs/`.

### Fixed

- **Responsibility Runtime validation** — `prose compile` now validates the emitted `manifest.next.json`; repository IR rejects invalid cron expressions, wrong trigger fields, and live triggers that wake no activations.
- **Responsibility Runtime freshness** — `prose compile` clears stale compile output before running; `prose serve` rejects stale judge status output, validates that status belongs to the launched judge activation, and marks older pressure as resolved once a newer healthy status is recorded.
- **Responsibility Runtime source safety** — Repository IR now rejects non-root-relative source paths and requires live triggers to wake the judge for their responsibility.
- **Responsibility Runtime pressure** — Pressure dedupe now keys on the source status timestamp so fresh unhealthy judgments can each drive one reconciliation attempt.
- **Stale compile doctrine** — Removed the old skill guidance that treated `prose compile` as folded into `prose lint`.

### Removed

- **Outdated examples** — Removed the legacy numbered example set and the older `kind: program`-first examples from the distributable skill.

## [0.11.0] - 2026-05-01

### Added

- **Codex plugin envelope** — Added `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json` so OpenProse is discoverable through native Codex marketplace paths with first-class `interface` metadata. The manifest sits ready for OpenAI's self-serve plugin directory submission window.

### Changed

- **Current contract conventions** — Authored Prose files now use `*.prose.md` with `kind: service`, `kind: system`, `kind: test`, or `kind: pattern`; older plain `.md` contracts, `.prose` source files, `kind: program`, `kind: composite`, and `compose:` are legacy upgrade inputs.
- **Package/library migration** — Public docs now describe `packages/std/` and `packages/co/` as first-party libraries of service/system/test/pattern contracts rather than the older repo-local stdlib/composite model.
- **Upgrade workflow** — `prose upgrade` and `prose upgrade --dry-run` are the current self-healing migration commands. Historical `prose migrate`, `.deps/`, root `prose.lock`, and `.prose/runs/` references remain part of older entries and are superseded by this guidance.

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
