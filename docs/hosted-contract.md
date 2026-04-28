# Hosted Runtime Contract

The hosted platform uses the OpenProse runtime contract.

The OSS package owns the portable boundary:

- package hosted-ingest metadata
- remote execution envelopes
- artifact manifests
- run records
- graph plans
- distributed node execution request/result shapes

The hosted platform owns orgs, auth, storage, scheduling, approvals, billing,
workspace allocation, and operator UX.

## Golden Fixtures

The vendorable fixture directory is:

```text
fixtures/hosted-runtime/
```

It contains:

- `package-hosted-ingest.json`
- `remote-envelope.success.json`
- `artifact-manifest.success.json`
- `run-record.success.json`
- `plan.success.json`

These fixtures are regenerated and checked by:

```bash
bun test test/hosted-contract-fixtures.test.ts
```

The distributed node boundary is checked by:

```bash
bun test test/distributed-graph-runtime.test.ts
```

For the combined OSS canary:

```bash
bun run smoke:hosted-contract
```

## Platform Consumption

Platform tests consume these fixtures directly from
`external/prose/fixtures/hosted-runtime`. Package ingest, artifact storage, run
persistence, and remote envelope parsing stay aligned with the OSS package.

When the fixture contract intentionally changes:

1. Update the OSS runtime and fixtures together.
2. Run `bun run smoke:hosted-contract` in the OSS package.
3. Update platform tests that vendor the fixtures.
4. Refresh the generated OSS and platform evidence that guards the fixture.

## Drift Rule

If hosted execution requires a field that cannot be represented by these OSS
fixtures, first decide whether it is:

- a portable OpenProse runtime field, which belongs in the OSS contract; or
- hosted platform state, which belongs in platform models and must not leak
  into `.prose.md` source or the OSS runtime contract.
