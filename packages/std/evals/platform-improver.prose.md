---
name: platform-improver
kind: test
---

# Platform Improver

Diagnose whether an observed OpenProse failure belongs to the source contract,
compiler/IR, graph planner, meta-harness, node runner, run store, registry,
or hosted platform integration layer.

### Requires

- `inspection`: Json<RunInspection> - inspector output for the problematic run
- `symptom`: Markdown<Symptom> - description of what went wrong or should become simpler
- `platform_context`: Json<PlatformContext> - optional implementation context, logs, deployment metadata, or runtime-profile details

### Ensures

- `diagnosis`: Json<PlatformDiagnosis> - structured diagnosis containing:
  - passed: boolean
  - score: 0-1 confidence that the diagnosis is actionable
  - verdict: "pass", "partial", or "fail"
  - primary_layer: "source", "compiler_ir", "planner", "meta_harness", "node_runner", "run_store", "registry", or "hosted_platform"
  - confidence: 0-1 layer-attribution confidence
  - evidence: ordered evidence chain from symptom to layer
  - alternatives: plausible lower-confidence explanations
  - proposed_fix: targeted implementation or RFC change
  - side_effects: expected blast radius
  - verification: tests and smoke checks that prove the fix

### Effects

- `pure`: deterministic evaluation over declared inspection and context inputs

### Errors

- insufficient-evidence: inspection and platform context cannot support a layer attribution
- symptom-not-reproduced: available evidence does not show the described symptom

### Invariants

- the diagnosis names one primary owning layer
- fixes must reduce or preserve system complexity
- package-level RFC changes are recommended only when they improve OpenProse independent of one hosted implementation

### Execution

```prose
Start from the inspection evidence: run status, acceptance state, output refs,
artifact schema status, trace refs, node attempt records, eval records, and flags.
Then read `symptom` and `platform_context` for implementation-specific clues.

Attribute source issues to author contracts, typed ports, effects, examples, or
evals. Attribute compiler/IR issues to parsing, source normalization, dependency
inference, package IR, or diagnostics. Attribute planner and meta-harness issues
to graph invalidation, current-run pointers, dependency scheduling, run
sequencing, or node-session orchestration. Attribute node-runner issues to the
adapter that executes one graph node. Attribute store, registry, or hosted platform issues to durable
materialization, package versioning, access policy, organization scope, or cloud
deployment.

Return a single primary layer, alternatives, and a verification plan. When the
fix belongs in the open-source package, state the RFC or test that should be
created before implementation.
```
