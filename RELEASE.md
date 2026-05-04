# OpenProse Release Process

OpenProse uses one release train. The SKILL/plugin metadata, CLI npm package,
package lock, and tarball installer all share the same `X.Y.Z` version and ship
through the protected **OpenProse Release** GitHub Actions workflow.

## Prepare

1. Choose the next SemVer version.
2. Move relevant `CHANGELOG.md` notes into `## [X.Y.Z] - YYYY-MM-DD`.
3. Bump every declared version surface:

   ```bash
   ./scripts/bump-version.sh X.Y.Z
   ./scripts/bump-version.sh --check
   ./scripts/sync-copy.sh --check
   ./scripts/release-preflight.sh --version X.Y.Z --npm-tag latest
   ```

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

## Marketplace Submission

Marketplace publication remains manual after the GitHub Release exists.

Claude Code marketplace:

- Repo URL: `https://github.com/openprose/prose`
- Plugin path: leave blank; `.claude-plugin/` is auto-detected
- Marketplace name: `openprose`
- Plugin name: `open-prose`
- Version: the `vX.Y.Z` tag SHA

Codex Plugin Directory submission is staged through `.codex-plugin/`,
`.agents/plugins/marketplace.json`, and `assets/plugin/` once the public
submission flow opens.
