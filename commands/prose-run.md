---
description: Execute an OpenProse program
argument-hint: <file.prose.md>
---

Execute the OpenProse program at: $ARGUMENTS

Use the repository CLI. Do not hand-author runtime state in chat.

Preferred command:

```bash
bun run prose run "$ARGUMENTS" --graph-vm pi
```

For deterministic local tests, pass declared outputs. OpenProse routes those
through an internal scripted Pi session:

```bash
bun run prose run "$ARGUMENTS" --graph-vm pi --output port=value
```

For live inference, prefer explicit runtime profile flags when running
interactively:

```bash
bun run prose run "$ARGUMENTS" --graph-vm pi \
  --model-provider openrouter \
  --model google/gemini-3-flash-preview \
  --thinking low
```

The `OPENPROSE_PI_*` environment variables remain useful for CI and repeated
local defaults.

If no file is specified, look for `.prose.md` files in the current directory and ask which one to run.
