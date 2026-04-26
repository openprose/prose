# Phase 04: OSS Reference Company Acceptance

Goal: make the reference company the main backpressure target for the OSS
deployment model.

This phase does not add broad new features. It sharpens the company package so
it can prove the deployment runtime.

## Sub-Phases

1. [`01-acceptance-ladder.md`](subphases/01-acceptance-ladder.md)
2. [`02-dry-run-adapters.md`](subphases/02-dry-run-adapters.md)
3. [`03-measurement.md`](subphases/03-measurement.md)

## Tests

- `bun run prose publish-check /Users/sl/code/openprose/customers/prose-openprose --strict`
- local deployment smoke
- `bun run measure:examples`
- `bun run confidence:runtime`

## Commit

Commit after every sub-phase. Customer repo changes, if needed, must be
committed in the customer repo branch separately.

## Signpost

Add a signpost after every sub-phase.
