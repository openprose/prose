# Fixture Runtime Provider

Phase 04.2 adds the deterministic provider used for fast local development,
golden fixtures, and runtime backpressure tests.

The fixture provider is not a special runtime path. It implements the same
`RuntimeProvider` contract that Pi, OpenCode, local process, Codex CLI, and
Claude Code providers must implement.

## Authoring Rules

Fixture outputs are plain strings keyed by output port:

```ts
createFixtureProvider({
  outputs: {
    message: "Hello from the fixture provider.",
  },
});
```

For graph or package-level tests, outputs may also be scoped by component id or
component name:

```ts
createFixtureProvider({
  outputs: {
    "summarize.brief": "Short brief.",
    "Summarize brief.brief": "Short brief.",
  },
});
```

The provider normalizes text artifacts with a trailing newline and defaults the
content type to `text/markdown`.

## Failure Semantics

- Missing required outputs produce `blocked` results with
  `fixture_output_missing` diagnostics.
- Non-string outputs produce `failed` results with
  `fixture_output_malformed` diagnostics.
- Provider mismatches produce `failed` results with
  `fixture_provider_mismatch` diagnostics.
- Unapproved side effects produce `blocked` results with
  `fixture_effect_not_approved` diagnostics.

This keeps fixture failures useful as authoring feedback while still matching
the status vocabulary used by real providers.

## Store Path

`writeProviderArtifactRecords` writes provider result artifacts through the
same local artifact store API real providers will use. The fixture provider
does not write run records itself; the meta-harness will own run and attempt
materialization in Phase 05.

## Backpressure

This slice is complete when:

- the fixture provider returns protocol-shaped results
- success, missing output, and malformed output cases are covered
- provider artifacts can be written into the local store
- no fixture-only assumptions enter the protocol

