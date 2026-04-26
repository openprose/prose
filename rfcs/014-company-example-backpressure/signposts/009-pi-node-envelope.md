# 009 Pi Node Prompt Envelope

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: add pi node prompt envelope`

## What Changed

- Added `NodePromptEnvelope`, a deterministic execution envelope for one OpenProse graph node.
- Added Pi prompt rendering over that envelope.
- Persisted a redacted `openprose-node-envelope.json` in each executed node workspace.
- Passed the rendered node envelope to Pi through `ProviderRequest.runtime_prompt`.
- Included the key runtime inputs in the envelope:
  - component identity and source
  - package identity and IR hash
  - runtime profile
  - requested outputs, stale reasons, and current run id
  - typed input bindings
  - upstream artifact summaries
  - prior run refs for `run<...>` inputs
  - declared effects and approved effects
  - output contracts and validation rules
  - `openprose_submit_outputs` intent plus fallback output-file instructions
- Redacted environment values before persistence or prompt rendering.

## Testing

- `bun test test/node-prompt-envelope.test.ts test/run-entrypoint.test.ts test/pi-provider.test.ts`
- `bun run typecheck`
- `bun test`

Result: all local checks pass. Full suite: 190 pass, 2 skipped live-provider tests, 0 fail.

## Notable Learning

The envelope makes the React analogy much more tangible. A graph node now receives a durable props object: inputs, upstream materializations, policy, runtime config, output contract, and recompute context. The prompt text is now generated from that object instead of being assembled as a loose provider prompt.

This also gives the next output-tool slice a clean target: `openprose_submit_outputs` can validate against the same envelope the model sees.

## Next Slice

Phase 02.5 should add the structured `openprose_submit_outputs` tool and begin treating file writes as fallback/scratch output rather than the primary graph-node result channel.
