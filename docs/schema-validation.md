# Schema Validation

OpenProse typed ports are both a composition surface and a runtime backstop.
Some type claims are enforced locally; others remain semantic labels for
registry, search, docs, and agent judgment.

## Enforced Today

OpenProse validates these shapes deterministically before accepting inputs or
outputs:

- `string`, `number`, `integer`, and `boolean`
- `Json<T>` syntax for every `T`
- primitive `Json<T>` values, such as `Json<number>` or `Json<boolean>`
- array containers such as `Thing[]`
- array primitive elements such as `integer[]`
- named `Json<T>` objects when `T` is provided by a package-local JSON Schema
  resource
- `run<T>` JSON references with a string `run_id`
- `run<T>` type tags when a submitted reference includes `type`
- materialized `run<T>` caller inputs against the referenced run record when
  the run exists in the local store
- required output presence in `openprose_submit_outputs`

Invalid caller inputs block the node before the Pi session runs. Invalid node
outputs fail the node run, persist artifact schema diagnostics, and keep the
run record inspectable.

## Package Schemas

Packages declare schema resources in `prose.package.json`:

```json
{
  "schemas": ["schemas/types.schema.json"]
}
```

OpenProse loads package-local schema resources for runtime validation. A
schema resource can define named contracts through `$defs`, `definitions`, a
top-level `title`, or a filename such as `LeadProfile.schema.json`.

The enforced subset is small and portable:

- `$ref` to package-local `#/$defs/Name` or `#/definitions/Name`
- `type` for `object`, `array`, `string`, `number`, `integer`, `boolean`, and
  `null`
- `required`, `properties`, and `additionalProperties: false`
- `items`
- `enum` and `const`

Unsupported schema features do not make OpenProse claim more certainty than it
has. They can still be useful to agents and hosted registries, but the local
runtime only enforces the subset above.

## Semantic Today

These shapes are preserved in IR and package metadata, but are not fully
structurally enforced without a package-local schema definition:

- named object aliases such as `CompanyProfile`
- `Markdown<Brief>` document structure
- domain-specific requirements expressed in prose

For those cases OpenProse still records `schema_ref` values like
`#/$defs/CompanyProfile` and emits an unchecked schema diagnostic when a named
`Json<T>` definition is unavailable.

## Boundary

The runtime enforces cheap, deterministic failures immediately while preserving
the richer semantic contract that agents and registries need for composition.

Authors get useful backpressure:

- malformed JSON does not reach a node session
- numeric, boolean, array, and run-reference mistakes fail fast
- package-local named schemas catch object-shape drift before artifacts are
  accepted
- artifacts carry validation status and diagnostics
- registry metadata still exposes the richer type vocabulary
