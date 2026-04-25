# Pi SDK Alpha Provider

Phase 04.5 adds Pi as the first real TypeScript agent harness provider.

Pi remains a provider. OpenProse still owns graph planning, effect gates,
provider selection, run attempts, artifact materialization, eval acceptance,
and current pointer updates.

## Dependency

The provider uses:

- `@mariozechner/pi-coding-agent@0.70.2`

This is intentionally provider-scoped. The OpenProse provider protocol does not
import Pi types and can still support other harnesses.

## Execution Shape

The Pi provider:

1. validates provider kind, required environment bindings, and approved effects
2. wraps the rendered OpenProse contract with output-file instructions
3. creates a Pi `AgentSession` in the request workspace
4. runs `session.prompt(...)`
5. captures Pi session events as a transcript
6. reads declared output files from the workspace
7. returns a protocol-shaped `ProviderResult`

`session.prompt(...)` does not return typed artifacts. OpenProse therefore
uses file outputs as the typed boundary:

```text
OpenProse output contract:
Write each declared output to the exact workspace-relative file below.
Do not rely on chat text as the output artifact.
- message (Markdown<Greeting>, required): message.md
```

## Configuration

`createPiProvider` accepts:

- `modelProvider`
- `modelId`
- `apiKey`
- `apiKeyProvider`
- `thinkingLevel`
- `agentDir`
- `sessionDir`
- `persistSessions`
- `tools`
- `noTools`
- `outputFiles`
- `timeoutMs`

The default tools are `read` and `write`. That is enough for an agent to inspect
the workspace and write output artifacts without giving it shell access by
default.

## Session References

Successful and failed Pi prompt executions include:

- `provider: "pi"`
- `session_id: session.sessionId`
- `metadata.session_file` when Pi persisted a session
- `metadata.model_provider`
- `metadata.model_id`

This gives OpenProse a durable provider session reference without making Pi a
core runtime concept.

## Live Smoke

The live SDK smoke is opt-in:

```bash
OPENPROSE_PI_INTEGRATION=1 \
OPENPROSE_PI_MODEL_PROVIDER=anthropic \
OPENPROSE_PI_MODEL_ID=claude-sonnet-4-5 \
OPENPROSE_PI_API_KEY=sk-ant-... \
bun test test/pi-provider.test.ts
```

The normal test suite uses a fake Pi session factory so CI does not require
credentials.

## Current Limitations

- Cost telemetry is not mapped yet.
- Transcript capture is event-line based and capped per event.
- Output validation is file-based, not a Pi extension with structured artifact
  reporting.
- Path protection is not yet implemented; workspace isolation is assumed.
- Retry and resume are meta-harness concerns deferred to Phase 05.

## Backpressure

This slice is complete when:

- the Pi provider can be unit-tested without credentials
- the provider uses the same output-file artifact reader as local process
- prompt errors and missing outputs become protocol diagnostics
- live integration is documented and opt-in
- Pi remains behind the provider module

