---
role: compiler-index
summary: |
  Compiler program index for `prose compile`. Read this when lowering
  semantic OpenProse source into repository IR.
see-also:
  - ../responsibility-runtime.md: Runtime stack and compile/serve doctrine
  - index.prose.md: Bundled compiler program
  - passes/discover-source.prose.md: Source discovery pass
  - passes/compile-forme.prose.md: Forme wiring pass
  - passes/emit-ir.prose.md: IR emission pass
  - passes/validate-ir.prose.md: Deterministic validation pass
---

# Compiler

`prose compile` runs the bundled OpenProse compiler program at
`compiler/index.prose.md`.

The compiler is intelligent source lowering, not a second semantics layer.
Responsibility, Reactor, Forme, Contract Markdown, and Prose VM docs remain
authoritative. Compiler passes read those docs and produce repository IR for
the deterministic harness.

## Output

Default output lives under `dist/prose/`:

- `manifest.next.json`: next compiled IR produced by compile
- `manifest.active.json`: active compiled IR consumed by serve in later phases

Phase 2 emits only a minimal v0 shell with `kind`, `version`, `sources`, and
`diagnostics`. Keep it small enough to validate deterministically.
