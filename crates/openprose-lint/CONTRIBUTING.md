# Contributing to openprose-lint

This is the deterministic linter, LSP, and WASM build for [OpenProse](https://github.com/openprose/prose). It checks the static, spec-driven parts of the language that should stay deterministic even when execution is delegated to an LLM.

## Prerequisites

- **Rust 1.96+** (`rust-version = "1.96"` in `Cargo.toml`).
- **OpenProse checkout.** This crate is colocated in `openprose/prose`, and
  `build.rs` reads `../../skills/open-prose/compiler/index.prose.md` at compile
  time to generate `spec_vocab.rs`. Packaged Cargo builds use the vendored
  curated spec bundle under `spec-snapshot/openprose`.
- **jq** for repository package profiles such as `bash scripts/lint-prose.sh
  package` and `bash scripts/lint-prose.sh release-package`.

## Build

```bash
cargo build -p openprose-lint
```

This produces two binaries under `${CARGO_TARGET_DIR:-target}/debug/`:

- `openprose-lint` (the default; the CLI)
- `openprose-lsp` (the language server)

The crate is configured for future crates.io publishing. Do not publish without
explicit maintainer approval. Use `bash scripts/lint-prose.sh package` for
review-branch package checks and `bash scripts/lint-prose.sh release-package`
for clean release-commit package checks.

## Running the linter

Run subcommands through `cargo run -p openprose-lint --` (or invoke the built
binary directly):

```bash
# Lint a current OpenProse program (.md) or a directory of programs
cargo run -p openprose-lint -- lint path/to/program.md
cargo run -p openprose-lint -- lint --profile strict path/to/program.md

# Preflight briefing for VM agents (structured analysis)
cargo run -p openprose-lint -- briefing path/to/program.md

# Lint legacy imperative .prose files
cargo run -p openprose-lint -- lint-legacy path/to/file.prose

# Spec gap discovery across a corpus
cargo run -p openprose-lint -- discover path/to/programs/

# Runtime capability requirements
cargo run -p openprose-lint -- capabilities path/to/program.md

# Validate a deterministic adapter manifest
cargo run -p openprose-lint -- adapter validate specs/adapters/pi-v1-md.json
```

See `README.md` for the full command list, profiles (`compat` default, `strict`), exit codes, and the lint-rule catalog. When adding examples, keep the public surface to `lint` for current Markdown programs and `lint-legacy` for archived imperative programs; do not reintroduce private generation-suffixed aliases.

## CI is local — run it before you push

The linter policy surface is the parent repository script, not GitHub Actions
YAML. Run it by hand before pushing:

```bash
bash scripts/lint-prose.sh
```

It runs, in order:

1. `cargo fmt --check`
2. `bash crates/openprose-lint/scripts/sync-spec-snapshot.sh --check`
3. `cargo clippy -p openprose-lint --all-targets --all-features -- -D warnings`
4. `cargo test -p openprose-lint`
5. `cargo build -p openprose-lint`
6. `cargo run -p openprose-lint -- specs`
7. `cargo run -p openprose-lint -- specs verify --spec openprose`
8. `cargo run -p openprose-lint -- conformance`
9. `cargo run -p openprose-lint -- lint --profile compat skills/open-prose/examples`

For release/package readiness, run:

```bash
bash scripts/lint-prose.sh package
bash scripts/lint-prose.sh release-package
```

The `package` profile allows a dirty review branch because it is only a dry-run.
The `release-package` profile requires a clean worktree and omits
`--allow-dirty`; run it from the release commit before any real publish.

For non-blocking drift discovery, run:

```bash
bash scripts/lint-prose.sh advisory
```

The advisory profile uses true-up only when `true-up` is on `PATH` or
`TRUE_UP_BIN` points to a true-up binary. It is optional maintainer tooling, not
a contributor prerequisite.

## Tests and conformance

```bash
# Unit and integration tests
cargo test -p openprose-lint

# Conformance suite (vendored manifest + cases under specs/conformance/)
cargo run -p openprose-lint -- conformance
```

The conformance suite is vendored at `specs/conformance/` (`manifest.json` plus the cases in `specs/conformance/cases/`). Both are part of the CI gate.

## Code style

- `cargo fmt` must leave nothing to reformat (`cargo fmt --check` is in the gate).
- `cargo clippy --all-targets --all-features -- -D warnings` must pass — warnings are errors.

Run both locally before pushing; the gate will reject anything that does not pass.

## Spec source architecture

`openprose/prose` is the sole source of truth for the language. Because this
crate is colocated, `specs/openprose.json` points at the parent checkout:

- VM spec: `../../skills/open-prose/prose.md`
- Forme (wiring): `../../skills/open-prose/forme.md`
- Deps: `../../skills/open-prose/deps.md`
- Package fallback: `spec-snapshot/openprose/skills/open-prose/`

Build-time vocabulary extraction reads the parent spec during `cargo build` and
regenerates `spec_vocab.rs`, so source changes can change lint behavior. The
package snapshot exists so `cargo package` and `cargo publish --dry-run` do not
depend on parent files after packaging. It is a curated spec bundle, not a copy
of the full examples tree. Re-run `bash
crates/openprose-lint/scripts/sync-spec-snapshot.sh --sync` when one of the
listed source files changes, then `bash scripts/lint-prose.sh`.

## Decisions and agent notes

- `AGENTS.md` records repo-specific guidance for AI agents working here, including the doctrine in `docs/doctrine.md`. Read it before making claims about what conformance does and does not prove.

## License

MIT. By contributing, you agree your contributions are licensed under the same terms (see `LICENSE`).
