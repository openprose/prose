---
description: Check dependencies and environment variables for an OpenProse program
argument-hint: <file.prose.md>
---

Run preflight checks on the OpenProse program at: $ARGUMENTS

Use:

```bash
bun run prose preflight "$ARGUMENTS"
```

It checks:

1. **Dependencies** — all `use` statements resolve to installed packages in `.deps/`; `prose.lock` is present and up to date
2. **Environment** — all `environment:` variables declared across the program's dependency graph are set in the host environment (shell env vars, platform secrets, `.env` files)
3. **Services** — all services referenced in the `services:` list can be resolved to `.md` files

Reports missing dependencies, unset environment variables, and unresolvable services. Does NOT execute the program.

If no file is specified, look for `.prose.md` program files in the current directory and ask which one to check.
