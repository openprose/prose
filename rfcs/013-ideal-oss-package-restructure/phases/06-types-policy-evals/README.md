# Phase 06: Types, Policy, Evals

Goal: make OpenProse outcomes trustworthy enough to compose by validating
types, enforcing policy records, and gating acceptance with evals.

## 06.1 Add Type Expression And Schema Resolution

Build:

- Parse primitive, named, array, `Markdown<T>`, `Json<T>`, and `run<T>` type
  expressions into type IR.
- Resolve schemas from package files, inline declarations, and dependencies.
- Emit JSON Schema or a hosted-compatible projection from the schema IR.

Tests:

- Add type parser fixtures.
- Add schema resolution tests across package dependencies.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: resolve OpenProse port schemas`.

Signpost:

- Add `signposts/027-schema-resolution.md` with supported syntax and schema
  projection decisions.

## 06.2 Validate Inputs, Outputs, And Artifacts

Build:

- Validate JSON-shaped inputs before provider execution where possible.
- Validate provider outputs and artifacts before acceptance.
- Record validation status and failures in run records.

Tests:

- Add valid/invalid input and output tests.
- Add artifact schema status tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: validate OpenProse runtime artifacts`.

Signpost:

- Add `signposts/028-artifact-validation.md` with rejection examples.

## 06.3 Validate `run<T>` Provenance

Build:

- Validate that `run<T>` references point to compatible upstream component,
  package, schema, and accepted/current status.
- Record provenance mismatches as blocking diagnostics.

Tests:

- Add valid and invalid run-reference tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: validate run reference provenance`.

Signpost:

- Add `signposts/029-run-provenance-validation.md` with provenance rules.

## 06.4 Implement The Local Policy Engine

Build:

- Propagate policy labels from inputs to outputs and runs.
- Enforce declassification records where labels are lowered.
- Model budgets, idempotency keys, and performed effects in local records.

Tests:

- Add label propagation and declassification tests.
- Add performed-effect tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: enforce local OpenProse policy records`.

Signpost:

- Add `signposts/030-policy-engine.md` with local-vs-hosted responsibility
  notes.

## 06.5 Make Evals Executable

Build:

- Discover evals from package metadata and component links.
- Run eval components against materialized runs using fixture and provider
  execution.
- Record eval run outputs and scores.

Tests:

- Add eval discovery and execution tests.
- Add fixture eval goldens.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: execute OpenProse evals over runs`.

Signpost:

- Add `signposts/031-executable-evals.md` with eval record examples.

## 06.6 Gate Current Pointer Updates On Required Evals

Build:

- Mark evals as required, advisory, skipped, or failed.
- Prevent current pointer updates when required evals fail.
- Report acceptance status in CLI output.

Tests:

- Add pass/fail/advisory eval acceptance tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: gate current runs on required evals`.

Signpost:

- Add `signposts/032-eval-acceptance.md` with acceptance matrix examples.

## Phase Exit Criteria

- Public ports can be schema-backed.
- Policy labels and effects affect runtime behavior.
- Required evals can prevent a new run from becoming current.
