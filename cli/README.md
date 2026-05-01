# Prose CLI

Official shell entrypoint for OpenProse commands. The CLI turns invocations like
`prose run std/evals/inspector` into canonical OpenProse agent-session prompts,
then streams the selected harness output back to the terminal.

The CLI does not replace the OpenProse VM or execute services or systems by
itself. The selected harness still runs the prompt, loads the OpenProse
skill/specs, spawns agents when available, and writes run state.

## Requirements

- Node.js 18 or newer
- Credentials for the selected provider
- Codex SDK/OpenAI credentials for the default `codex-sdk` harness
- `npx`, used by the CLI to install the `open-prose` skill when needed

## Install

From npm:

```bash
npm install --global @openprose/prose-cli
prose --help
```

From the GitHub release tarball:

```bash
curl -fsSL https://raw.githubusercontent.com/openprose/prose/main/cli/install.sh | sh
```

From a repository checkout:

```bash
cd cli
npm ci
npm run build
npm link
prose --help
```

For project-local use:

```bash
npm install --save-dev ../path/to/prose/cli
npx prose run std/evals/inspector
```

The installer supports `PROSE_VERSION`, `PROSE_BASE_URL`, `PROSE_INSTALL_DIR`,
`PROSE_BIN_DIR`, `PROSE_SHA256`, and `PROSE_SHA256_URL` overrides for pinned or
private releases. By default it downloads and verifies the `.sha256` file next
to the release tarball.

Maintainers can find the release process in [RELEASE.md](RELEASE.md).

## Provider Selection

The CLI does not currently expose a separate `--provider` flag. Provider
selection is done with `--harness <name>` or `PROSE_HARNESS`, where each
harness names both a provider family and the runtime used to call it.

| Harness | Provider | Runtime | Requirements | Notes |
| --- | --- | --- | --- | --- |
| `codex-sdk` | OpenAI/Codex | `@openai/codex-sdk` | `OPENAI_API_KEY` or `CODEX_API_KEY` | Default. Best first choice for OpenAI-backed runs. |
| `codex` | OpenAI/Codex | `codex exec` | Codex CLI installed and authenticated, or `OPENAI_API_KEY`/`CODEX_API_KEY` | Uses the local Codex CLI process. |
| `claude-sdk` | Anthropic/Claude | `@anthropic-ai/claude-agent-sdk` | `ANTHROPIC_API_KEY` | Best first choice for Anthropic-backed runs. |
| `mock` | None | local echo harness | none | Test and smoke-check harness only. |

Examples:

```bash
prose run std/evals/inspector
prose run std/evals/inspector --harness codex-sdk
prose run co/systems/company-repo-checker --harness claude-sdk
PROSE_HARNESS=claude-sdk prose run std/evals/inspector
```

## Harness Details

- `codex-sdk` uses `@openai/codex-sdk`, forwards the current working directory
  and environment, and streams Codex SDK events. This is the default.
- `claude-sdk` uses `@anthropic-ai/claude-agent-sdk`, forwards the current
  working directory and environment, and streams text deltas.
- `codex` runs `codex exec <prompt>` and streams the Codex CLI process output.
- `mock` echoes prompts for tests and local smoke checks.

Select a harness with `--harness <name>` or `PROSE_HARNESS`.

OpenProse commands are allowed to run from non-git directories. For Codex
harnesses, the CLI sets Codex's git-repository check skip option while leaving
Codex sandbox and approval policy controls to Codex and the environment
settings below.

For externally sandboxed CI environments, Codex harnesses also honor
`PROSE_CODEX_SANDBOX_MODE` (`read-only`, `workspace-write`, or
`danger-full-access`) and `PROSE_CODEX_APPROVAL_POLICY` (`never`, `on-request`,
`on-failure`, or `untrusted`) and forward those values to Codex.

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
running a service or system:

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

The tarball installer is intentionally a Node.js installer: the CLI package is
JavaScript, so the installed shim executes Node.js 18 or newer. The script
verifies release checksums by default, rejects unsafe tar paths, symlinks,
hardlinks, and special files, and writes the final shim atomically.

## Usage

Forwarding commands mirror the agent-session command language described in the
root docs. `prose help` is local CLI help; use `prose --help` or
`prose help <command>` to inspect shell usage.

```bash
prose run systems/reviewer.prose.md
prose run co/systems/company-repo-checker --harness claude-sdk
prose upgrade
prose upgrade --dry-run
prose doctor
prose lint systems/reviewer.prose.md
prose preflight systems/reviewer.prose.md
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
