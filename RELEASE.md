# OpenProse Release Process

This document covers the repository's scripted release tracks. Two other trains
exist and are out of scope here:

- The **`@openprose/reactor*`** packages release on their own `reactor-v*` tag
  train (see their flow).
- **`@openprose/prose-cli`** has been **removed from the repo**. The Reactor SDK
  + `reactor` CLI + replay devtools replaced it, so there is no `prose-cli`
  release train: its package, npm publish flow ("OpenProse Release" workflow,
  release preflight, and CLI release checks) are all gone.

The scripted tracks here are:

- **`skill`** — the open-prose SKILL plus the Claude + Codex plugin manifests
  that deliver it (`skills/open-prose/SKILL.md`,
  `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`). These move
  **together**: the Claude Code marketplace deduplicates by manifest version, so
  a skill change only reaches plugin users when the manifest version advances.
  Machine compatibility is a separate signal — `SKILL.md`'s
  `runtime_contract` — not this `X.Y.Z`.
- **`openprose-lint`** — the Rust crate under `crates/openprose-lint/`. It
  versions independently from the skill/plugin and reactor package trains.

```bash
./scripts/bump-version.sh --track skill X.Y.Z   # bump the skill track's files
./scripts/bump-version.sh --track openprose-lint X.Y.Z
./scripts/bump-version.sh --check               # the track is internally consistent
./scripts/bump-version.sh --list                # print the track's version
```

## Releasing the skill / plugin track

The skill ships from the repository (the `skills` CLI reads it directly) and
through the plugin marketplace (which reads the manifests). There is no npm
publish for this track, so its release is a version bump + tag + marketplace
resubmission — independent of any CLI release.

1. Land the skill changes on `main`, then bump the `skill` track:

   ```bash
   ./scripts/bump-version.sh --track skill X.Y.Z
   ./scripts/bump-version.sh --check
   ```

   Bump the **major** of `runtime_contract` in `SKILL.md` as well only when the
   skill's machine contract changes incompatibly (it is independent of `X.Y.Z`).

2. Add a `## [X.Y.Z]` section to `CHANGELOG.md` and the migration notes to
   `skills/open-prose/changelog.md` (the deferred upgrade brain consumed by
   `prose upgrade`).

3. Merge the PR. The `Plugin Manifest` workflow enforces `--check` and the
   manifest structure on every PR.

4. Tag and publish a GitHub Release for provenance (this tag triggers **no**
   workflow — it is a marker, kept distinct from the CLI's `v*` tags):

   ```bash
   git tag -a "skill-vX.Y.Z" -m "open-prose skill X.Y.Z"
   git push origin "skill-vX.Y.Z"
   gh release create "skill-vX.Y.Z" --title "open-prose skill X.Y.Z" \
     --notes-file <(./scripts/extract-changelog.sh X.Y.Z)
   ```

5. Resubmit the plugin to the marketplaces (manual — see below), referencing the
   `skill-vX.Y.Z` tag SHA. Until the manifest version advances in the
   marketplace, plugin users stay on the previous cached copy.

## Marketplace Submission

Marketplace publication remains manual after the GitHub Release exists.

Claude Code marketplace:

- Repo URL: `https://github.com/openprose/prose`
- Plugin path: leave blank; `.claude-plugin/` is auto-detected
- Marketplace name: `openprose`
- Plugin name: `open-prose`
- Version: the `skill-vX.Y.Z` tag SHA

Codex Plugin Directory submission is staged through `.codex-plugin/`,
`.agents/plugins/marketplace.json`, and `assets/plugin/` once the public
submission flow opens.

## Releasing the openprose-lint crate

The linter crate is part of this monorepo, but it has its own crate version.
The package must remain self-contained: `cargo publish --dry-run -p
openprose-lint` should succeed without reading files outside
`crates/openprose-lint/`.

1. Land the linter change on `main`, then bump the crate track:

   ```bash
   ./scripts/bump-version.sh --track openprose-lint X.Y.Z
   ./scripts/bump-version.sh --check --track openprose-lint
   ```

2. Add the release notes to the root `CHANGELOG.md`. Keep crate-specific notes
   in `crates/openprose-lint/CHANGELOG.md` when they are useful to crate users.

3. Verify the package before publishing:

   ```bash
   bash scripts/lint-prose.sh
   bash scripts/lint-prose.sh package
   bash scripts/lint-prose.sh release-package
   ```

   The package profile is a dry-run gate for review branches; it checks the spec
   snapshot, lists the packaged files, runs `cargo publish --dry-run
   --allow-dirty`, and verifies the packaged snapshot. The release-package
   profile is the same package proof for a clean release commit and omits
   `--allow-dirty`. Actual publication happens separately from a clean release
   commit.

4. After explicit maintainer approval, publish from the release commit without
   `--allow-dirty` and tag it as `openprose-lint-vX.Y.Z`.
