---
description: Execute an OpenProse program
argument-hint: <file.prose.md>
---

Execute the OpenProse program at: $ARGUMENTS

Use the repository CLI. Do not simulate the old OpenProse VM in chat.

Preferred command:

```bash
bun run prose run "$ARGUMENTS" --graph-vm pi
```

For deterministic local tests, pass declared outputs. OpenProse routes those
through an internal scripted Pi session:

```bash
bun run prose run "$ARGUMENTS" --graph-vm pi --output port=value
```

For live inference, set the `OPENPROSE_PI_*` runtime profile environment
variables before running.

If no file is specified, look for `.prose.md` files in the current directory and ask which one to run.
