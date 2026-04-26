# RFC 013: Ideal OSS Package Restructure

**Status:** Implemented as local runtime release candidate
**Date:** 2026-04-25
**Scope:** `openprose/prose` open-source package

## Summary

OpenProse should be the local, open, hackable framework for durable, typed,
reactive systems of agent-produced outcomes.

The current package has a strong compiler, graph preview, planner, package
metadata surface, local run materialization format, and hosted runner envelope.
Those pieces prove the design spine. They do not yet form the ideal package.

The ideal package should be reorganized around one core loop:

```text
source package
  -> canonical IR
  -> typed/effect/policy analysis
  -> deterministic graph plus accepted intelligent proposals
  -> reactive plan
  -> meta-harness execution through provider sessions
  -> validated artifacts
  -> durable run store
  -> eval acceptance and current/latest pointers
```

This RFC records the high-level restructuring required to reach that state. The
phase tree has now been implemented through the local runtime release
candidate. See:

- [`phases/`](phases/)
- [`signposts/042-runtime-release-candidate.md`](signposts/042-runtime-release-candidate.md)
- [`../../docs/release-candidate.md`](../../docs/release-candidate.md)
- [`../../docs/what-shipped.md`](../../docs/what-shipped.md)

## North Star

`openprose/prose` should let developers:

- declare agent components and graphs in `.prose.md`
- compile them into canonical IR
- run them locally through open or local harnesses
- materialize every execution as a `run`
- pass prior runs into later runs
- keep downstream outcomes current as inputs, source, dependencies, schemas,
  effects, and upstream runs change
- test and benchmark behavior through evals
- package, install, publish, and inspect reusable components

OpenProse should not become its own agent harness. It should coordinate
harnesses. A harness executes one component session; OpenProse is the
meta-harness that plans and coordinates many such sessions across a reactive
graph.

## Implementation Status

The RFC 013 implementation pass completed the initial ideal-package
restructure:

- `prose run` is the canonical execution entrypoint.
- Deterministic `--output` runs execute through the same scripted Pi-shaped
  runtime path as real graph execution.
- The meta-harness plans, gates, executes, validates, writes run records, and
  updates local status/trace surfaces.
- `prose eval` executes eval contracts over materialized runs and records
  acceptance.
- `remote execute` emits hosted-compatible envelope and artifact fixtures.
- `examples`, `packages/std`, and `packages/co` pass strict publish checks.
- `bun run confidence:runtime`, `bun run typecheck`, and `bun run test` form
  the current release-candidate backpressure set.

Remaining work should be treated as follow-up, not as unimplemented RFC 013
foundation:

- live Pi provider smoke once credentials/cost posture is acceptable
- future single-run harness adapters after they prove they can satisfy the
  node execution contract cleanly
- richer schema/policy engines beyond the release-candidate minimum
- platform Workstream 03 adaptation to the finalized OSS contracts

## Original Package Scan

### What Is Strong

The current implementation has several foundations worth keeping:

- `compile` emits a deterministic IR shape with components, ports, effects,
  services, access, execution text, graph edges, diagnostics, and semantic
  hashes.
- `plan` can compare source/input/dependency/effect/freshness changes against
  prior run records and produce a current/ready/blocked/skipped view.
- `materialize` emits RFC 005-style run records, node run records, bindings,
  traces, manifests, and local status/trace surfaces.
- `remote execute` emits a host-ingestible result envelope and artifact
  manifest.
- `package`, `publish-check`, `search`, and `install` make package identity,
  quality, registry refs, and lockfiles tangible.
- `fmt`, `lint`, `highlight`, `grammar`, `graph`, `preflight`, `status`, and
  `trace` provide a surprisingly coherent local toolchain.
- The examples and package metadata now model typed ports, effects, selective
  recompute, run-aware inputs, approval gates, and package quality.

These pieces should be treated as validated prototypes of the target shape, not
as final module boundaries.

### What Was Still Scaffolding In The Original Scan

This section is retained as the original pre-implementation scan. The current
status is summarized above; later RFC 014 slices replaced the fixture-provider
and direct-chat scaffolding with Pi-first runtime support.

The current implementation falls short of the North Star in specific ways:

- **No real local runner:** `materialize` requires fixture outputs. It does not
  invoke an agent harness, execute a component contract, or generate outputs.
- **No meta-harness:** the package can plan a graph, but it does not execute
  stale nodes in dependency order, pass outputs downstream, retry, resume, or
  maintain current/latest pointers.
- **No provider protocol:** Codex CLI, Claude Code, OpenCode, Pi, and fixture
  execution are not represented behind one local provider interface.
