# OpenProse Plugin Release Process

The plugin track (the `open-prose` plugin shipped at `prose/.claude-plugin/` and `prose/.codex-plugin/`) is versioned and released independently from the CLI track (`tools/cli/RELEASE.md`).

## Release steps

1. **Decide on the next version** following [SemVer](https://semver.org). Patch for fixes, minor for additive changes, major for incompatible skill behavior.
2. **Update `CHANGELOG.md`**:
   - Move all bullets from `## [Unreleased]` into a new `## [X.Y.Z] - YYYY-MM-DD` section.
   - Leave the empty `## [Unreleased]` heading in place for future entries.
3. **Bump declared version files**:
   ```bash
   ./scripts/bump-version.sh X.Y.Z
   ./scripts/bump-version.sh --check       # confirms all declared files now agree
   ```
4. **Commit**: `chore: release vX.Y.Z`. The commit should contain only the CHANGELOG move and the bumped manifests.
5. **Tag and push**:
   ```bash
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```
6. **GitHub Release** is created automatically by `.github/workflows/release.yml` on `v*` tag push, with notes pulled from the matching `## [X.Y.Z]` block in `CHANGELOG.md`. The workflow only creates a plugin release when the tag version matches the plugin manifests; other `v*` tags, such as CLI release tags, are skipped.

## Critical: marketplace deduplication

The Claude Code marketplace deduplicates by `plugin.json:version`. Pushing a fix without bumping `version` leaves users stuck on cached old copies (see `thedotmack/claude-mem#1219`). **Every release MUST increment `version`.** The CI gate `./scripts/bump-version.sh --check` exists precisely to catch a forgotten bump on one of the two manifests.

## Marketplace submission

After a release is cut, the plugin can be published to the Claude Code marketplace and is staged for the Codex Plugin Directory once it opens publicly. Both submissions are manual.

### Pre-flight

- [ ] A `vX.Y.Z` tag exists on `main` and the matching GitHub Release is published.
- [ ] CI is green on `main`, including the `Plugin Manifest` workflow's `Plugin copy in sync`, `Plugin assets exist`, and `Codex interface has visual assets` gates.
- [ ] `./scripts/bump-version.sh --check` and `./scripts/sync-copy.sh --check` both exit 0 locally.
- [ ] `assets/plugin/logo.png` and `assets/plugin/composer-icon.png` open cleanly.

### Claude Code marketplace

Submit at https://platform.claude.com/plugins/submit (or https://claude.ai/settings/plugins/submit) with:

- **Repo URL**: `https://github.com/openprose/prose`
- **Plugin path**: leave blank — `.claude-plugin/` is auto-detected at the repo root.
- **Marketplace name**: `openprose`
- **Plugin name**: `open-prose`
- **Version**: the `vX.Y.Z` tag SHA. Anthropic pins by SHA in `claude-plugins-official/marketplace.json`.

Anthropic reviews the submission and pins the SHA. Status appears in the Claude.ai settings page tied to the submission.

Each subsequent release needs a fresh `version` bump in `.claude-plugin/plugin.json` — the marketplace deduplicates by `version` (see *Critical: marketplace deduplication* above).

### Codex Plugin Directory

The Codex Plugin Directory is curated; self-serve submission is "coming soon" per https://developers.openai.com/codex/plugins/build (as of May 2026).

The repo is already staged for the moment the directory opens publicly:

- `.codex-plugin/plugin.json` carries the full `interface` block (descriptions, `logo`, `composerIcon`, `brandColor`, `websiteURL`, default prompts).
- `.agents/plugins/marketplace.json` carries the structured `source`, `policy`, and `category` entry.
- `assets/plugin/logo.png` and `assets/plugin/composer-icon.png` are committed.

The expected pathway, per OpenAI's published docs:

1. Identity-verify on the OpenAI Platform Dashboard.
2. Submit the plugin for review via the Apps SDK.
3. On approval, OpenAI generates a directory entry from the submitted bundle.

### Install today from this repo

Codex supports git-URL marketplace sources, so the plugin can be installed directly from this repository before the directory opens:

```text
codex plugin marketplace add github.com/openprose/prose
codex plugin install open-prose
```

## Out of scope

- The CLI track. See `tools/cli/RELEASE.md` and `.github/workflows/cli-publish.yml` for the `@openprose/prose-cli` npm release flow.
- Automated submission. Both marketplaces accept submissions through their respective intake forms only.
