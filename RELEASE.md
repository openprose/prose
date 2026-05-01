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

## Submission

- **Claude Code marketplace**: submit the repo URL at https://platform.claude.com/plugins/submit. Anthropic's team pins the SHA in `claude-plugins-official/marketplace.json`. Do this only after the first proper `vX.Y.Z` release tag is cut.
- **Codex plugin directory**: self-serve submission is "coming soon" per https://developers.openai.com/codex/plugins/build (April 2026). The `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json` manifests sit ready for the moment the window opens.

## What this process does NOT cover

- The CLI track. See `tools/cli/RELEASE.md` and `.github/workflows/cli-publish.yml` for the `@openprose/prose-cli` npm release flow.
- Marketplace publishing automation. Submission is a manual step against Anthropic's intake form.
