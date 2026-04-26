# Superseded: Fixture Provider

This page is a historical stub. Phase 04.2 originally planned a deterministic
fixture provider for local development and tests.

The ideal package no longer exposes a fixture graph VM or `prose fixture
materialize`.

## Current Reading

Deterministic runs are still important, but they now flow through the same
runtime boundary as real execution:

- callers pass `--output port=value`
- OpenProse selects an internal scripted Pi node runner
- scripted Pi submits outputs through `openprose_submit_outputs`
- normal validation, run records, artifacts, attempts, and traces are written

Historical evidence remains in:

- `../../signposts/016-fixture-provider.md`
- `../../../014-company-example-backpressure/signposts/006-scripted-pi-tests.md`
- `../../../014-company-example-backpressure/signposts/031k-scripted-pi-deterministic-runtime.md`
