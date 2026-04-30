# Prose CLI

Official shell entrypoint for OpenProse commands. The CLI turns invocations like
`prose run inspector.md` into canonical OpenProse agent-session prompts, then
streams the selected harness output back to the terminal.

The CLI does not replace the OpenProse VM or execute programs by itself. The
selected harness still runs the prompt, loads the OpenProse skill/specs, spawns
agents when available, and writes run state.

## Publication Status

This package is release prep. The npm package and GitHub release tarball used by
`install.sh` are intended install paths, but these docs do not assume either has
been published yet. For now, use a local checkout or a private release source.

## Requirements

- Node.js 18 or newer
- Credentials for the selected provider
- Codex SDK/OpenAI credentials for the default `codex-sdk` harness
- `npx`, used by the CLI to install the `open-prose` skill when needed

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
npx prose run inspector.md
```

Future npm registry path:

```bash
npm install --global @openprose/prose-cli
prose --help
```

Future GitHub release tarball path:

```bash
curl -fsSL https://raw.githubusercontent.com/openprose/prose/main/cli/install.sh | sh
```

The installer supports `PROSE_VERSION`, `PROSE_BASE_URL`, `PROSE_INSTALL_DIR`,
`PROSE_BIN_DIR`, `PROSE_SHA256`, and `PROSE_SHA256_URL` overrides for pinned or
private releases. By default it downloads and verifies the `.sha256` file next
to the release tarball.

## Harnesses

- `codex-sdk` uses `@openai/codex-sdk`, forwards the current working directory
  and environment, and streams Codex SDK events. This is the default.
- `claude-sdk` uses `@anthropic-ai/claude-agent-sdk`, forwards the current
  working directory and environment, and streams text deltas.
- `codex` runs `codex exec <prompt>` and streams the Codex CLI process output.
- `claude` runs `claude -p <prompt>` and streams the Claude CLI process output.
- `mock` echoes prompts for tests and local smoke checks.

Select a harness with `--harness <name>`, `PROSE_HARNESS`, or
`OPENPROSE_HARNESS`.

## Skill Setup

OpenProse execution depends on the `open-prose` agent skill. Before running a
real harness, the CLI checks whether that skill is installed for the selected
provider and installs the missing global skill target with:

```bash
npx --yes skills@1.5.3 add openprose/prose --skill open-prose --global --yes --copy --full-depth --agent <agent>
```

Automatic setup only installs the provider you selected for that run, prints a
short status line on success, and only shows the full `skills` installer output
if setup fails. Use `prose doctor` to inspect local skill availability without
running a program:

```bash
prose doctor
prose doctor --harness claude-sdk --install
```

## Behavior

- stdout and stderr are streamed rather than buffered.
- child-process harnesses preserve child exit codes.
- SDK harnesses return `0` on successful final results, `1` on SDK turn errors,
  and `143` when aborted by the CLI.
- `SIGINT` and `SIGTERM` are propagated through the active harness.
- Arguments after `--` are forwarded literally, including `--harness`.

## Usage

The shell command mirrors the agent-session command language described in the
root docs:

```bash
prose run programs/reviewer.md
prose run programs/reviewer.md --harness claude-sdk
prose doctor
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
  `install.sh`, plus a matching `.sha256` file.
- `npm pack` runs `prepack`, so the package contains fresh `dist/` output for
  the packed `prose` bin.
