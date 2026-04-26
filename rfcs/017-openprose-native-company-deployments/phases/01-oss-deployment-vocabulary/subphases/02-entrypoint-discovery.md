# 01.2 Entrypoint Discovery

## Build

- Add package-level discovery for deployable workflows.
- Prefer explicit manifest entries when present.
- Fall back to package analysis:
  - `kind: program`
  - declared `### Runtime` cadence/channel metadata
  - public examples listed in `prose.package.json`
  - effects and environment requirements
- Represent each discovered entrypoint with:
  - component name
  - source path
  - input/output ports
  - effects
  - environment variables
  - suggested trigger kind
  - enabled default: false

## Tests

- Golden test against `examples`.
- Golden test against `customers/prose-openprose`.
- Assert `company.prose.md`, `intelligence-daily`, `gtm-pipeline`, and
  `stargazer-daily` are discoverable.
- Assert discovery does not auto-enable schedules.
- Run `bun test`.

## Commit

Commit as `feat: discover deployable package entrypoints`.

## Signpost

Record the discovered reference-company entrypoints and unresolved questions.

