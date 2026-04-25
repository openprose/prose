# Provider Protocol

Phase 04.1 defines the TypeScript boundary between OpenProse and concrete
agent or process harnesses.

OpenProse owns the meta-harness:

- package and component IR
- graph ordering
- upstream run and artifact binding
- effect approval
- policy labels
- expected output declarations
- validation rules
- run, attempt, artifact, and pointer materialization

Providers own one execution session:

- receiving a rendered component contract
- executing it in a workspace
- returning artifacts and logs
- reporting performed effects
- returning a provider session reference
- reporting diagnostics, cost, and duration when available

## Request Shape

`ProviderRequest` is intentionally explicit. It carries enough information for
an agentic harness, a local process provider, or a deterministic fixture
provider without requiring any provider to understand the whole package.

Required request fields:

- `request_id`: stable id for correlating provider logs and results
- `provider`: requested provider kind
- `component`: canonical component IR
- `rendered_contract`: the prompt or contract given to the harness
- `input_bindings`: resolved input ports and optional upstream artifacts
- `upstream_artifacts`: complete artifact records available to the run
- `workspace_path`: provider working directory
- `environment`: named environment bindings
- `approved_effects`: effects allowed for this execution
- `policy_labels`: policy labels that apply to the execution
- `expected_outputs`: declared output ports and types
- `validation`: runtime validation rules requested by OpenProse

## Result Shape

`ProviderResult` returns execution facts, not OpenProse run records. The
meta-harness converts results into run attempts, artifacts, diagnostics, and
graph pointers.

Required result fields:

- `request_id`: echoes the request id
- `status`: lifecycle status for the provider execution
- `artifacts`: produced output artifacts by port
- `performed_effects`: effects the provider actually performed
- `logs`: stdout, stderr, and transcript when available
- `diagnostics`: warnings or errors surfaced by the provider
- `session`: resumable or inspectable provider session reference
- `cost`: provider cost telemetry when available
- `duration_ms`: measured provider duration when available

## Intentionally Optional Fields

The protocol keeps some fields nullable because providers differ sharply:

- fixture providers may not have real sessions, cost, transcripts, or stderr
- local process providers may not have agent transcripts
- CLI providers may have stdout/stderr but no structured cost
- Pi or future hosted providers may have durable session URLs and telemetry

Optionality belongs at the provider boundary. Inside the OpenProse store, every
provider result is materialized into explicit run and attempt records so users
can still inspect what happened.

## Session References

`ProviderSessionRef` is stable-serialized so attempts can persist and resume
provider sessions without baking provider-specific fields into core run
records. Metadata is string-key sorted before serialization.

The shape is deliberately generic:

- `provider`
- `session_id`
- `url`
- `metadata`

## Backpressure

This slice is complete when:

- provider request and result shapes typecheck
- provider session refs serialize deterministically
- the protocol exports from `src/providers`
- no provider-specific runtime assumptions enter IR or store records

