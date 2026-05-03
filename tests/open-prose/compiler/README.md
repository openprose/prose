# Compiler Prompt Fixtures

These fixtures exercise the compiler skeleton, responsibility lowering, and
structured Forme manifest emission.

The compiler output convention is:

- `<openprose-root>/dist/manifest.next.json`: next generated OpenProse root IR
- `<openprose-root>/dist/manifest.active.json`: active IR used by `prose serve` later

The checked v0 manifest stays intentionally small. It contains:

- `kind`
- `version`
- `sources`
- `responsibilities`
- `triggers`
- `activations`
- `formeManifests`
- `diagnostics`

Trigger and activation records are semantic intent only. Later phases can add
concrete trigger registration, serve, and status records without changing the
source authoring model.

Forme manifests are compiled as structured JSON. They are the canonical runtime
wiring object for systems; no separate Markdown run manifest is required.

## Advisory Prompts

Use these prompts in an agent session with the OpenProse skill loaded.

### Compile Empty Source

Run `prose compile` against an empty temporary repository.

Expected shape:

- writes or proposes `<openprose-root>/dist/manifest.next.json`
- emits a valid v0 manifest matching `expected/empty.manifest.next.json`
- reports no discovered sources as an informational diagnostic

### Compile Stargazer Fixture

Run `prose compile tests/open-prose/responsibility-runtime`.

Expected shape:

- discovers the responsibility and local fulfillment system
- emits a v0 manifest shaped like `expected/stargazer.manifest.next.json`
- preserves the responsibility sections in semantic IR
- emits judge and fulfillment activation intent
- emits a structured Forme manifest for the fulfillment system
- links the fulfillment activation to the compiled Forme manifest
- does not invent webhook routes, queue names, or provider payloads
- leaves concrete trigger registration to later phases

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

Validate `invalid/malformed-forme.manifest.next.json`.

Expected shape:

- fails deterministic validation
- reports malformed Forme graph, execution order, environment, and activation
  references
