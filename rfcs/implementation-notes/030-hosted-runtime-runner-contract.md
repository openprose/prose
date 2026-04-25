# Implementation Note 030: Hosted Runtime Runner Contract

**RFC:** 012 Hosted Runtime Contract And Artifact Semantics

**Date:** 2026-04-25

**Status:** implemented for the first OSS runner-contract slice

## Summary

OpenProse now owns a host-neutral remote runner entrypoint:

```bash
prose remote execute <file.prose.md> \
  --out-dir .openprose/remote-runs \
  --run-id run_id \
  --input name=value \
  --output port=value \
  --approved-effect delivers
```

The command wraps the existing local materializer and emits a versioned
`RemoteExecutionEnvelope` plus a versioned `RemoteArtifactManifest`. This gives
hosted runtimes a stable ingestion surface before platform-specific adapters
touch Sprites, Tigris, Postgres, or future managed-agent providers.

## Contract

The runner writes these files under the materialized run directory:

- `result.json`: full remote execution envelope
- `artifact_manifest.json`: artifact manifest with kind, content type, parse
  policy, hashes, binding identity, and policy labels
- `ir.json`: canonical IR artifact
- `trace.json`: trace artifact
- `manifest.md`: generated manifest projection
- `run.json`: canonical run record
- `nodes/*.run.json`: node run records for graph materializations
- `bindings/**`: caller input and output binding artifacts
- `stdout.txt` and `stderr.txt`: runtime stdout/stderr artifacts

The CLI also prints the result envelope to stdout. If the OpenProse run is
blocked or failed, the process exits non-zero after writing the envelope and
artifacts so a host can still ingest the failure.

## Parse Policy

Runtime-owned JSON artifacts use `must_parse_json`. Malformed runtime JSON
fails manifest generation with a clear error.

Output bindings use `declared_content`. If a declared JSON output is malformed,
the manifest preserves it as user output with a warning unless a future schema
ratchet rejects it.

## Tests

```bash
cd /Users/sl/code/openprose/platform/external/prose
bun test test/compiler.test.ts
bun test
bunx tsc --noEmit
bun bin/prose.ts remote execute examples/approval-gated-release.prose.md \
  --out-dir .openprose/remote-run-fixture \
  --run-id rfc012-approval-gated \
  --trigger human_gate \
  --input release_candidate=v0.11.0 \
  --output qa-check.qa_report="QA green." \
  --output release-note-writer.release_summary="Release summary." \
  --output announce-release.delivery_receipt="Delivered to releases." \
  --approved-effect human_gate \
  --approved-effect delivers
```

Observed result:

- focused compiler/runner tests: passed
- full OSS test suite: passed, 68 tests
- typecheck: passed
- approval-gated remote command: succeeded with 14 manifest artifacts

## Platform Backpressure

Workstream 03 should now adapt platform providers to invoke `prose remote
execute` instead of `prose materialize` directly. Platform ingestion should
prefer `result.json` and `artifact_manifest.json` over stdout summary markers
and filename heuristics.

Sprites remains a provider adapter. It should own workspace transport,
environment secrets, provider capacity, and process execution; it should not
own OpenProse run/envelope/artifact semantics.

## Next

- Ratchet package metadata toward the hosted ingest contract.
- Teach platform artifact ingestion to consume the OSS artifact manifest.
- Then adapt Sprites/local-safe providers to the remote envelope command.
