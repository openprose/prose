---
name: openprose-compiler
kind: system
---

# OpenProse Compiler

Compile semantic OpenProse source into repository IR that a deterministic
harness can validate and later serve.

### Requires

- `source_root`: repository path to compile; default to the current working
  directory or the path supplied to `prose compile`.
- `output_dir`: build output directory; default `dist/prose`.

### Ensures

- `manifest_next`: valid repository IR written to
  `output_dir/manifest.next.json`.
- `diagnostics`: concise compile diagnostics with enough source paths to fix
  ambiguity.

### Services

- `passes/discover-source.prose.md`
- `passes/compile-forme.prose.md`
- `passes/emit-ir.prose.md`
- `passes/validate-ir.prose.md`

### Strategies

- Treat Markdown source as authoritative intent and IR as disposable generated
  state.
- Infer responsibilities, trigger intent, and fulfillment only when the source
  graph makes the relationship clear.
- Do not invent connector routes, queue names, provider payloads, or secrets.
- Keep the v0 IR shell narrow: `kind`, `version`, `sources`, and
  `diagnostics`.
- Prefer warnings over silent assumptions when timing, fulfillment, or Forme
  wiring is ambiguous.

### Execution

1. Load `../responsibility-runtime.md`, `../contract-markdown.md`, and
   `../forme.md`.
2. Call `discover-source` for `source_root`.
3. Call `compile-forme` for discovered systems and services.
4. Call `emit-ir` with discovered source records and diagnostics.
5. Call `validate-ir` before reporting success.
6. Write only a valid manifest to `output_dir/manifest.next.json`.

Phase 2 stops at the minimal manifest shell. Later phases extend the manifest
with responsibilities, triggers, activations, and full runnable Forme
manifests.
