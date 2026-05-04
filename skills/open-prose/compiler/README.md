---
role: compiler-index
summary: |
  Compiler program index for `prose compile`. Read this when lowering
  semantic OpenProse source into repository IR.
see-also:
  - ../responsibility-runtime.md: Runtime stack and compile/serve doctrine
  - index.prose.md: Bundled compiler program
  - passes/discover-source.prose.md: Source discovery pass
  - passes/compile-responsibilities.prose.md: Responsibility lowering pass
  - passes/compile-gateways.prose.md: Gateway lowering pass
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

Default output lives under `dist/`:

- `manifest.next.json`: next compiled IR produced by compile
- `manifest.active.json`: active compiled IR consumed by serve in later phases

The current v0 manifest contains:

- `kind`
- `version`
- `sources`
- `responsibilities`
- `triggers`
- `activations`
- `formeManifests`
- `diagnostics`

The responsibility records stay semantic. Trigger records are concrete
serve-facing registrations. Activation records describe the bounded runs those
triggers wake.

Forme manifests are structured JSON wiring objects. They are the canonical
compiled runtime contract for systems; a host may render them for debugging,
but no separate Markdown run manifest is required as a VM input.
