# 02.1 Package Graph Planning API

## Build

- Add a package-level planning API:
  - input: `PackageIR`, entrypoint component, deployment inputs, current
    deployment state
  - output: execution plan over package graph nodes
- Keep single-file planning intact for isolated development.
- Support requested outputs against package entrypoints.

## Tests

- `gtm-pipeline` plan includes service nodes for lead enrichment, program
  design, human gate, and repo scaffolding.
- `intelligence-daily` plan includes mention and competitor intelligence
  service nodes.
- Required caller inputs and effect gates are reported at the right nodes.
- Run `bun test`.

## Commit

Commit as `feat: plan package entrypoint graphs`.

## Signpost

Record before/after graph evidence for `gtm-pipeline`.

