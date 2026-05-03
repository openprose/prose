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
- `output_dir`: build output directory; default `dist`.

### Ensures

- `manifest_next`: valid repository IR written to
  `output_dir/manifest.next.json`.
- `diagnostics`: concise compile diagnostics with enough source paths to fix
  ambiguity.

### Services

- `passes/discover-source.prose.md`
- `passes/compile-responsibilities.prose.md`
- `passes/compile-forme.prose.md`
- `passes/emit-ir.prose.md`
- `passes/validate-ir.prose.md`

### Strategies

- Treat Markdown source as authoritative intent and IR as disposable generated
  state.
- Infer responsibilities, trigger intent, and fulfillment only when the source
  graph makes the relationship clear.
- Do not invent connector routes, queue names, provider payloads, or secrets.
- Keep the v0 IR narrow: `kind`, `version`, `sources`, `responsibilities`,
  `triggers`, `activations`, `formeManifests`, and `diagnostics`.
- Prefer warnings over silent assumptions when timing, fulfillment, or Forme
  wiring is ambiguous.

### Execution

1. Load `../responsibility-runtime.md`, `../contract-markdown.md`, and
   `../forme.md`.
2. Call `discover-source` for `source_root`.
3. Call `compile-responsibilities` for discovered responsibilities.
4. Call `compile-forme` for discovered systems and services.
5. Call `emit-ir` with discovered source records, responsibility records,
   trigger intent, activation intent, Forme manifests, and diagnostics.
6. Call `validate-ir` before reporting success.
7. Write only a valid manifest to `output_dir/manifest.next.json`.

Phase 4 emits structured Forme manifest objects. The JSON objects are the
canonical compiled wiring contract; hosts may render them for inspection, but
bounded runs should not need a separate Markdown run manifest.
