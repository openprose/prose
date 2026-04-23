# RFC 006: Prose IR

**Status:** Draft
**Date:** 2026-04-23
**Author:** OpenProse design session

## Summary

OpenProse needs a canonical structured intermediate representation. Contract
Markdown and ProseScript compile into Prose IR. Forme writes IR before
execution. Tooling, graph views, registry metadata, reactive invalidation, and
hosted runtimes read IR rather than reparsing human-facing Markdown.

Markdown remains the primary authoring format. IR is the machine and agent
contract.

## Goals

- Make the invisible graph visible.
- Preserve semantic decisions Forme makes during wiring.
- Give every inferred edge a confidence and source reason.
- Provide source maps for editor tooling and graph inspection.
- Give hosted and local runtimes one stable execution contract.
- Let agents validate their work against fixtures without reading all specs.

## IR Shape

The exact serialization can evolve, but the logical shape should be:

```yaml
ir_version: "0.1"
package:
  name: string
  source_ref: string
  source_sha: string
  dependencies: []
components:
  - id: string
    name: string
    kind: program | service | composite | test
    source:
      path: string
      span: { start_line: number, end_line: number }
    ports:
      requires: []
      ensures: []
    services: []
    schemas: []
    runtime: []
    environment: []
    execution: null | {}
    effects: []
    access: {}
    evals: []
    expansions: []
graph:
  nodes: []
  edges: []
diagnostics:
  errors: []
  warnings: []
  inferences: []
```

## Ports

Every `### Requires` and `### Ensures` item becomes a typed port entry:

```yaml
name: company_profile
direction: output
type: CompanyProfile
description: structured company profile with citations
required: true
policy_labels: []
source_span: { path: "...", start_line: 31, end_line: 44 }
```

Untyped ports are represented as `Any` until RFC 007 makes type requirements
stricter for published packages.

## Runtime and Dependency Inputs

IR must carry the non-source inputs needed for honest planning:

- package dependency pins resolved from `prose.lock` or equivalent package
  metadata
- runtime hints such as `freshness`, `persist`, or `model`

Dependency pins are part of IR because planners and hosted runtimes need them
without reparsing package files. They are **not** part of the semantic IR hash:
changing a lockfile should produce dependency-driven staleness, not a fake
source edit.

## Edges

Forme emits edges for all wiring:

```yaml
from:
  component: company-enrichment
  port: company_profile
to:
  component: lead-enrichment
  port: employer_profile
kind: exact | semantic | pinned | execution
confidence: 0.92
reason: "employer_profile requires the company profile for the person's employer"
source: auto | wiring | execution
```

Hard ambiguity remains an error. Soft ambiguity becomes an edge with warning,
confidence, and reason.

## Manifest Projection

IR is canonical. The execution manifest is a projection generated from IR for
human inspection, existing VM execution, and compatibility with current skill
docs.

Implementations should compile source to IR first, then derive any manifest
from that IR. The manifest must not contain semantic information that is absent
from IR. If a manifest and IR disagree, IR wins and the manifest is a stale
artifact.

This makes the current two-phase model stricter rather than deferred:

```text
source -> Forme -> IR -> manifest projection -> VM/local runner
                         -> graph preview
                         -> hosted runtime
                         -> registry metadata
```

## Execution Blocks

`### Execution` compiles into structured control flow inside the component IR:

- `call`
- `parallel`
- `loop`
- `condition`
- `try`
- `return`

The runtime may still use the ProseScript text for human review, but execution
planning should read the structured representation.

## Compatibility With Earlier RFCs

The IR is the convergence point for earlier source-level constructs:

- RFC 001 is superseded as written. Scheduling is outside the current language
  core. A scheduled invocation appears in run caller provenance, not component
  IR.
- RFC 002 is superseded as written. Feedback and feedback history enter the
  graph as ordinary input bindings, upstream run references, memory artifacts,
  or event-ingestion runs rather than implicit auto-loaded files.
- RFC 003 environment declarations compile into component `environment` with
  variable names and requirements, never secret values.
- RFC 004 composite instantiations compile into `expansions` plus expanded graph
  nodes. The runtime may execute the expanded nodes, but source maps and graph
  views must preserve the parent composite for traceability.

## Diagnostics

The compiler records all warnings and errors in IR:

- unresolved component
- missing port type
- semantic edge below confidence threshold
- undeclared effect
- access policy violation
- eval missing for published component

Diagnostics must be stable enough for CI and editor integrations.

## Source Maps

Every IR item that came from source should carry source location:

- component identity
- section
- port
- service reference
- effect declaration
- access declaration
- execution statement
- environment declaration
- composite expansion parent and generated child nodes

This is what makes graph nodes clickable in editors and run traces.

## Validation

### Static Checks

- All canonical fixtures compile to deterministic IR snapshots.
- Reformatting whitespace does not change semantic IR hashes.
- Changing a port name, port type, effect, service reference, or execution
  statement changes the semantic IR hash.
- Every edge has source, kind, confidence, and reason.
- Environment and composite declarations are represented in IR with source
  locations.
- Runtime settings and resolved dependency pins are represented in IR.

### Runtime Checks

- The VM can execute from IR without rereading source Markdown except for
  service prompt rendering.
- Manifest generation reads IR, not source, and fails if requested manifest
  fields are not represented in IR.
- Graph preview can render from IR alone.
- Run materialization records include the IR hash that was executed.

### Golden Fixtures

Create expected IR snapshots for:

- single service
- auto-wired multi-service program
- explicit wiring program
- execution-block program
- composite instantiation
- run-typed input program
- access/effect-declared program

### Agent Work Instructions

Implementation agents should update fixtures first. Any source grammar change
must come with an IR snapshot change and a short explanation of why the semantic
hash changed or stayed stable.

### Done Criteria

- `prose compile` or equivalent emits IR for canonical examples.
- Manifest output is generated from IR as a projection.
- `prose graph` reads IR, not Markdown.
- Local execution can read IR and create run records.
- Seeded ambiguous wiring appears as a diagnostic with source location.
