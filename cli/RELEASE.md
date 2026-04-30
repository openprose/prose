# Prose CLI Release Process

This document is for maintainers publishing `@openprose/prose-cli` and the
matching GitHub Release tarballs.

The CLI is released from `main` with the manual `CLI Publish` GitHub Actions
workflow. The workflow uses npm trusted publishing, so maintainers should not
create or store an npm automation token for routine releases.

## Before Releasing

1. Confirm the CLI checks are green on `main`.
2. Choose a new npm version. npm package versions are immutable, so never reuse
   a version that already exists on npm.
3. Open a small release-prep pull request that updates:
   - `cli/package.json`
   - `cli/package-lock.json`
   - `cli/install.sh` `DEFAULT_VERSION`
4. Merge the release-prep pull request after CI passes.

## Dry Run

Run the `CLI Publish` workflow manually from `main` with:

- `version`: the exact version in `cli/package.json`
- `npm_tag`: `latest` for stable releases, or `next` for prereleases
- `dry_run`: `true`

The dry run validates the package, runs tests, builds release tarballs, verifies
their checksums, and runs `npm publish --dry-run`. It does not create a tag,
GitHub Release, or npm publication.

## Publish

After the dry run passes, run the same `CLI Publish` workflow again from `main`
with:

- `version`: the exact version in `cli/package.json`
- `npm_tag`: the intended npm dist-tag
- `dry_run`: `false`

The publish job targets the protected `release` environment. A maintainer with
permission to approve that environment must approve the workflow before the
final publish job can proceed.

When approved, the workflow:

1. Verifies the package and release tarballs.
2. Creates a draft GitHub Release for `v<version>`.
3. Publishes `@openprose/prose-cli` to npm with provenance.
4. Publishes the GitHub Release with tarball assets and checksums.

If npm publishing fails after the draft GitHub Release is created, the workflow
attempts to delete the draft release and tag.

## Verification

After publishing, verify the public install paths:

```bash
npm view @openprose/prose-cli@latest version
tmpdir="$(mktemp -d)"
npm install --global --prefix "$tmpdir/npm-global" @openprose/prose-cli
"$tmpdir/npm-global/bin/prose" --version
```

For the tarball installer, use a temporary install location too:

```bash
tmpdir="$(mktemp -d)"
PROSE_INSTALL_DIR="$tmpdir/install" \
  PROSE_BIN_DIR="$tmpdir/bin" \
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/openprose/prose/main/cli/install.sh)"
"$tmpdir/bin/prose" --version
```

Check that the GitHub Release for `v<version>` exists and includes all expected
tarball and `.sha256` assets.
