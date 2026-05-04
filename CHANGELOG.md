# Changelog

All notable changes to OpenProse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Local runtime meta-harness** — `prose run` is the canonical local
  execution command. It plans reactive graphs, coordinates the Pi graph VM one
  node session at a time, and materializes durable run records, artifacts,
  traces, and eval acceptance through the shared run-store model.
- **Single-component handoff** — `prose handoff` exports one component contract
  for compatible one-off agent harnesses without treating those harnesses as
  reactive graph VMs.
- **Reactive run store and eval acceptance** — Runs, graph nodes, attempts,
  artifact records, policy labels, approvals, current/latest pointers, and
  executable eval results share one local store model.
- **Hosted registry/runtime contract fixtures** — Added vendorable
  hosted-ingest, remote-envelope, artifact-manifest, run-record, and plan
  fixtures under `fixtures/hosted-runtime/`.
- **Runtime confidence matrix** — Added `bun run confidence:runtime`, which
  smokes compile, plan, graph, run, eval, remote envelopes, package metadata,
  strict publish checks, install, status, and trace across the canonical package
  surfaces.
- **Explicit `skills:` declarations** — `.prose.md` files (and inline
  `## sub-service` blocks) can declare the agent skills they require, either
  as a `skills:` frontmatter list or a `### Skills` section. `prose preflight`
  resolves each declared name against the search path stack (`./skills/`,
  `~/.claude/skills/`, `~/.codex/skills/`), pins the canonical
  `namespace:name` into the IR, and fails closed with `skill_unresolved`
  when a declared skill is not installed. Bare leaf names (`pdf`) get a
  Levenshtein fuzzy match plus an info-severity nudge to pin the canonical
  name. The text formatter now renders a `Skills:` section showing each
  declared name and its resolution. OpenProse never installs or modifies the
  user's harness skills — BYO harness is the invariant. `--skill-search-path`
  on the CLI overrides the default search stack for tests and air-gapped
  environments.

### Changed

- **Package metadata is executable** — Package metadata includes package IR
  hashes, registry refs, runtime profile metadata, artifact contracts, quality
  status, hosted ingest metadata, examples, and eval links.
- **Std, co, and examples align with runtime semantics** — The canonical
  packages compile, run locally through scripted Pi deterministic outputs or
  live Pi runtime profiles, and pass strict publish checks.
- **CLI inspection is human-readable** — Help explains the runtime loop, graph
  output annotates planning context, and status/trace output includes acceptance
  reasons.

Deterministic `--output` values use the same graph-VM-shaped execution path as
local and remote runs, which keeps fixture tests aligned with the real runtime
contract.