- **Execution is raw text:** `### Execution` is parsed as a string, not as
  structured control IR.
- **Wiring is shallow:** graph construction is mostly exact port-name matching.
  Intelligent wiring is mentioned in RFCs but not represented as proposal,
  acceptance, or durable decision state.
- **Types are names:** port types are strings. There is no schema resolution,
  structural compatibility, output validation, generated forms, or
  cross-package type registry.
- **Policy labels do not propagate:** `policy_labels` exist in types but are
  mostly empty. Access declarations are parsed but not meaningfully enforced by
  the OSS runtime.
- **Effects are only coarse gates:** pure/read-only/safe distinction exists,
  but there is no idempotency, budget, policy, performed-effect capture, or
  label inheritance.
- **Runs are files, not a store:** local runs live in directories, but there is
  no canonical local run index, current/latest graph node state, artifact store,
  or query API.
- **Evals are contracts, not executable tests:** eval components and links
  exist, but `prose eval` does not run them over materialized runs or gate
  acceptance.
- **Std is ahead of runtime:** `std/controls` and `std/composites` contain
  useful control patterns, but many are written as JavaScript-like `rlm(...)`
  sketches rather than executable OpenProse IR.
- **Remote envelope wraps fixtures:** RFC 012's envelope is useful, but it
  currently wraps fixture materialization rather than a real execution kernel.
- **Tests are broad but monolithic:** there is one large test file and few
  golden snapshots for IR, plans, run stores, provider execution, schema
  validation, or policy propagation.

Because nobody depends on the current OSS package, the right move is not to
tack these onto the existing structure. The right move is to restructure the
package around the ideal runtime model and migrate the existing validated
pieces into their proper homes.

## Required High-Level Changes

### 1. Recenter The CLI Around `prose run`

`prose run` should become the canonical local execution command.

Recommended shape:

- `prose compile`: source/package -> canonical IR
- `prose plan`: IR plus run store -> reactive plan
- `prose run`: plan plus graph VM -> materialized runs
- `prose eval`: eval contracts plus runs -> acceptance results
- `prose status` / `prose trace` / `prose graph`: views over the run store
- `prose package` / `prose publish-check` / `prose install`: package lifecycle

`materialize` should remain an internal library primitive, not the main runtime
surface.

### 2. Introduce Clear Package Architecture

The current flat `src/*.ts` layout should become explicit runtime architecture.

Target module families:

- `core`: shared types, diagnostics, spans, hashes, serialization
- `source`: Markdown/frontmatter parsing and formatting
- `ir`: canonical IR builders, normalizers, semantic hash projections
- `schema`: type parsing, schema loading, compatibility, validation
- `graph`: deterministic wiring, explicit wiring, graph normalization
- `meta`: intelligent meta-operation request/result records
- `store`: local run/artifact/graph-node store
- `runtime`: planner, executor, meta-harness, run lifecycle
- `providers`: Pi graph VM support and future single-run harness adapters that
  prove they can satisfy the node execution contract
- `policy`: effects, approvals, policy labels, declassification, idempotency
- `eval`: eval discovery, execution, scoring, acceptance
- `package`: package metadata, dependency resolution, registry refs, lockfiles
- `cli`: thin command layer over the library APIs

The public API should export stable library contracts from these boundaries
rather than exposing incidental implementation details.

### 3. Upgrade IR From Component Snapshot To Executable Package Contract

IR should become the canonical contract for execution, not only analysis.

Required changes:

- Compile a package or workspace as a first-class unit, not only one file at a
  time.
- Represent `### Execution` as structured control IR: `call`, `parallel`,
  `loop`, `condition`, `try`, `return`, and explicit bindings.
- Represent composite expansion in IR with parent/child source maps.
- Represent eval declarations, schema definitions, and examples directly.
- Preserve source maps for every executable and policy-relevant field.
- Separate source hash, semantic IR hash, dependency pins, policy hash, and
  runtime config hash so stale reasons are precise.

### 4. Build A Real Local Run Store

Runs should remain file-native and inspectable, but the package needs a real
local store abstraction.

Required capabilities:

- immutable run records
- artifact records with content type, hash, policy labels, schema status, and
  provenance
- graph node records with current/latest pointers
- accepted/current run selection
- upstream run references
- run indexes for status, trace, graph, search, and replay
- resumable or failed attempt records
- store migration/version metadata

The store should be simple enough for local development and close enough to the
hosted platform model that local and hosted behavior do not diverge.

### 5. Add Provider Protocols For Harness Sessions

OpenProse should integrate with harnesses rather than become one.

The provider protocol should define how a single component session receives:

