# Prose CLI

Shell wrapper for the `prose` command. It turns invocations like
`prose run inspector.md --harness codex-sdk` into canonical OpenProse
agent-session prompts, then sends the prompt to the selected harness.

The CLI does not replace the OpenProse VM or execute programs by itself. The
selected harness still runs the prompt, loads the OpenProse skill/specs, spawns
agents when available, and writes run state.

## Publication Status

This package is release prep. The npm package, GitHub release tarball used by
`install.sh`, and Homebrew tap formula are intended install paths, but these
docs do not assume any of them have been published yet. For now, use a local
checkout or a private release source.

## Requirements

- Node.js 18 or newer
- An authenticated harness: Codex CLI, Claude CLI, or the Codex SDK

## Install

From the repository root:

```bash
cd cli
npm ci
npm run build
npm link
prose --help
```

For project-local use before publication:

```bash
npm install --save-dev ../path/to/prose/cli
npx prose run inspector.md --harness codex-sdk
```

Future npm registry path:

```bash
npm install --global @openprose/prose-cli
prose --help
```

Future project-local npm path:

```bash
npm install --save-dev @openprose/prose-cli
npx prose run inspector.md --harness codex-sdk
```

Future GitHub release tarball path:

```bash
curl -fsSL https://raw.githubusercontent.com/openprose/prose/main/cli/install.sh | sh
```

The installer supports `PROSE_VERSION`, `PROSE_BASE_URL`, `PROSE_INSTALL_DIR`,
`PROSE_BIN_DIR`, and `PROSE_SHA256` overrides for pinned or private releases.

Future Homebrew path once a tap publishes the formula:

```bash
brew install <tap>/openprose-cli
```

Until a tap exists, generate the formula from release tarball metadata and copy
it into the tap:

```bash
npm run release:homebrew -- --version 0.1.0 --out-dir ./release
ruby homebrew/generate_formula.rb --version 0.1.0 --url <url> --sha256 <sha256>
```

## Harnesses

- `codex` runs `codex exec <prompt>` and uses the Codex CLI auth on your `PATH`.
- `claude` runs `claude -p <prompt>` and uses the Claude CLI auth on your `PATH`.
- `codex-sdk` uses `@openai/codex-sdk`, forwards the current working directory
  and environment, and expects SDK-compatible OpenAI credentials such as
  `OPENAI_API_KEY`.
- `fake` echoes prompts for tests and local smoke checks.

Select a harness with `--harness <name>`, `PROSE_HARNESS`, or
`OPENPROSE_HARNESS`. The default is `codex`.

## Usage

The shell command mirrors the agent-session command language described in the
root docs:

```bash
prose run programs/reviewer.md --harness codex
prose lint programs/reviewer.md
prose status --graph
```

## Development

- `npm run build` compiles `src/index.ts` into `dist/index.js`.
- `npm run typecheck` checks TypeScript without emitting files.
- `npm test` runs the Vitest suite once.
- `npm run dev` runs `src/index.ts` through `tsx` for local development.
- `npm run clean` removes `dist/`.
- `npm run release:tarball` creates the self-contained archive used by
  `install.sh`.
- `npm run release:homebrew` creates the source archive consumed by the
  Homebrew formula.
- `npm pack` runs `prepack`, so the package contains fresh `dist/` output for
  the packed `prose` bin.
