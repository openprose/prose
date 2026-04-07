---
description: Validate structure, schema, shapes, and contracts of an OpenProse program
argument-hint: <file.md>
---

Lint and validate the OpenProse program at: $ARGUMENTS

This command is sugar for `prose run std/ops/lint -- target: <file.md>`. It validates:

1. **Structure** — well-formed YAML frontmatter, correct `kind` declarations
2. **Schema** — contract sections (`requires`, `ensures`, `errors`, `invariants`, `strategies`, `environment`) are syntactically valid
3. **Shapes** — `shape` declarations (self, delegates, prohibited) are consistent with the services list
4. **Contracts** — `requires` ↔ `ensures` relationships are resolvable across the dependency graph

Reports errors and warnings with file paths and section names. Does NOT execute the program.

If no file is specified, look for `.md` program files in the current directory and ask which one to lint.
