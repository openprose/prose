# Working in `crates/openprose-lint`

This crate is the deterministic Rust linter, LSP, and WASM build for the
OpenProse language inside the `openprose/prose` repository.

## Source of truth

- **Spec:** the parent repository checkout, rooted at `../../`.
- **Skill/spec docs:** `../../skills/open-prose/`.
- **Registry mapping:** `specs/openprose.json` uses `source_path: "../.."`,
  `package_source_path: "spec-snapshot/openprose"`, and `pinned_commit: "HEAD"`
  so registry identity tracks the checked-out OpenProse commit during repo work
  and remains buildable as a packaged crate.
- **Conformance:** this crate owns the deterministic conformance cases under
  `specs/conformance/`.

Do not reintroduce `reference/openprose-prose` as a submodule while this crate is
colocated with the language source.

Do not hand-edit `spec-snapshot/openprose/`. It is a curated packaged spec
bundle copied from selected files under `../../skills/open-prose/`, not a mirror
of the full skill/examples tree. Edit the source docs, then run `bash
crates/openprose-lint/scripts/sync-spec-snapshot.sh --sync`.

## Invariant

No `openprose/prose` commit should promote or retain an official frontmatter
`kind:`, contract section, or source surface that the colocated linter rejects or
classifies as unsupported. Language changes and deterministic lint support land
together.

## Gates

Use the repository script from the `openprose/prose` root:

```bash
bash scripts/lint-prose.sh
```

For narrower Rust work:

```bash
cargo test -p openprose-lint
cargo clippy -p openprose-lint --all-targets --all-features -- -D warnings
bash crates/openprose-lint/scripts/sync-spec-snapshot.sh --check
```

The script is the policy surface. GitHub Actions, local development, and agents
should call the script rather than duplicating linter policy in workflow YAML.

## Doctrine

This crate proves deterministic, mechanistic properties: structure, vocabulary,
source identity, conformance fixtures, capability declarations, and adapter
manifest wiring. It does not prove that an arbitrary agent run is semantically
good. Keep that boundary clear in docs and diagnostics.
