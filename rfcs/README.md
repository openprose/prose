# OpenProse RFCs

This directory contains design records for OpenProse. RFC status matters: do
not implement superseded RFCs as written.

## Current Design Spine

The current architecture is defined by:

- RFC 005: Reactive Graph and Run Materialization
- RFC 006: Prose IR
- RFC 007: Typed Ports and Schemas
- RFC 008: Effects and Safety Policy
- RFC 009: Reactive Execution Semantics
- RFC 010: Source Format and Tooling
- RFC 011: Registry Metadata and Package Quality
- RFC 012: Hosted Runtime Contract and Artifact Semantics

Together these define the direction: canonical `.prose.md` source compiles to
IR, IR materializes into immutable runs, reactive graph nodes point at accepted
current runs, hosted registries ingest generated metadata, and hosted runtimes
use an OSS-owned runner/artifact contract rather than host-specific execution
protocols.

## Status Table

| RFC | Status | Notes |
| --- | --- | --- |
| 001: Scheduled Execution Syntax | Superseded as written | Scheduling remains important, but it is outside the current language/framework core. Hosted runtimes may schedule graph runs; the framework records schedule as caller provenance. Do not implement old `schedule:` frontmatter. |
| 002: Feedback Loop Syntax | Superseded as written | Feedback remains important, but is already handled as data: explicit bindings, upstream runs, memory artifacts, event-ingestion runs, or graph-node input updates. Do not implement implicit `feedback_history.md` loading. |
| 003: Formal Environment Declaration | Implemented and integrated | Canonical syntax is `### Environment`; values are runtime capabilities and never enter source, IR, traces, or artifacts. |
| 004: Composite Instantiation | Implemented and integrated | `kind: composite`, `compose:`, and `with:` are live concepts. RFC 006 adds IR/source-map preservation for expanded composites. |
| 005: Reactive Graph and Run Materialization | Draft/current | Universal run materialization and current/latest graph pointers. |
| 006: Prose IR | Draft/current | Structured compiler/runtime contract. Manifests are generated projections of IR, not a separate source of truth. |
| 007: Typed Ports and Schemas | Draft/current | Gradual types for ports, schemas, registry search, and validation. |
| 008: Effects and Safety Policy | Draft/current | Effect declarations, policy labels, and safe reactive recompute defaults. |
| 009: Reactive Execution Semantics | Draft/current | Invalidation, recompute planning, freshness, eval acceptance, and backpressure. |
| 010: Source Format and Tooling | Draft/current | `.prose.md`, syntax highlighting, formatter, linter, graph preview, and trace overlays. |
| 011: Registry Metadata and Package Quality | Draft/current | Git-native packages plus hosted catalog/search/quality metadata. |
| 012: Hosted Runtime Contract and Artifact Semantics | In implementation | Host-neutral remote runner contract, result envelope, artifact semantics, registry metadata ingest contract, provenance fields, and std quality ratchet. Runner/envelope/artifact manifest landed in note 030; metadata v2 and std strict readiness landed in note 031. |
