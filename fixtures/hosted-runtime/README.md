# Hosted Runtime Contract Fixtures

These fixtures are the OSS-to-hosted contract surface for OpenProse registry and
runtime clients.

They are generated from:

- `fixtures/package/catalog-demo`
- `fixtures/compiler/hello.prose.md`
- fixture provider output for run `hosted-contract-success`
- deterministic timestamp `2026-04-26T00:00:00.000Z`

The hosted platform may vendor or snapshot these files to verify that package
ingest, run records, artifact manifests, and remote execution envelopes stay
compatible with the open-source runtime.

Refresh intentionally. The `test/hosted-contract-fixtures.test.ts` test
regenerates the same records and fails when the public contract changes.
