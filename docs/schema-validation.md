# Schema Validation

OpenProse typed ports are both a composition surface and a runtime backstop.
The package is intentionally honest about which type claims are enforced today
and which are semantic labels for registry, search, docs, and future schema
resolution.

## Enforced Today

OpenProse validates these shapes deterministically before accepting inputs or
outputs:

- `string`, `number`, `integer`, and `boolean`
- `Json<T>` syntax for every `T`
- primitive `Json<T>` values, such as `Json<number>` or `Json<boolean>`
- array containers such as `Thing[]`
- array primitive elements such as `integer[]`
- `run<T>` JSON references with a string `run_id`
- `run<T>` type tags when a submitted reference includes `type`
- materialized `run<T>` caller inputs against the referenced run record when
  the run exists in the local store
- required output presence in `openprose_submit_outputs`

Invalid caller inputs block the node before the Pi session runs. Invalid node
outputs fail the node run, persist artifact schema diagnostics, and keep the
run record inspectable.

## Semantic Today

These shapes are preserved in IR and package metadata, but are not fully
structurally enforced without a resolved schema definition:

- named object aliases such as `CompanyProfile`
- `Json<CompanyProfile>` object fields
- `Markdown<Brief>` document structure
- domain-specific invariants expressed in prose

For those cases OpenProse still records `schema_ref` values like
`#/$defs/CompanyProfile`, so package registries, docs, hosted validation, and
future schema resolvers can attach stronger contracts without changing the
source format.

## Why This Line

The goal is not to pretend prose refinements are already formal schemas. The
goal is to enforce cheap, deterministic failures immediately while preserving
the richer semantic contract that agents and registries need for composition.

That gives authors useful backpressure now:

- malformed JSON does not reach a node session
- numeric, boolean, array, and run-reference mistakes fail fast
- artifacts carry validation status and diagnostics
- registry metadata still exposes the richer type vocabulary

And it keeps the next step clear: schema definition resolution can strengthen
named `Json<T>` contracts without changing how authors write ports.
