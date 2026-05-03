# Compiler Prompt Fixtures

These fixtures exercise the Phase 2 compiler skeleton.

The compiler output convention is:

- `dist/prose/manifest.next.json`: next generated repository IR
- `dist/prose/manifest.active.json`: active IR used by `prose serve` later

Phase 2 keeps the IR intentionally small. The checked v0 shell contains only:

- `kind`
- `version`
- `sources`
- `diagnostics`

Later phases can extend the manifest with responsibilities, triggers,
activations, and full runnable Forme manifests without changing the source
authoring model.

## Advisory Prompts

Use these prompts in an agent session with the OpenProse skill loaded.

### Compile Empty Source

Run `prose compile` against an empty temporary repository.

Expected shape:

- writes or proposes `dist/prose/manifest.next.json`
- emits a valid v0 shell matching `expected/empty.manifest.next.json`
- reports no discovered sources as an informational diagnostic

### Compile Stargazer Fixture

Run `prose compile tests/open-prose/responsibility-runtime`.

Expected shape:

- discovers the responsibility and local fulfillment system
- emits a v0 shell shaped like `expected/stargazer.manifest.next.json`
- does not invent webhook routes, queue names, or provider payloads
- leaves full responsibility, trigger, activation, and Forme payloads to later
  IR versions

### Reject Invalid IR

Validate `invalid/missing-version.manifest.next.json`.

Expected shape:

- fails deterministic validation
- says the `version` field is missing or incorrect
