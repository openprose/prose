# Compiler Prompt Fixtures

These fixtures exercise the pinned ProseScript compiler program, the
compile-phase IR emission, and the Forme topology world-model.

The compiler output convention is:

- `<openprose-root>/dist/manifest.next.json`: next generated compile-phase IR
- `<openprose-root>/dist/manifest.active.json`: active IR used by `prose serve`

The checked manifest stays intentionally small. Its exact schema is the
compile-phase IR defined in `skills/open-prose/compiler/ir-v0.md` and realized
in TypeScript by `CompilePhaseIR` in `packages/reactor/src/shapes/index.ts`. It
contains:

- `kind` (literal `openprose.compile-phase-ir`)
- `version` (integer `2`, tracking the SKILL `runtime_contract`)
- `sources`
- `topology` (`nodes`, `edges`, `entry_points`, `acyclic`)
- `canonicalizers`
- `postconditions`
- `contract_fingerprints`
- `diagnostics`

There is no judge, no verdict, no pressure, and no fulfillment activation. The
IR carries the compile-phase OUTPUTS: the topology world-model (Forme's wiring),
the per-node canonicalizers, the per-node postcondition validators, and the
frozen per-node contract fingerprints. Commit-gating is compiled postcondition
validators plus render self-attestation, never an LLM judging "did this change."

Source paths in IR are root-relative and ready to pass to `prose run` from
`<openprose-root>`.

There is no `system` kind and no `service` kind. Source `kind` values are
`responsibility`, `function`, `gateway`, `pattern`, `test`, or `unknown`. Only
`responsibility` and `gateway` sources become topology nodes; functions are
called helpers with no node identity and no world-model.

## Advisory Prompts

Use these prompts in an agent session with the OpenProse skill loaded.

### Compile Empty Source

Run `prose compile` against an empty temporary repository.

Expected shape:

- writes `<openprose-root>/dist/manifest.next.json`
- emits a valid compile-phase IR matching `expected/empty.manifest.next.json`
- reports no discovered sources as an informational diagnostic

### Compile Stargazer Fixture

Run `prose compile tests/open-prose/responsibility-runtime`.

Expected shape:

- discovers the responsibility and the gateway
- emits a compile-phase IR shaped like `expected/stargazer.manifest.next.json`
- mounts the gateway as an external-driven entry point and the responsibility
  as an input-driven node subscribing to it
- folds the former fulfillment-system services into `kind: function` helpers
  that the responsibility's render invokes via intra-node `call` — they are
  never topology nodes
- emits a per-node canonicalizer and postcondition validator
- freezes a per-node contract fingerprint
- does not invent provider-specific auth, subscription setup, queue names, or
  payload schemas

### Compile Multi-Facet Fixture

Run `prose compile tests/open-prose/compiler/fixtures/multi-facet`.

Expected shape:

- discovers a producer whose `### Maintains` declares three `####` parts —
  `#### funding`, `#### hiring`, `#### product-launches` — and a subscriber that
  `### Requires` only `funding`
- lowers each `####` part into a facet (facet name = heading text, paths = the
  part's material fields), default-material within the part, and binds the shared
  un-facetted `name` / `last_corroborated` to the atomic facet only (the
  named-parts rule, `architecture.md` §3.2)
- emits the producer canonicalizer with
  `facets: ["@atomic", "funding", "hiring", "product-launches"]`
- lowers the atomic-only subscriber `### Maintains` (no `####` parts) to
  `facets: ["@atomic"]` — the free default
- draws a facet-granular edge `funding-brief.Requires.funding ->
  competitor-monitor.Maintains.funding` carrying `facet: "funding"`, not
  `@atomic`
- emits a compile-phase IR shaped like `expected/multi-facet.manifest.next.json`

### Compile Ambiguous Wiring Fixture

Run `prose compile tests/open-prose/compiler/fixtures/ambiguous-fulfillment`.

Expected shape:

- discovers one subscriber responsibility and multiple plausible producers that
  all maintain the requested facet
- emits a compile-phase IR shaped like
  `expected/ambiguous-fulfillment.manifest.next.json`
- emits a warning and leaves the subscription unwired instead of guessing the
  producer
- emits no edge for the ambiguous subscription

### Compile Invalid Responsibility Fixture

Run `prose compile tests/open-prose/compiler/fixtures/invalid-responsibility`.

Expected shape:

- reports an error for the missing core `Maintains` section
- refuses to write `manifest.next.json` until deterministic validation passes

### Reject Invalid IR

Validate `invalid/missing-version.manifest.next.json`.

Expected shape:

- fails deterministic validation
- says the `version` field is missing or incorrect

Validate `invalid/malformed-responsibility.manifest.next.json`.

Expected shape:

- fails deterministic validation
- reports a malformed topology: an empty `contract_fingerprint`, an invalid
  `wake_source`, an edge to a missing producer, an entry point that is not an
  external node, an empty canonicalizer `facets` list, an invalid postcondition
  `mode`, and a `contract_fingerprints` map missing the declared node

Validate `invalid/malformed-forme.manifest.next.json`.

Expected shape:

- fails deterministic validation
- reports the wrong `kind`, a cyclic edge set whose `acyclic` flag lies, an
  entry point referencing a missing node, a canonicalizer for an undeclared
  node, a retired `system`/`service` source kind, and a retired judge-era
  `activations` field
