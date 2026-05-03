# Compiler Prompt Fixtures

These fixtures exercise the compiler skeleton and Phase 3 responsibility
lowering.

The compiler output convention is:

- `dist/prose/manifest.next.json`: next generated repository IR
- `dist/prose/manifest.active.json`: active IR used by `prose serve` later

Phase 3 keeps the IR intentionally small. The checked v0 manifest contains:

- `kind`
- `version`
- `sources`
- `responsibilities`
- `triggers`
- `activations`
- `diagnostics`

Trigger and activation records are semantic intent only. Later phases can add
full runnable Forme manifests, concrete trigger registration, serve, and status
records without changing the source authoring model.

## Advisory Prompts

Use these prompts in an agent session with the OpenProse skill loaded.

### Compile Empty Source

Run `prose compile` against an empty temporary repository.

Expected shape:

- writes or proposes `dist/prose/manifest.next.json`
- emits a valid v0 manifest matching `expected/empty.manifest.next.json`
- reports no discovered sources as an informational diagnostic

### Compile Stargazer Fixture

Run `prose compile tests/open-prose/responsibility-runtime`.

Expected shape:

- discovers the responsibility and local fulfillment system
- emits a v0 manifest shaped like `expected/stargazer.manifest.next.json`
- preserves the responsibility sections in semantic IR
- emits judge and fulfillment activation intent
- does not invent webhook routes, queue names, or provider payloads
- leaves full Forme payloads and concrete trigger registration to later phases

### Compile Ambiguous Fulfillment Fixture

Run `prose compile tests/open-prose/compiler/fixtures/ambiguous-fulfillment`.

Expected shape:

- discovers one responsibility and multiple plausible systems
- emits a v0 manifest shaped like
  `expected/ambiguous-fulfillment.manifest.next.json`
- emits a warning instead of guessing the fulfillment target
- emits judge activation intent, but no fulfillment activation intent

### Compile Invalid Responsibility Fixture

Run `prose compile tests/open-prose/compiler/fixtures/invalid-responsibility`.

Expected shape:

- reports an error for the missing core `Criteria` section
- refuses to write `manifest.next.json` until deterministic validation passes

### Reject Invalid IR

Validate `invalid/missing-version.manifest.next.json`.

Expected shape:

- fails deterministic validation
- says the `version` field is missing or incorrect

Validate `invalid/malformed-responsibility.manifest.next.json`.

Expected shape:

- fails deterministic validation
- reports malformed responsibility, trigger, and activation records
