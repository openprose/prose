# OpenProse Release Process

OpenProse releases on **two independent tracks**, declared in
`.version-bump.json`:

- **`skill`** — the open-prose SKILL plus the Claude + Codex plugin manifests
  that deliver it (`skills/open-prose/SKILL.md`, `.claude-plugin/plugin.json`,
  `.codex-plugin/plugin.json`). These move **together**: the Claude Code
  marketplace deduplicates by manifest version, so a skill change only reaches
  plugin users when the manifest version advances. Machine compatibility is a
  separate signal — `SKILL.md`'s `runtime_contract` — not this `X.Y.Z`.
- **`cli`** — the `@openprose/prose-cli` npm package and its tarball installer
  (`tools/cli/package.json`, `tools/cli/install.sh`), published through the
  protected **OpenProse Release** GitHub Actions workflow.

The two tracks version and ship **independently** — a skill release does not
require a CLI bump, and vice versa. (The `@openprose/reactor*` packages are a
third, fully separate train under `reactor-v*` tags; see their own flow.)

Bump one track at a time and verify:

```bash
./scripts/bump-version.sh --track <skill|cli> X.Y.Z   # bump that track's files
./scripts/bump-version.sh --check                     # every track internally consistent
./scripts/bump-version.sh --list                      # print each track's version
```

`--check` passes as long as each track is internally consistent; the tracks may
(and usually do) sit at different versions.

## Prepare (cli track)

1. Choose the next SemVer version for the CLI.
2. Move relevant `CHANGELOG.md` notes into `## [X.Y.Z] - YYYY-MM-DD`.
3. Bump the `cli` track and run preflight:

   ```bash
   ./scripts/bump-version.sh --track cli X.Y.Z
   ./scripts/bump-version.sh --check
   ./scripts/sync-copy.sh --check
   ./scripts/release-preflight.sh --version X.Y.Z --npm-tag latest
   ```

   `release-preflight.sh` validates the **`cli`** track only; the `skill` track
   is checked for internal consistency but is not required to match the CLI
   version.

4. Open and merge a release-prep PR after CI passes.

## Dry Run

Run **OpenProse Release** from `main` with:

- `version`: `X.Y.Z`
- `npm_tag`: `latest` for stable releases, `next` for prereleases
- `dry_run`: `true`

The dry run performs the same preflight as publish, including tag, GitHub
Release, and npm version uniqueness checks. It then verifies the CLI package,
SKILL/plugin metadata, changelog notes, and release tarballs without publishing.

## Publish

Run the same **OpenProse Release** workflow again with `dry_run: false`.

The final job uses the protected `release` environment. After approval, it:

1. Creates a draft GitHub Release for `vX.Y.Z`.
2. Publishes `@openprose/prose-cli@X.Y.Z` to npm with provenance.
3. Publishes the GitHub Release with CLI tarballs, checksums, and changelog
   notes.

If npm publishing fails after the draft release is created, the workflow
attempts to delete the draft release and tag.

## Verify

After publishing:

```bash
npm view @openprose/prose-cli@latest version
gh release view vX.Y.Z --repo openprose/prose
```

Check both install paths in temporary directories:

```bash
tmpdir="$(mktemp -d)"
npm install --global --prefix "$tmpdir/npm-global" @openprose/prose-cli@X.Y.Z
"$tmpdir/npm-global/bin/prose" --version

tmpdir="$(mktemp -d)"
PROSE_INSTALL_DIR="$tmpdir/install" \
  PROSE_BIN_DIR="$tmpdir/bin" \
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/openprose/prose/main/tools/cli/install.sh)"
"$tmpdir/bin/prose" --version
```

For broader release validation, run the maintainer playtest in
[tools/cli/POST_RELEASE_PLAYTEST.md](tools/cli/POST_RELEASE_PLAYTEST.md).

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
