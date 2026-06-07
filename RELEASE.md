# OpenProse Release Process

This document covers the **SKILL / plugin** release. Two other trains exist and
are out of scope here:

- The **`@openprose/reactor*`** packages release on their own `reactor-v*` tag
  train (see their flow).
- **`@openprose/prose-cli`** is **deprecated** and no longer published. Its npm
  publish flow (the "OpenProse Release" workflow, the release preflight, and the
  CLI release checks) was removed; the package is marked deprecated on npm. Do
  not cut new `prose-cli` versions.

The single remaining track here is **`skill`** — the open-prose SKILL plus the
Claude + Codex plugin manifests that deliver it (`skills/open-prose/SKILL.md`,
`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`). These move
**together**: the Claude Code marketplace deduplicates by manifest version, so a
skill change only reaches plugin users when the manifest version advances.
Machine compatibility is a separate signal — `SKILL.md`'s `runtime_contract` —
not this `X.Y.Z`.

```bash
./scripts/bump-version.sh --track skill X.Y.Z   # bump the skill track's files
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
