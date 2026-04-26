# Phase 08: Package UX, Registry Contract, Release Readiness

Goal: finish the OSS package as a coherent local product and a clean contract
for hosted registry/runtime integration.

## 08.1 Finalize Package Metadata And Registry Ref Semantics

Build:

- Update `prose.package.json` schema for executable runtime metadata.
- Include schemas, evals, provider requirements, examples, package IR hashes,
  quality status, and artifact contract fields.
- Keep registry refs host-neutral and compatible with hosted defaults,
  Git-backed providers, and local catalogs.

Tests:

- Add package metadata schema tests.
- Add install/publish-check tests for local and registry refs.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: finalize executable package metadata`.

Signpost:

- Add `signposts/038-package-metadata.md` with registry contract examples.

## 08.2 Make Remote Execution Wrap The Real Runtime Kernel

Build:

- Replace fixture-backed remote execution with the real compile/plan/run/store
  kernel.
- Emit hosted-compatible envelopes from store records.
- Preserve artifact manifest and provenance semantics from RFC 012.

Tests:

- Add remote envelope tests over fixture and provider-backed runs.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: emit remote envelopes from runtime store`.

Signpost:

- Add `signposts/039-remote-runtime-envelope.md` with hosted integration notes.

## 08.3 Reconcile Hosted Client Compatibility

Build:

- Verify the OSS metadata, run store, artifact manifest, and remote envelope
  can be consumed by the platform registry/runtime client without special
  hosted-only semantics.
- Add fixtures the platform can vendor or snapshot.

Tests:

- Run OSS tests.
- Run any platform contract fixture checks if available.
- Document platform follow-up if cross-repo tests are not yet automated.

Commit:

- Commit as `test: add hosted runtime contract fixtures`.

Signpost:

- Add `signposts/040-hosted-contract-fixtures.md` with platform handoff notes.

## 08.4 Polish CLI UX, Generated Docs, And Diagrams

Build:

- Make help text, errors, traces, status views, and graph views explain the
  runtime without becoming noisy.
- Generate docs or diagrams from package IR where useful.
- Ensure syntax highlighting and formatting cover new constructs.

Tests:

- Add CLI snapshot tests for help/error/status/trace output.
- Run formatter and syntax highlighting tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: polish OpenProse runtime CLI UX`.

Signpost:

- Add `signposts/041-cli-docs-diagrams.md` with generated output examples.

## 08.5 Run The Final Confidence Matrix

Build:

- Freeze the release checklist.
- Remove obsolete planning TODOs from active docs or convert them to follow-up
  issues.
- Prepare changelog and release notes for the OSS package.

Tests:

- Run the full test suite.
- Run typecheck.
- Run compile/plan/run/eval/package/install/publish-check/status/trace/graph
  smoke tests across examples, std, and co.
- Run Pi provider integration smoke if enabled.

Commit:

- Commit as `chore: prepare OpenProse runtime release candidate`.

Signpost:

- Add `signposts/042-release-candidate.md` with full command output summary,
  remaining risks, and platform follow-up.

## Phase Exit Criteria

- The OSS package is locally useful without hosted services.
- The hosted platform has a clean contract to ingest packages and execute runs.
- The runtime can be explained, tested, and released without relying on private
  platform assumptions.
