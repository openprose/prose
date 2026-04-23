# RFC 005: Reactive Graph and Run Materialization

**Status:** Draft
**Date:** 2026-04-23
**Author:** OpenProse design session

## Summary

OpenProse should treat every execution as a `run`: an immutable
materialization of a component graph at a specific source version, input set,
dependency set, policy set, and runtime environment.

Reactive execution then becomes a runtime behavior over the compiled graph:
nodes point at their current valid `run`; when upstream data, source, schemas,
dependencies, policies, eval requirements, or freshness windows change, the
runtime invalidates affected nodes and plans recomputation subject to effects
and safety policy.

The source language remains contract-first. Authors write components and
contracts. Forme compiles those contracts into a graph. The runtime materializes
the graph into runs.

## Core Decisions

1. `run` becomes the universal materialization record, not only an explicit
   input type.
2. Reactive execution is runtime behavior over the IR, not a separate source
   syntax authors must use for ordinary programs.
3. Existing source should move directly to the new canonical model. There is no
   requirement to preserve old authoring compatibility beyond migration tools
   useful to the OpenProse tree itself.
4. Typed ports, effects, access policy, provenance, evals, registry metadata,
   and run traces are all part of the same framework surface.
5. Generic harnesses remain supported by spec. Hosted OpenProse is the
   reference runtime with stronger guarantees.

## Vocabulary

- **Component:** A program, service, composite, test, or future component kind
  with a contract.
- **Port:** A named input or output on a component, declared in `### Requires`
  or `### Ensures`.
- **Binding:** A concrete value or artifact exposed through a port.
- **Run:** Immutable record of executing a component or graph.
- **Reactive graph node:** Durable cell-like node that points at the current
  valid run for a component plus bound inputs.
- **Current pointer:** The node's pointer to the latest run considered valid
  under source, input, dependency, freshness, effect, and policy checks.
- **Latest pointer:** The node's pointer to the most recent materialized run,
  even if that run is blocked, failed, or not accepted for downstream use.
- **Acceptance:** The decision that a succeeded run is allowed to flow
  downstream under eval and policy requirements.
- **Provenance:** Metadata that records caller identity, source component,
  source run, input bindings, policy labels, and generated outputs.
- **Effect:** A declaration of what a component may touch or mutate outside
  pure computation.
- **Policy:** Runtime rules governing who may call a component, which data may
  flow into it, and when side effects may run.
- **Registry:** Searchable catalog of packages, components, versions, schemas,
  evals, examples, and quality signals. Git remains the source of package code.

## Model

```text
Source (.prose.md / .prose)
  -> Forme compiler
  -> Prose IR
  -> reactive graph
  -> run materializations
  -> current/latest pointers, traces, evals, registry metadata
```

A component is the formula. A graph node is the cell. A binding is the value. A
run is the immutable materialized calculation. A run-typed input is a reference
to a prior materialization with provenance preserved.

## Run Record

A run record must be able to answer:

- What component or graph was executed?
- Which exact source version was used?
- Which IR version was used?
- Which caller and principal authorized execution?
- Which inputs and upstream runs were consumed?
- Which dependency SHAs and package versions were used?
- Which environment variable names were required?
- Which runtime, harness, model, and worker executed it?
- Which effect and access policies applied?
- Which outputs were produced?
- Which evals were run and did the run become accepted?
- Which trace events occurred?

Minimum fields:

```yaml
run_id: string
kind: component | graph
component_ref: string
component_version:
  source_sha: string
  package_ref: string
  ir_hash: string
caller:
  principal_id: string
  tenant_id: string
  roles: string[]
  trigger: manual | api | schedule | webhook | graph_recompute | human_gate | test
runtime:
  harness: string
  worker_ref: string | null
  model: string | null
  environment_ref: string | null
inputs:
  - port: string
    value_hash: string
    source_run_id: string | null
    policy_labels: string[]
dependencies:
  - package: string
    sha: string
effects:
  declared: string[]
  performed: string[]
outputs:
  - port: string
    value_hash: string
    artifact_ref: string
    policy_labels: string[]
evals:
  - eval_ref: string
    required: boolean
    status: passed | failed | skipped | pending
acceptance:
  status: accepted | rejected | pending | not_required
  reason: string | null
trace_ref: string
status: pending | running | succeeded | failed | cancelled | blocked
created_at: string
completed_at: string | null
```

