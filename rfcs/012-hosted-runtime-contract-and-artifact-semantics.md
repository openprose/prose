# RFC 012: Hosted Runtime Contract And Artifact Semantics

**Status:** In implementation
**Date:** 2026-04-25

**Latest Implementation Note:**
[`031-package-metadata-v2-and-std-quality`](implementation-notes/031-package-metadata-v2-and-std-quality.md)

## Summary

OpenProse now has a local-first compiler, planner, materializer, package
metadata surface, and hosted platform implementation. The platform integration
proved the current model, but it also exposed a boundary that should belong to
the OSS package instead of each host:

- how a remote worker prepares a package and executes a component
- how execution results are emitted for a host to ingest
- which artifacts are runtime-owned versus user-owned
- how hosted registries consume generated package metadata
- which provenance fields every hosted run must preserve

This RFC adds an OSS-owned hosted runtime contract without moving hosted auth,
orgs, billing, scheduling, dashboards, or durable multi-tenant storage into the
open-source package.

## Motivation

The hosted platform currently hand-rolls a provider bootstrap: clone Prose,
install Bun, clone the package source, run the CLI, collect markers, and parse
artifacts. That works as a first integration, but it is too easy for each host
to drift from the canonical execution model.

The ideal OpenProse shape is:

1. authors write `.prose.md` packages
2. the OSS package defines the canonical compiler, IR, metadata, materializer,
   artifact, and remote-worker contract
3. hosted platforms provide orgs, registry storage, auth, approvals, policy,
   scheduling, object storage, observability, and runtime capacity

The host should adapt to Prose, not rediscover the Prose execution protocol.

## Goals

1. Define a host-neutral remote execution contract.
2. Define the result envelope a worker returns to a host.
3. Define artifact kinds, content semantics, parse behavior, and schema
   versions.
4. Define a registry metadata output contract that hosted registries can ingest
   without provider-specific assumptions.
5. Define the minimum provenance every hosted run should preserve.
6. Ratchet the standard library toward canonical hosted-package quality.

## Non-Goals

- hosted organization membership, RBAC, billing, or API key design
- production scheduler semantics
- hosted dashboard UX
- choosing a runtime provider such as Sprites, Anthropic Managed Agents,
  OpenCode, Codex CLI, or another harness
- making local materialization perform real side effects

## Proposed Contract Areas

### Remote Worker Contract

Add a stable command or generated script that remote providers can call without
knowing Prose internals.

Open naming to decide during implementation:

- `prose remote prepare`
- `prose remote execute`
- `prose runner bundle`
- `prose materialize --hosted-envelope`

The contract should accept:

- package source root or pre-materialized workspace path
- component ref
- run id
- trigger
- input bindings
- upstream run/materialization references
- approved effects
- expected output directory
- optional package metadata path

The contract should emit a single machine-readable result envelope plus an
artifact directory.

### Result Envelope

Every remote execution should emit a versioned JSON envelope containing:

- `schema_version`
- `run_id`
- `component_ref`
- `status`
- `trigger`
- `inputs`
- `outputs`
- `effect_declarations`
- `approved_effects`
- `artifact_manifest`
- `trace_path`
- `ir_path`
- `stdout_path`
- `stderr_path`
- `started_at`
- `finished_at`
- `exit_code`
- `error`, when failed

The envelope is the host ingestion contract. Hosts may store additional fields,
but they should not have to infer basic runtime state from stdout markers.

### Artifact Semantics

Artifacts should be versioned and typed. Suggested initial kinds:

- `runtime_ir`: canonical IR JSON emitted by Prose
- `runtime_trace`: execution trace JSON
- `runtime_plan`: optional plan JSON
- `runtime_manifest`: generated manifest projection
- `runtime_stdout`: captured stdout
- `runtime_stderr`: captured stderr
- `output_binding`: user-declared output
- `diagnostic`: host or runner diagnostic

Parse behavior should be explicit:

- runtime-owned JSON artifacts must parse or the run fails with a clear
  diagnostic
- user output bindings may declare `content_type`; if absent, the runner should
  preserve bytes/text and avoid guessing too much from the filename
- malformed user JSON should be either stored as text with a diagnostic warning
  or rejected by a declared output schema, not fail because of a host-side
  filename heuristic

### Registry Metadata Contract

The existing package metadata surface should be tightened into a hosted ingest
contract:

- package name, version, description, license, keywords
- Git source URL, source subpath, and pinned commit SHA
- generated component catalog
- schemas and port types
- effects and safety labels
- examples and eval fixtures
- package quality report
- registry visibility metadata as host-owned overlay, not source truth

Versions remain immutable once published.

### Provenance Contract

Hosted runs should record these provenance fields:

