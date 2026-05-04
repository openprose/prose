---
name: discover-source
kind: service
---

# Discover Source

Find OpenProse source files and classify the small amount of metadata needed
for repository IR.

### Requires

- `source_root`: repository path to scan.

### Ensures

- `sources`: discovered source records with `path`, `kind`, and optional
  `name`.
- `diagnostics`: warnings for unreadable files, unknown structures, unknown
  kinds, or duplicate names.

### Strategies

- Discover `*.prose.md` files first.
- Read YAML frontmatter for `name` and `kind`.
- Recognize `responsibility`, `gateway`, `system`, `service`, `test`, and
  `pattern`.
- Mark unclear source as `unknown` and emit a diagnostic instead of guessing.
- Ignore generated output under `dist/`.
