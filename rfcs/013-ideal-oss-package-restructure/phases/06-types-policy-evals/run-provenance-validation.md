# Phase 06.3: `run<T>` Provenance Validation

## Goal

Make `run<T>` inputs trustworthy enough to compose across local runs. A caller
may pass a prior materialization into a new run, but the runtime must verify
that the reference points at a compatible accepted run before giving the
provider a chance to execute.

## Implemented Rules

- `run: <run_id>` shorthand resolves through the local store run index.
- JSON run references such as `{ "run_id": "..." }` are parsed as the same
  logical reference.
- Missing run records block before provider execution.
- Referenced runs must have `status: succeeded`.
- Referenced runs must have `acceptance.status: accepted`.
- `run<T>` validates that the referenced run's `component_ref` matches `T`.
- Package-qualified targets are supported as `run<package/component>` or
  `run<package#component>` and validate `component_version.package_ref` when a
  package qualifier is present.

## Explicit Non-Goals

- `run<T>[]` remains structural JSON validation only in this slice. Multiple
  provenance links need a richer binding record than the current single
  `source_run_id` field.
- Current-pointer validation is deferred until named current references exist.
  An explicit run id is valid if that exact materialization succeeded and was
  accepted.
- Hosted tenant, visibility, and RBAC provenance remain platform concerns; the
  OSS runtime records the local facts the hosted runtime can later project.

## Tests

- A valid prior `company-enrichment` run can be passed to a
  `run<company-enrichment>` input.
- A missing run id blocks before provider execution.
- A component mismatch blocks before provider execution.
- Existing artifact input/output validation continues to pass.

## Commit And Signpost

- Commit this slice as `feat: validate run reference provenance`.
- Add signpost `029-run-provenance-validation.md`.
- Push both the OSS branch and the parent platform gitlink.