- package ref
- package version id or immutable metadata digest
- Git commit SHA and source subpath
- component ref
- caller kind: user, service account, scheduled trigger, graph continuation, API
  trigger, webhook, or other explicit source
- org/workspace identity as host-owned provenance
- runtime provider key
- approved effects and approval source, when any gate is lifted
- upstream runs and artifact references

The OSS package should define names and semantics for the portable fields. The
host remains responsible for tenant identity and authorization.

## Implementation Plan

### Phase 1: Contract Fixtures

Create golden fixtures for:

- a pure component
- a read-external component
- an approval-gated component with `human_gate` and `delivers`
- a component with JSON output binding
- a component with text output binding
- a failing component

Tests:

```bash
cd /Users/sl/code/openprose/platform/external/prose
bun test
bunx tsc --noEmit
```

Exit criteria:

- fixtures compile to IR
- metadata generation is deterministic
- expected remote envelope snapshots are checked in

### Phase 2: Remote Runner Command

Implement the minimal remote worker entrypoint and keep it provider-neutral.

Tests:

```bash
cd /Users/sl/code/openprose/platform/external/prose
bun test
bun bin/prose.ts remote execute examples/approval-gated-release.prose.md \
  --input release_candidate=v0.11.0 \
  --approved-effect human_gate \
  --approved-effect delivers \
  --out .openprose/remote-run-fixture
```

Exit criteria:

- command emits a versioned result envelope
- command emits an artifact manifest
- approved effects appear only when explicitly supplied
- unsafe effects are gated unless supplied through approved-effect inputs

Status: implemented for the provider-neutral fixture/materialization runner.
The landed command is:

```bash
prose remote execute <file.prose.md> \
  --out-dir .openprose/remote-runs \
  --run-id run_id \
  --input name=value \
  --output port=value \
  --approved-effect delivers
```

The command writes `result.json`, `artifact_manifest.json`, `run.json`,
`trace.json`, `ir.json`, `manifest.md`, runtime stdout/stderr artifacts, node
run records, and binding artifacts under the run directory. It prints the
result envelope to stdout and exits non-zero when the OpenProse run status is
not `succeeded`, while still preserving the envelope for host ingestion.

### Phase 3: Artifact Manifest And Parse Policy

Define artifact kinds and parsing rules in code and docs.

Tests:

```bash
cd /Users/sl/code/openprose/platform/external/prose
bun test -- artifact
```

Exit criteria:

- runtime-owned malformed JSON fails clearly
- user output malformed JSON follows declared content-type/schema behavior
- generated artifact manifests are stable

Status: initial artifact manifest and runtime-owned JSON parse policy landed
with Phase 2. User output JSON/schema rejection remains a metadata/schema
ratchet item for the next RFC 012 slice.

### Phase 4: Registry Metadata V2

Ratchet package metadata into a hosted ingest contract.

Tests:

```bash
cd /Users/sl/code/openprose/platform/external/prose
bun bin/prose.ts package packages/std --strict
bun bin/prose.ts publish-check packages/std --strict
```

Exit criteria:

- package metadata includes a schema version
- component catalog includes ports, effects, examples, and quality signals
- install/publish checks preserve pinned Git source identity

Status: implemented for the hosted-ingest package metadata contract.
`prose package` now emits `schema_version: openprose.package.v2`, a
deterministic `metadata_digest`, and a `hosted_ingest` projection containing the
package identity, source identity, component catalog, effects, ports, examples,
evals, and quality report.

### Phase 5: Standard Library Quality Ratchet

Improve `packages/std` until it is suitable as a canonical hosted registry
package.

Tests:

```bash
cd /Users/sl/code/openprose/platform/external/prose
bun bin/prose.ts measure packages/std
bun bin/prose.ts publish-check packages/std --strict
```

Exit criteria:

- strict publish readiness passes or has an explicit documented exception list
- effect declarations and typed ports improve monotonically
- examples demonstrate hosted-safe composition patterns

Status: implemented for the current standard library package. `packages/std`
now passes strict publish readiness with full typed-port coverage, full effect
declaration coverage, linked evals, linked examples, and no strict quality
warnings.

## Platform Backpressure

The platform should not permanently own provider-specific Prose bootstrapping.
Once this RFC lands, platform providers should invoke the OSS remote runner
contract and become thin adapters around:

- workspace/package fetch
- tenant and policy resolution
- runtime provider capacity
- object storage
- envelope/artifact ingestion
- run and graph state transitions

## Open Questions

1. Should the remote runner be a CLI command only, or should it also emit a
   single self-contained script for providers with minimal setup?
2. Should user output bindings default to text, binary, or declared content
   type when no schema is present?
3. Should registry metadata v2 be produced by `prose package`, `prose publish`,
   or a separate `prose registry manifest` command?
4. Should the hosted provenance contract live in RFC 005, RFC 011, or this RFC
   as the bridge between both?
