# Prose CLI

Official shell entrypoint for OpenProse commands. The CLI turns invocations like
`prose run std/evals/inspector` into canonical OpenProse agent-session prompts,
then streams the selected harness output back to the terminal. It also hosts
deterministic runtime commands such as `prose serve`.

The CLI does not replace the OpenProse VM or execute services or systems by
itself. For `prose run`, the selected harness still runs the prompt, loads the
OpenProse skill/specs, spawns agents when available, and writes run state.

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
curl -fsSL https://raw.githubusercontent.com/openprose/prose/main/tools/cli/install.sh | sh
```

From a repository checkout:

```bash
cd tools/cli
npm ci
npm run build
npm link
prose --help
```

For project-local use:

```bash
npm install --save-dev ../path/to/prose/tools/cli
npx prose run std/evals/inspector
```

The installer supports `PROSE_VERSION`, `PROSE_BASE_URL`, `PROSE_INSTALL_DIR`,
`PROSE_BIN_DIR`, `PROSE_SHA256`, and `PROSE_SHA256_URL` overrides for pinned or
private releases. By default it downloads and verifies the `.sha256` file next
to the release tarball.

Maintainers can find the release process in the repository root
[RELEASE.md](../../RELEASE.md) and the post-release playtest workflow in
[POST_RELEASE_PLAYTEST.md](POST_RELEASE_PLAYTEST.md).

## Provider Selection

The CLI does not currently expose a separate `--provider` flag. Provider
selection is done with `--harness <name>` or `PROSE_HARNESS`, where each
harness names both a provider family and the runtime used to call it.

| Harness | Provider | Runtime | Requirements | Notes |
| --- | --- | --- | --- | --- |
| `codex-sdk` | OpenAI/Codex | `@openai/codex-sdk` | `OPENAI_API_KEY` or `CODEX_API_KEY` | Default. Best first choice for OpenAI-backed runs. |
| `claude-sdk` | Anthropic/Claude | `@anthropic-ai/claude-agent-sdk` | `ANTHROPIC_API_KEY` | Best first choice for Anthropic-backed runs. |
| `cursor-sdk` _(experimental)_ | Cursor | `@cursor/sdk` (local mode) | `CURSOR_API_KEY` | Tier-2 / experimental. Default model `composer-2` is tuned for coding tasks, not OpenProse contract execution; multi-stage programs may run plan-only. Override with `CURSOR_MODEL`. |
| `mock` | None | local echo harness | none | Test and smoke-check harness only. |

Examples:

```bash
prose run std/evals/inspector
prose run std/evals/inspector --harness codex-sdk
prose run co/systems/company-repo-checker --harness claude-sdk
prose run std/ops/lint target:packages/std/evals/inspector.prose.md --harness cursor-sdk
PROSE_HARNESS=claude-sdk prose run std/evals/inspector
```

## Harness Details

- `codex-sdk` uses `@openai/codex-sdk`, forwards the current working directory
  and environment, and streams Codex SDK events. This is the default.
- `claude-sdk` uses `@anthropic-ai/claude-agent-sdk`, forwards the current
  working directory and environment, and streams text deltas.
- `cursor-sdk` _(experimental, Tier-2)_ uses `@cursor/sdk` in **local** mode,
  forwards the current working directory, and streams Cursor agent assistant
  text. It runs with `local.settingSources: ["project", "user"]` so Cursor
  auto-loads the OpenProse skill from `.cursor/skills/`, `.agents/skills/`,
  `~/.cursor/skills/`, or `~/.agents/skills/`. Authentication uses
  `CURSOR_API_KEY`; the local model defaults to `composer-2` and can be
  overridden with `CURSOR_MODEL`.

  **Caveat — not OpenProse-complete.** Cursor positions `composer-2` as a
  coding agent ("specifically tuned for complex tasks such as tool use,
  precise file edits, and terminal operations") rather than a general-purpose
  instruction-follower. In practice the harness reliably handles
  read-and-explain Prose programs (`std/ops/lint`, `std/evals/inspector`,
  `std/ops/status`, `std/ops/diagnose`) but may run plan-only on multi-stage
  execution programs (e.g. nested `worker-critic` × `stochastic-probe`) and
  does not pass the SKILL.md-compliance smoke test. For production Prose
  runs prefer `codex-sdk` or `claude-sdk`. The Cursor SDK exposes other
  models (`gpt-5.5`, `claude-4.6-sonnet-thinking`) — try
  `CURSOR_MODEL=claude-4.6-sonnet-thinking` if you need stricter
  instruction-following through your Cursor billing account; this is
  unverified.

  The harness emits a one-line stderr warning on each run; suppress with
  `PROSE_SUPPRESS_EXPERIMENTAL_WARNINGS=1`.
- `mock` echoes prompts for tests and local smoke checks.

Select a harness with `--harness <name>` or `PROSE_HARNESS`.

OpenProse commands are allowed to run from non-git directories. Codex SDK
harness runs leave Codex sandbox and approval policy controls to Codex and the
environment settings below.

For externally sandboxed CI environments, Codex harnesses also honor
`PROSE_CODEX_SANDBOX_MODE` (`read-only`, `workspace-write`, or
`danger-full-access`) and `PROSE_CODEX_APPROVAL_POLICY` (`never`, `on-request`,
`on-failure`, or `untrusted`) and forward those values to Codex.

The Cursor harness reads `CURSOR_API_KEY` for authentication and `CURSOR_MODEL`
(default `composer-2`) for the local model id. Set
`PROSE_SUPPRESS_EXPERIMENTAL_WARNINGS=1` to silence the per-run experimental
warning. Cursor Cloud, PR/repo automation, `Cursor.models.list()`, and
artifact downloads are not exposed by the CLI.

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
prose compile
prose compile src/responsibilities --out dist
cp dist/manifest.next.json dist/manifest.active.json
prose serve
prose run src/systems/reviewer.prose.md
prose run co/systems/company-repo-checker --harness claude-sdk
prose upgrade
prose upgrade --dry-run
prose doctor
prose lint src/systems/reviewer.prose.md
prose preflight src/systems/reviewer.prose.md
prose status
```

`prose compile` returns success only after the emitted `manifest.next.json`
passes deterministic IR validation with no error diagnostics. If an agent
harness reports a stray nonzero status after writing a valid manifest, the CLI
warns and accepts the validated artifact. Abort and signal exits are preserved.

`prose serve` loads and validates `dist/manifest.active.json` under the active
OpenProse root, registers local cron and HTTP trigger adapters, and launches
ordinary bounded `prose run` activations when those triggers fire. HTTP
adapters bind to `127.0.0.1:7331` by default; use `--host` and `--port` to
override that local listener. The listener always exposes
`/_openprose/health`, including cron-only manifests. Trigger routes respond
with `202 Accepted` after the event is accepted; judge and fulfillment
activations continue in the background and log failures to the serve process.
During shutdown, in-flight activations interrupted by the serve process signal
are reported as shutdown cancellations instead of trigger failures.

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