- component IR
- rendered prompt/contract
- input bindings and upstream run artifacts
- workspace path
- environment names and injected values
- approved effects and policy labels
- expected outputs and validation rules

And how it returns:

- lifecycle status
- output artifacts
- performed effects
- logs/stdout/stderr
- provider-specific session references
- diagnostics
- cost/duration telemetry when available

Initial runtime support should include:

- `pi`: the default reactive graph VM and local meta-harness substrate
- scripted Pi sessions: deterministic internal test/local-output support
- future `codex-cli`, `claude-code`, or `opencode` single-run adapters only if
  they can satisfy the node execution contract without distorting the graph VM

The provider interface must be narrow enough that new harnesses can be added
without changing IR or run records.

### 6. Implement The Meta-Harness

The meta-harness is the core runtime OpenProse owns.

It should:

- compile and resolve the package
- read the local run store
- compute a reactive plan
- select nodes to run, reuse, skip, or block
- invoke provider sessions in dependency order
- pass upstream outputs and run references downstream
- enforce effect and policy gates before provider calls
- validate outputs and artifacts after provider calls
- write component run records and graph run records
- update current/latest pointers only after acceptance
- support retries, cancellation, failure records, and resume points

This is the key missing layer between "single harness session" and "reactive
agent application."

### 7. Treat Intelligent Meta-Operations As Proposed Decisions

OpenProse should support intelligent meta-operations without making runtime
behavior mystical.

High-value meta-operations:

- suggested wiring between differently named but compatible ports
- contract repair suggestions
- missing effect/type/eval/example suggestions
- component decomposition suggestions
- package search and component fit ranking
- failure diagnosis and retry suggestions
- eval generation

These should produce durable proposal records with:

- input context
- model/harness/provider used
- confidence
- rationale
- proposed IR patch or graph edge
- acceptance status
- accepted-by/caller provenance

The execution graph should be deterministic after proposals are accepted. Model
judgment proposes; accepted IR, lockfiles, policies, and run records dispose.

### 8. Make Types And Schemas Real

Typed ports should become more than registry metadata.

Required capabilities:

- parse type expressions into type IR (`Markdown<T>`, `Json<T>`, arrays,
  `run<T>`, primitives, named schemas)
- load package schemas from `schemas/`, inline sections, or registry metadata
- validate JSON-shaped inputs and outputs
- validate `run<T>` provenance against upstream component/package identity
- use types in deterministic wiring and publish checks
- expose schema metadata for generated local/hosted run forms
- record validation failures in run/eval acceptance

The system should remain gradual for authoring, but published packages should
converge toward full public-port typing.

### 9. Make Effects, Access, And Policy Labels Enforceable

Effects should drive runtime behavior, not just warnings.

Required capabilities:

- policy labels on inputs, outputs, artifacts, and runs
- label inheritance from inputs to outputs
- explicit declassification with authorization hooks
- effect-specific recompute defaults
- approved effect records with provenance
- idempotency key support for delivery and mutation effects
- metered budgets
- performed-effect reporting by providers
- local enforcement where possible and hosted-compatible policy decisions where
  tenant context is required

OSS local runtime can be permissive in dev mode, but it should still model the
same decisions and records the hosted platform enforces.

### 10. Make Evals Executable And Acceptance-Bearing

Evals should become executable OpenProse tests over runs and artifacts.

Required capabilities:

- discover evals from package metadata and component links
- run eval components against one or more materialized runs
- record eval run outputs
- distinguish required, advisory, skipped, and failed evals
- gate current pointer updates on required eval acceptance
- support deterministic fixture evals and harness-backed judgment evals
- report benchmark trends over time

This turns "quality" from metadata into a measured product surface.

### 11. Rebuild Std, Co, And Examples Around Executable Semantics

The standard library should match what the runtime can actually execute.

Required changes:

- Convert controls/composites from JavaScript-like `rlm(...)` sketches into
  executable OpenProse control IR or mark them as design patterns until the
  runtime supports them.
- Update evals to consume the new run store, artifact manifest, trace, and
  acceptance records instead of older run shapes such as `state.md`.
- Keep roles as reusable component contracts, but ensure they have schemas,
  evals, examples, and effect declarations.
- Keep `co` focused on generic company-as-code starter patterns, not
  OpenProse Inc. private logic.
- Ensure every canonical example can be compiled, planned, run locally through
  at least the fixture provider, and inspected through the run store.

The package should not advertise runtime affordances that do not execute.

### 12. Replace Monolithic Tests With Runtime Fixtures And Golden Suites

The current tests are valuable but need a structure that applies backpressure
to the ideal model.

Required test families:

