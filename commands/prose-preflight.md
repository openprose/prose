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
2. **Environment** — all `### Environment` variables declared across the program's dependency graph are set in the host environment
3. **Services** — all services referenced by the program graph can be resolved to `.prose.md` components

Reports missing dependencies, unset environment variables, and unresolvable
services. It does not execute the program or spend inference.

If no file is specified, look for `.prose.md` program files in the current directory and ask which one to check.
