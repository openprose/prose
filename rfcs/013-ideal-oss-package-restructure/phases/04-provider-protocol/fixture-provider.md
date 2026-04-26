# Superseded: Fixture Runtime Provider

Phase 04.2 originally added a deterministic fixture provider for fast local
development, golden fixtures, and runtime backpressure tests.

RFC 014 supersedes that decision. Deterministic behavior now lives behind
internal scripted Pi sessions so local `--output` runs, hosted envelope smoke
tests, and unit tests exercise the same Pi-shaped graph VM boundary as real
execution.

## Authoring Rules

Deterministic outputs are still plain strings keyed by output port:

```ts
createScriptedPiRuntime({
  outputs: {
    message: "Hello from scripted Pi.",
  },
});
```

For graph or package-level tests, outputs may also be scoped by component id or
component name:

```ts
createScriptedPiRuntime({
  outputs: {
    "summarize.brief": "Short brief.",
    "Summarize brief.brief": "Short brief.",
  },
});
```

The scripted Pi runtime submits outputs through `openprose_submit_outputs`,
which lets the normal Pi validation/materialization path accept or reject them.

## Failure Semantics

- Missing required outputs produce normal Pi/output validation diagnostics.
- Malformed submissions are rejected by the structured output tool.
- Provider mismatches fail before execution.
- Unapproved side effects block before session creation.

This keeps fixture failures useful as authoring feedback while still matching
the status vocabulary used by real providers.

## Store Path

`writeProviderArtifactRecords` still writes provider result artifacts through
the same local artifact store API. The difference is that deterministic tests
now produce Pi-shaped provider results rather than fixture-shaped ones.

## Backpressure

This slice is complete when the public fixture provider is removed, scripted Pi
covers success/failure scenarios, and no fixture-only assumptions remain in the
protocol.