## Reactive Node

A reactive node is a durable runtime object:

```yaml
node_id: string
component_ref: string
bound_inputs:
  input_name: upstream_node | literal | run_ref
current_run_id: string | null
latest_run_id: string | null
stale_reasons: string[]
blocked_reasons: string[]
recompute_policy:
  mode: automatic | gated | manual
  freshness: string | null
```

`current_run_id` is the run allowed to flow downstream. `latest_run_id` is the
most recent materialization for observability and debugging. They may differ
when a run succeeds but required evals, policy checks, or approvals have not
accepted it.

Reactive nodes are not required for one-off local execution, but the IR and run
record must make them possible.

## Relationship to `run` Inputs

Existing run-typed inputs become a special case of a broader materialization
model. A component may still declare:

```markdown
### Requires

- `subject`: run - completed run to inspect
- `cohort`: run[] - completed runs to compare
```

The runtime resolves those to run records, validates status and staleness, and
records them as upstream provenance.

## Feedback and Memory Inputs

Feedback does not need a special source-level section in the current model.
Feedback is data:

- a caller input binding
- an upstream run reference
- a memory component output
- an event-ingestion run
- a graph-node input update

Persistent preferences, exceptions, and corrections should therefore be
materialized, typed, labeled, and traced like other inputs. Reactive invalidation
follows from the changed binding hash or upstream run pointer. Hosted products
may provide feedback UI and ingestion endpoints, but those endpoints create
ordinary runs and bindings.

## Follow-Up RFCs

- RFC 006: Prose IR
- RFC 007: Typed Ports and Schemas
- RFC 008: Effects and Safety Policy
- RFC 009: Reactive Execution Semantics
- RFC 010: Source Format and Tooling
- RFC 011: Registry Metadata and Package Quality

Hosted backend implementation details belong in internal platform build specs,
not in OSS RFCs.

## Non-Goals

- Define hosted database schemas.
- Define UI implementation details.
- Preserve every historical source spelling.
- Require all generic harnesses to implement the full hosted reactive runtime.

## Validation

### Static Checks

- Every component compiles to IR with stable component IDs, ports, effects, and
  source maps.
- Every executable component has a run materialization schema.
- Run-typed inputs are represented as upstream run references in the IR.
- Components missing effect declarations fail publishing lint once effects are
  required by RFC 008.

### Runtime Checks

- A single-service program creates a run record with source hash, inputs,
  outputs, runtime metadata, eval state, acceptance state, and trace.
- A multi-service program creates graph-level and node-level run records.
- A program consuming `run` and `run[]` inputs records upstream provenance.
- An interrupted run can be resumed or marked failed without losing provenance.
- A succeeded run with failed required evals updates `latest_run_id` but not
  `current_run_id`.

### Golden Fixtures

Create fixtures for:

- `hello.prose.md`: one pure service, no inputs.
- `pipeline.prose.md`: two pure services where output A feeds input B.
- `inspect-run.prose.md`: consumes a prior run as input.
- `side-effect.prose.md`: declares delivery effect and must not auto-recompute.

Each fixture should include expected IR JSON and expected run record JSON.

### Agent Work Instructions

An implementation agent should start with the smallest fixture, make the run
record pass exactly, then add graph and upstream-run cases. Do not begin hosted
backend work until the OSS run record shape is stable.

### Done Criteria

- The run record format is documented and emitted by local execution.
- Existing run-typed inputs are expressible as upstream materialization refs.
- Reactive graph nodes can be derived from IR plus run records.
- A seeded stale-source fixture marks the old run invalid without deleting it.
