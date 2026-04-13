# OpenProse for OpenClaw

Official OpenProse runtime plugin for OpenClaw. Runs `.md` and `.prose` programs using native OpenClaw session primitives.

## Install

```bash
openclaw plugins install /path/to/openclaw-plugin
```

Then restart the gateway:

```bash
openclaw gateway --force
```

If you have the bundled `open-prose` plugin enabled, disable it to avoid ambiguity:

```bash
openclaw plugins disable open-prose
```

## Usage

Send these as Telegram/Discord messages to your OpenClaw bot:

```
/prose help              — show available commands
/prose run <file>        — run a local .md or .prose program
/prose run <url>         — run a program from a URL
/prose run @owner/slug   — run a program from the registry
/prose examples          — list bundled example programs
/prose examples 01       — show a specific example
/prose status            — show runtime config
/prose compile <file>    — validate without executing (coming soon)
```

### Run a program

```
/prose run /path/to/my-program.md
```

The plugin:

1. Reads the program file
2. Creates a run directory at `.prose/runs/{id}/`
3. Spawns a subagent with the OpenProse VM spec as system prompt
4. The subagent executes the program, writing outputs to `workspace/` and `bindings/`
5. Returns the program output

### Example: hello world

```
/prose run /path/to/openclaw-plugin/tests/smoke/hello-world.md
```

## How it works

OpenProse programs describe services with `requires:`/`ensures:` contracts. The plugin builds a system prompt from the vendored OpenProse VM specification (`prose.md`, `state/filesystem.md`, `primitives/session.md`), spawns an OpenClaw subagent via `api.runtime.subagent.run()`, and the subagent reads the spec and becomes the VM.

No parser. No AST. The LLM reads the spec and executes it.

For single-service programs (like hello-world), the subagent executes directly. For multi-service programs, Forme wiring produces a manifest, then the VM executes each service as a child session.

## Run state

Each run creates:

```
.prose/runs/{YYYYMMDD}-{HHMMSS}-{random}/
├── program.md          — snapshot of the executed program
├── metadata.md         — run metadata (id, timestamps, status)
├── state.md            — append-only execution log
├── workspace/          — private working directories per service
├── bindings/           — declared outputs (copied from workspace)
├── services/           — component source files
└── agents/             — persistent agent memory
```

## Config

Plugin config in your OpenClaw settings:

```json
{
  "plugins": {
    "entries": {
      "openprose": {
        "enabled": true,
        "config": {
          "registryBaseUrl": "https://p.prose.md",
          "allowRemoteHttp": true,
          "allowLegacyV0": true,
          "defaultTimeoutMs": 300000,
          "maxParallelServices": 5
        }
      }
    }
  }
}
```

## Development

```bash
cd openclaw-plugin
bun install
bun run sync-assets    # vendor OpenProse spec from ../skills/open-prose/
bun run build          # compile TypeScript
bun test               # run unit tests
```

## License

Apache-2.0
