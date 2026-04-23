# RFC 007: Typed Ports and Schemas

**Status:** Draft
**Date:** 2026-04-23
**Author:** OpenProse design session

## Summary

OpenProse should introduce gradual typed ports. A port still has a prose
contract, but it may also name a machine-readable type or schema:

```markdown
### Requires

- `company`: CompanyProfile - normalized company profile with citations
- `subject`: run<openprose-release> - prior release run to inspect

### Ensures

- `brief`: Markdown<ExecutiveBrief> - two-minute executive briefing
- `records`: StargazerRecord[] - enriched stargazer records
```

Types make components easier to compose, search, publish, serve, benchmark, and
validate. Prose refinements remain load-bearing.

## Principles

- Types are optional while authoring locally.
- Published packages should converge toward typed public ports.
- Types describe shape; prose describes semantic obligation.
- The type system is gradual. Missing type means `Any`.
- Forme still uses semantic judgment, but type compatibility becomes a strong
  signal and a validation surface.

## Port Item Syntax

Canonical syntax:

```markdown
- `name`: Type - semantic description
```

Examples:

```markdown
- `query`: string - company name, domain, or GitHub org
- `company_profile`: CompanyProfile - structured profile with sourced fields
- `inspection`: InspectionReport - run fidelity and task effectiveness report
- `subject`: run - completed run to inspect
- `cohort`: run[] - completed runs to compare
```

If the type is omitted:

```markdown
- `topic`: the question to investigate
```

Forme records `type: Any` and emits a publishing warning for package components.

## Schema Sources

Schemas may be defined in:

- `### Schemas` sections for small local schemas.
- `schemas/` directories for package-level schemas.
- Registry metadata for published package schemas.
- Standard built-ins such as `string`, `number`, `boolean`, `Markdown<T>`,
  `Json<T>`, `run`, and `run[]`.

The initial schema representation should align with JSON Schema where possible,
but OpenProse can keep prose refinements beside it.

## Compatibility Rules

Forme validates wiring by combining:

1. Exact type compatibility.
2. Structural compatibility.
3. Semantic compatibility from port descriptions.
4. Explicit wiring or execution pinning.

Type mismatch is an error when the mismatch is hard:

```text
CompanyProfile cannot satisfy PersonProfile.
```

Type absence is a warning for local programs and a publishing warning for
packages. Registry quality ranking should reward typed ports.

## Run Types

`run` and `run[]` remain first-class. They may be parameterized:

```markdown
- `subject`: run<company-enrichment> - completed company enrichment run
- `release_runs`: run<openprose-release>[] - release runs to compare
```

Parameterized run types help inspectors, regression trackers, and reactive
graphs validate provenance.

## Validation

### Static Checks

- Parser extracts name, type, cardinality, and description from port items.
- Unknown type names fail if no local, package, or registry schema resolves.
- Type-compatible ports wire without semantic warning when names differ.
- Type-incompatible ports produce errors unless explicit adapter component is
  inserted.
- Published package lint warns on public `Any` ports.

### Runtime Checks

- Service outputs can be checked against their declared schema when the schema
  is structural.
- `run<T>` inputs validate the upstream run's component identity.
- Outputs that fail schema validation produce contract-grade failures.

### Golden Fixtures

Create fixtures for:

- structural object schema
- array schema
- `Markdown<T>`
- `run<T>`
- missing type warning
- type mismatch failure
- adapter-mediated type conversion

### Agent Work Instructions

Agents implementing this RFC should start with parsing and IR representation,
then add schema resolution, then validation. Do not require every existing
example to be typed before the compiler works; instead, migrate canonical
examples as a final validation step.

### Done Criteria

- Typed port syntax compiles to IR.
- Basic schema validation works for JSON-shaped outputs.
- Forme uses type compatibility during wiring.
- Registry metadata can list component input and output types.

