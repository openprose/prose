# Homebrew Publication Prep

The Homebrew artifacts live under `cli/homebrew/` and are intentionally not
published from this repository task. Homebrew is a future install path for the
CLI shell wrapper; do not imply a tap exists until a release copies the formula
into one.

## Approach

- Use a Homebrew release tarball that contains `package.json`,
  `package-lock.json`, `README.md`, `LICENSE`, and the transpiled `dist/`
  output. It does not need to include `node_modules`; the formula installs production
  dependencies into Homebrew's `libexec`.
- The formula depends on Homebrew's `node` formula and runs
  `npm install *std_npm_args`, which installs `@openai/codex-sdk` as the CLI's
  runtime npm dependency under `libexec`.
- When `package-lock.json` is present, the formula copies it to
  `npm-shrinkwrap.json` before `std_npm_args` runs. This keeps the runtime npm
  dependency tree pinned during packaging.
- The formula writes a `prose` wrapper that puts Homebrew's Node first in
  `PATH`, avoiding accidental use of a user-managed Node runtime.
- A plain npm registry tarball is also possible if the package publishes an
  `npm-shrinkwrap.json`. Without that, `@openai/codex-sdk` would resolve through
  the semver range in `package.json`.
- Do not use GitHub auto-generated source archives unless the tag includes
  current `dist/` output. `std_npm_args` packs with scripts ignored, so the
  release tarball should already contain build artifacts.

References:

- [Homebrew Node for Formula Authors](https://docs.brew.sh/Node-for-Formula-Authors)
- [Homebrew Formula Cookbook](https://docs.brew.sh/Formula-Cookbook)

## Files

- `cli/homebrew/Formula/openprose-cli.rb` is the placeholder formula path for a
  future tap.
- `cli/homebrew/generate_formula.rb` regenerates the formula at release time.
- The checked-in formula uses an all-zero SHA-256 placeholder so style checks can
  run before release. Replace it with the release tarball digest before
  publishing.

## Release-Time Steps

1. Create the Homebrew tarball and compute its SHA-256:

   ```sh
   cd cli
   npm ci
   npm test
   npm run build
   npm run release:homebrew -- --version <version> --out-dir ./release
   ```

2. Regenerate the formula with the real version, URL, and SHA:

   ```sh
   ruby cli/homebrew/generate_formula.rb \
     --version <version> \
     --url https://github.com/openprose/prose/releases/download/prose-cli-v<version>/openprose-prose-cli-<version>-homebrew.tgz \
     --sha256 <sha256>
   ```

   If the package later publishes an `npm-shrinkwrap.json`, an npm registry
   tarball URL can be used instead.

3. Validate locally before opening a tap PR:

   ```sh
   ruby -c cli/homebrew/Formula/openprose-cli.rb
   brew install --build-from-source ./cli/homebrew/Formula/openprose-cli.rb
   brew test openprose-cli
   brew uninstall openprose-cli
   ```

4. Copy `cli/homebrew/Formula/openprose-cli.rb` into the tap repository's
   `Formula/` directory, then open the tap PR. Do not publish or tap from this
   prep step.
