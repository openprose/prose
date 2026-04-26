# 010 Pi Output Tool

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: add openprose pi output tool`

## What Changed

- Added the structured `openprose_submit_outputs` Pi custom tool.
- Added `OutputSubmissionPayload` parsing and validation for:
  - missing required outputs
  - unknown output ports
  - duplicate output ports
  - malformed JSON payloads
  - missing string output content
  - invalid artifact refs
  - undeclared performed effects
- Wired the Pi provider to register the output tool for every node execution.
- Made tool-submitted outputs authoritative when accepted.
- Kept output files as fallback only when no structured output submission was made.
- Ensured rejected structured submissions fail the provider instead of silently
  falling back to files.
- Exported the submission validator and tool factory from the runtime namespace.
- Added `typebox` as an explicit dependency because OpenProse now defines a Pi
  tool schema directly.

Representative tool payload:

```json
{
  "outputs": [
    {
      "port": "brief",
      "content": "Launch the quiet beta.",
      "citations": ["memo://launch"]
    },
    {
      "port": "decision",
      "content": "{\"ship\":true}",
      "content_type": "application/json"
    }
  ],
  "performed_effects": ["pure"],
  "notes": "Ready for review."
}
```

## Testing

- `bun test test/output-submission.test.ts test/scripted-pi-session.test.ts`
- `bun test test/output-submission.test.ts test/scripted-pi-session.test.ts test/pi-provider.test.ts`
- `bun run typecheck`
- `bun test`

Result: all local checks pass. Full suite: 198 pass, 2 skipped live-provider
tests, 0 fail.

## Notable Learning

This is the first slice where graph-node outputs stop being a side effect of
workspace files and become an explicit runtime return channel. That makes the
React analogy sharper: a node receives a deterministic prompt envelope and
returns a typed payload through a known boundary.

The fallback file path still matters for migration and lower-control harnesses,
but Pi-backed graph execution now has a real output API.

## Next Slice

Phase 02.6 should normalize Pi runtime telemetry into OpenProse trace events:
tool calls, model/provider metadata, session paths, token/cost usage when
available, duration, and failure class.
