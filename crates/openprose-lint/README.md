# openprose-lint

Deterministic linter for [OpenProse](https://github.com/openprose/prose) programs — a Markdown-based language for multi-agent orchestration. A fast, compiled counterweight to the agent-native execution model: it checks the static, spec-driven parts of the language that should stay deterministic even when execution is delegated to an LLM.

## Quick start

```bash
cargo run -p openprose-lint -- lint path/to/program.md
```

Each file reports `ok` or its diagnostics, then a profile summary. Diagnostics
print as `file:line:col severity CODE message`:

```text
my-program.md:11:1 warning MDW011 Ensures clause uses hedging language (should/might/may); ensures are obligations, not suggestions

profile: compat
0 error(s), 1 warning(s) across 1 file(s)
```

Errors fail the run (exit 1); warnings do not. Build details are below; see
[Lint Rules](#lint-rules) and [Exit Codes](#exit-codes) for the code families.

## Build

From the `openprose/prose` repository root:

```bash
cargo build -p openprose-lint
```

The crate is prepared for future crates.io publishing. Until a crate release is
published, build from source. After `cargo build`, the binary is at
`${CARGO_TARGET_DIR:-target}/debug/openprose-lint`; the examples below write
`openprose-lint` as shorthand. To run a subcommand without installing it on your
`PATH`, prefer `cargo run -p openprose-lint -- <subcommand>` (e.g. `cargo run -p
openprose-lint -- lint path/to/program.md`).

Package readiness is checked from the repository root:

```bash
bash scripts/lint-prose.sh package
```

That review-branch profile allows a dirty worktree because it is only a dry-run.
Before a real crate release, run the clean release profile from the release
commit:

```bash
bash scripts/lint-prose.sh release-package
```

## Commands

```bash
# Lint current OpenProse programs (.md format)
openprose-lint lint path/to/program.md
openprose-lint lint path/to/programs/
openprose-lint lint --program-dir path/to/program-directory/

# Preflight briefing for VM agents (~100-200 token structured analysis, scales with program size)
openprose-lint briefing path/to/program.md

# Spec gap discovery (undocumented vocabulary in a corpus)
openprose-lint discover path/to/programs/

# Runtime capability requirements for a program or program directory
openprose-lint capabilities path/to/program.md
openprose-lint capabilities path/to/program-directory/

# Compare program requirements against a runtime declaration
openprose-lint capabilities --runtime-manifest specs/runtime-subjects/pi-no-extensions-self-declared.json path/to/program.md

# Validate a deterministic OpenProse adapter manifest
openprose-lint adapter validate specs/adapters/pi-v1-md.json

# Dogfood an adapter-initialized Claude Code run against a stable local program fixture
openprose-lint adapter dogfood specs/adapters/claude-code-v1-md.json \
  fixtures/adapter/parallel-reviews \
  --input-file code=tests/fixtures/get_user_records.py \
  --expect-binding synthesizer/report

# The proof report keeps separate wire/execute system-append artifacts so
# phase-specific adapter prompts stay auditable.

# Conformance: run the vendored conformance suite (specs/conformance/)
openprose-lint conformance

# List available spec sources
openprose-lint specs

# Verify a spec identity manifest against hashes, a git pin, and package provenance
openprose-lint specs verify --manifest path/to/spec-version.json \
  --root path/to/skill/open-prose \
  --git-repo path/to/prose-checkout \
  --expect-repo openprose/prose \
  --expect-commit <git-sha> \
  --package-json path/to/node_modules/@openprose/reactor/package.json
```

The public linting surface is intentionally small: `lint` for current Markdown programs and
`lint-legacy` for archived imperative programs. Version- or generation-suffixed command names are
not part of the public interface.

### Preflight Briefing

The `briefing` command outputs a versioned, structured markdown block designed to be read by a Prose-Complete VM agent before execution. It contains pre-parsed contract, service resolution, feature flags, and diagnostic summary — putting the agent in compiler headspace with deterministic structural analysis.

```
<!-- openprose-lint briefing v1 -->
## example-job-daily
kind: program | services: 4 | imports: 3

### contract
requires:
- company_name: the fleet operator to research
- gate_level: (optional, default "external") review level
ensures:
- brief, delivered, dashboard_updated
errors: (none)
environment:
- SLACK_WEBHOOK_URL
- SLACK_BOT_TOKEN
- REVIEW_CHANNEL

### services
example-discovery → inline
human-gate → use: std/delivery/human-gate
slack-notifier → use: std/delivery/slack-notifier
dashboard-builder → use: std/delivery/dashboard-builder

### features
environment: yes | use-imports: yes | run-inputs: no | execution-block: yes

### diagnostics
0 errors, 0 warnings
```

See `docs/specs/2026-04-08-preflight-briefing-design.md` for the full design spec.

### Design docs and guides

- `docs/README.md` — map of maintainer docs and retention rules
- `docs/specs/2026-04-08-preflight-briefing-design.md` — deterministic VM preflight schema
- `docs/specs/2026-04-15-runtime-conformance-model.md` — terminology, capability profiles, and certification model for OpenProse runtimes
- `docs/specs/2026-04-16-adapter-manifest-model.md` — deterministic coding-agent initialization model for OpenProse adapters
- `docs/adapting-and-self-verifying-a-runtime.md` — practical workflow for adapting a new CLI, dogfooding it in tmux, and externally verifying runtime support claims without overclaiming completeness
- `specs/conformance-capability-schema.json` — machine-readable capability vocabulary, profile definitions, and dependency graph (vocab v0.1.0)
- `specs/adapter-manifest-schema.json` — machine-readable adapter manifest schema for deterministic initialization
- `specs/runtime-subjects/` — example self-declared runtime capability manifests
- `specs/adapters/` — example deterministic adapter manifests for Pi, Codex CLI, and Claude Code

## Reference Spec

The linter is colocated with `openprose/prose`; the parent checkout is the spec
source during repository development:

- checkout root: `../..` from this crate
- package fallback: `spec-snapshot/openprose`
- VM spec: `../../skills/open-prose/prose.md`
- Forme spec: `../../skills/open-prose/forme.md`
- Deps spec: `../../skills/open-prose/deps.md`
- source identity: see `specs/openprose.json`

Build-time vocabulary extraction reads the compiler spec from the parent
checkout during normal development. Packaged Cargo builds use the vendored
snapshot under `spec-snapshot/openprose`, so the crate can build after
`cargo package` without reading files outside the package.

When `skills/open-prose/` changes, refresh or check the package snapshot:

```bash
bash crates/openprose-lint/scripts/sync-spec-snapshot.sh --sync
bash crates/openprose-lint/scripts/sync-spec-snapshot.sh --check
```

Do not edit `spec-snapshot/openprose/` directly. Treat it as generated package
input copied from `skills/open-prose/`; direct edits will either be overwritten
by `--sync` or rejected by the snapshot check.

### Spec Identity

`openprose-lint specs verify` checks a spec identity manifest without relying on
package version alone. The manifest records:

- the OpenProse spec id and source repo,
- the OpenProse skill version and `runtime_contract`,
- optional package provenance such as `@openprose/reactor` versions,
- SHA-256 digests for the load-bearing skill/spec files.

Package versions are labels; artifact hashes and the pinned git checkout are the
contract. Direct manifest mode works for package bundles, scratch checkouts, and
release candidates:

```bash
openprose-lint specs verify --manifest skills/open-prose/spec-version.json \
  --root skills/open-prose \
  --expect-repo openprose/prose \
  --package-json package.json
```

If a manifest declares package versions, pass matching `--package-json` paths for
each declared package. Otherwise verification fails rather than treating package
provenance as implicitly checked.

For git-pinned source checks, pass the checkout, expected repo, and expected
commit explicitly:

```bash
openprose-lint specs verify --manifest skills/open-prose/spec-version.json \
  --root skills/open-prose \
  --git-repo . \
  --expect-repo openprose/prose \
  --expect-commit "$(git rev-parse HEAD)"
```

`--spec` mode uses the registry repo and pin as the expected source identity.
When the registry entry declares `paths.version_manifest`, the verifier reads
that manifest. Otherwise it synthesizes a source-identity check from the
registry-declared load-bearing paths and verifies those artifact blobs against
the checked-out OpenProse commit. In a packaged crate, the same registry entry
falls back to the package snapshot and verifies live artifact digests there
without claiming git-blob proof. The fallback also emits a non-failing
`source_capabilities` section so source-layout changes show up as discovered
feature docs instead of as implicit parser assumptions:

```bash
openprose-lint specs verify --spec openprose
```

Use direct manifest mode for package bundles and release candidates that need to
verify package provenance such as `@openprose/reactor` versions.

The manifest may omit `source.commit` when it is committed inside the same git
tree; the external pin from `--expect-commit` or `specs/openprose.json` avoids a
self-referential commit hash. Packaged bundles may include `source.commit`
because the package is assembled after the source commit exists.

When `--git-repo` is supplied, `--root` must live inside that checkout. The
verifier also reads `SKILL.md` frontmatter and checks that its `version` and
`runtime_contract` match the manifest. Git-pinned checks compare each artifact
digest to the blob stored at the expected commit, so uncommitted worktree bytes
cannot masquerade as pinned source. Unknown future `runtime_contract` values
fail closed until this linter is updated, and artifact paths must resolve to
regular files without symlinked components under the declared root.

## Profiles

- `compat` (default): accepts current syntax plus known historical corpus patterns
- `strict`: also flags spec deviations that `compat` tolerates, such as missing frontmatter `version` fields. Warnings do not fail the run.

```bash
openprose-lint lint --profile strict path/to/program.md
```

### Legacy compatibility

OpenProse previously used an imperative `.prose` format. Most new users should ignore it, but archived programs can still be checked explicitly. Do not document or depend on private generation-suffixed aliases; use the public commands below.

```bash
openprose-lint lint-legacy path/to/file.prose
```

## Exit Codes

- `0`: no lint errors
- `1`: one or more lint errors
- `2`: CLI usage or filesystem error

Warnings do not fail the run.

## Lint Rules

Errors:

- `MDE001`–`MDE009`: structural (frontmatter delimiters)
- `MDE010`–`MDE019`: required frontmatter fields
- `MDE020`–`MDE029`: body structure
- `MDE030`–`MDE039`: component validation
- `MDE040`–`MDE049`: cross-validation (single-file)
- `MDE050`–`MDE059`: cross-validation (multi-file)

Warnings:

- `MDW001`–`MDW009`: frontmatter vocabulary
- `MDW010`–`MDW019`: contract quality
- `MDW020`–`MDW029`: component quality
- `MDW030`–`MDW039`: cross-validation warnings

## Architecture

The public `lint` command targets the current declarative Markdown language. A legacy path remains for archived imperative `.prose` programs:

- **Current Markdown linting**: parses `.md` programs, including heading classification, contract parsing (`## Contract` and bare labels), service resolution, and `use:` import awareness. This is exposed as `openprose-lint lint`.
- **Legacy compatibility linting**: parses archived `.prose` files. Vocabulary is extracted from the colocated compiler spec at build time via `build.rs` -> `spec_vocab.rs`, with fallback support for older compiler layouts. This is exposed as `openprose-lint lint-legacy`.
- **Briefing generation**: reuses the current Markdown parser to produce structured preflight analysis for VM agents.
- **`capabilities.rs`**: infers runtime capability requirements from a program, emits implied substrate dependencies, and can compare them against a runtime manifest.
- **`adapter.rs`**: validates deterministic adapter manifests that pin exact OpenProse files, channels, and phase attachments.
- **`adapter_dogfood.rs`**: turns the pinned Claude Code adapter into a repeatable live proof run by rendering the exact prompts/files, staging a temp program copy, validating the root VM's final JSON proof payloads, checking reported published outputs on disk, surfacing observed hook/tool-use evidence, and verifying the expected published binding is actually present and non-empty.

## Editor support

- **LSP:** `cargo build` also produces an `openprose-lsp` language-server binary for editor diagnostics (live lint + hover).
- **WASM:** the linter library compiles to WebAssembly (`cargo build --target wasm32-unknown-unknown --lib`); `src/wasm.rs` exports `lint`/`hover` for embedding in external editors and tools. It has no in-repo consumer, so treat it as a stable but lightly maintained integration surface.

## Development

Verification runs through the parent repository script, not through linter-owned
GitHub Actions policy:

```bash
bash scripts/lint-prose.sh
```

That gate runs formatting, clippy, tests, build, spec identity verification,
conformance, and an example-corpus lint smoke. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Project Home

This is an official OpenProse crate inside [github.com/openprose/prose](https://github.com/openprose/prose).

## License

MIT — see [LICENSE](LICENSE).
