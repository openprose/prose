# 06.1 Schema Resolution

This slice starts moving port types from strings toward compiler-visible type
IR.

## Supported Type Syntax

- Primitive: `string`, `number`, `integer`, `boolean`, `Any`
- Named: `CompanyProfile`, `ExecutiveBrief`, `github.com/pkg.Type`
- Array: `ClaimCheck[]`
- Generic: `Markdown<Brief>`, `Json<Payload>`, `run<company-intake>`

Every parsed port now carries:

```ts
{
  type: "Markdown<ExecutiveBrief>",
  type_expr: {
    kind: "generic",
    name: "Markdown",
    args: [{ kind: "named", name: "ExecutiveBrief" }]
  }
}
```

## JSON Schema Projection

The schema module can project type expressions into hosted-compatible schema
shapes:

- primitives become JSON Schema primitive types
- named types become `$ref` projections
- arrays become `type: "array"`
- `Markdown<T>` becomes a markdown string with OpenProse metadata
- `Json<T>` projects the inner type
- `run<T>` becomes an object with a required `run_id` and OpenProse run metadata

## Semantic Hashing

Parsed type IR is now part of source and package semantic projections. This
changed package semantic hashes by design: type parsing is now a contract-level
compiler concern, not presentation-only metadata.

## Still To Do

- Load JSON Schema definitions from package resources into a symbol table.
- Resolve named types across dependency packages.
- Emit bundled `$defs` for package-level schema publishing.