- parser/source fixtures
- IR snapshot fixtures
- graph/wiring fixtures
- schema/type compatibility fixtures
- policy/effect fixtures
- run store fixtures
- provider contract fixtures
- meta-harness execution fixtures
- eval acceptance fixtures
- package/install/publish fixtures
- CLI smoke tests
- docs/examples/std/co quality gates

Every slice should include:

- unit tests for the module
- at least one golden fixture when behavior is part of the public contract
- CLI smoke coverage when a command changes
- signpost notes describing what changed, how to test it, and what comes next

## Relationship To Existing RFCs

RFC 005 through RFC 012 remain directionally correct. RFC 013 does not replace
their principles. It reframes the implementation around the ideal package
architecture.

Important clarifications:

- RFC 005's `run` model remains the universal materialization foundation.
- RFC 006's IR remains canonical, but it must become package-wide and
  execution-capable.
- RFC 007's typed ports must progress from strings to schema-backed validation.
- RFC 008's effects must progress from declarations to enforceable local policy
  records.
- RFC 009's reactive planner must gain a meta-harness executor and run-store
  current/latest pointers.
- RFC 010's tooling remains useful, but should read the new IR/store APIs.
- RFC 011's package metadata remains useful, but must include executable evals,
  schemas, runtime requirements, and hosted/local parity fields.
- RFC 012's hosted envelope remains useful, but should wrap the real execution
  kernel rather than direct fixture materialization.

Earlier superseded RFCs should stay marked superseded. Scheduling and feedback
remain outside the source-language core and should enter through caller
provenance, events, bindings, memory artifacts, or graph-node input updates.

## Non-Goals

- Build a new agent harness from scratch.
- Make hosted orgs, billing, RBAC, dashboards, or database schema part of the
  OSS package.
- Preserve compatibility with historical OpenProse source or CLI behavior.
- Make every intelligent meta-operation automatic.
- Require all providers to support every advanced runtime feature at once.

## Decisions Carried Into The Phase Plan

The recursive phase plan resolves the initial slicing questions this way:

1. The Pi SDK is the default OSS graph VM substrate because it is
   TypeScript-native and should fit the package without crossing language
   boundaries. OpenProse owns the graph semantics; Pi owns node-session
   execution.
2. Deterministic local output belongs behind internal scripted Pi sessions, not
   a public `fixture` runtime.
3. The local run store is a first-class phase, with immutable runs, artifacts,
   graph-node pointers, attempts, indexes, and migration metadata.
4. Type/schema work should bias toward a small OpenProse schema IR that can emit
   JSON Schema for interop rather than binding authoring semantics to one
   TypeScript schema library.
5. Intelligent wiring and repair should produce proposal records. Accepted
   proposals become deterministic runtime inputs; pending and rejected proposals
   remain outside source unless explicitly applied.
6. Std controls must either compile into executable control IR or be demoted to
   documented patterns until the runtime supports them.

Remaining open decisions should be resolved inside the relevant phase docs as
implementation reality appears, then signposted before the slice is committed.

## Initial Validation Plan

Before implementation begins, child docs should define validation for every
phase. At the top level, the ideal package is not considered reached until:

- `prose run examples/hello.prose.md` executes locally without fixture outputs
  when a real provider is configured.
- `prose run examples/company-intake.prose.md` executes a multi-node graph,
  writes node runs, and passes downstream outputs between harness sessions.
- Changing an upstream input causes minimal recompute and preserves old runs.
- Unsafe effects block until approved and record approval provenance.
- A `run<T>` input validates against upstream run provenance.
- A JSON-shaped output can be schema-validated and rejected on mismatch.
- A required eval can prevent a new run from becoming current.
- `packages/std`, `packages/co`, and `examples` pass strict package checks.
- `prose package`, `prose install`, `prose plan`, `prose graph`,
  `prose status`, and `prose trace` all read the same IR/store model.

## Required Signposting

Each future implementation slice should:

1. update or add the relevant child planning doc
2. implement the slice
3. run the documented checks
4. add a short implementation note describing what changed, how to test it, and
   what should happen next
5. commit with a clear message before moving to the next slice

The current RFC only sets the high-level restructure target. It should be
expanded recursively before large implementation begins.

## Implementation Plan

The recursive implementation plan now lives in
[`phases/README.md`](phases/README.md). That plan is the working map for
turning this RFC into the ideal OSS runtime.

Use it as the source of truth for:

- phase order
- sub-phase boundaries
- validation and backpressure checks
- commit expectations
- signpost expectations
- where to record implementation notes as the runtime evolves

Every implementation slice should end with a signpost in
[`signposts/`](signposts/) before the next slice begins.
