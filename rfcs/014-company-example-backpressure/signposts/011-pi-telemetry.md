# 011 Pi Telemetry

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: normalize pi runtime traces`

## What Changed

- Added Pi event normalization in `src/runtime/pi/events.ts`.
- Added optional provider telemetry events to the provider protocol.
- Captured Pi runtime events from the provider subscription stream:
  - session start/end/abort
  - assistant messages
  - tool start/end
  - retry events
  - model errors
  - token usage when present
  - structured output submission accepted/rejected
- Wrote normalized provider telemetry into both single-run traces and graph
  node traces.
- Added provider session trace events with session id, session file, model
  provider, and model id.
- Rendered trace event details in text output so traces are inspectable without
  opening raw JSON.
- Included runtime trace event counts in the example measurement report.
- Updated hosted runtime contract fixtures because `trace.json` now contains
  richer telemetry.

Representative trace excerpt:

```text
Events:
- 2026-04-26T12:11:45.000Z: graph.started
- 2026-04-26T12:11:45.000Z: node.started
- 2026-04-26T12:11:45.000Z: provider.session provider[pi] model[scripted/test-model] session[scripted-pi-1] session_file[/tmp/.../.pi/scripted-pi-1.jsonl]
- 2026-04-26T12:11:45.000Z: pi.tool.started provider[pi] model[scripted/test-model] session[scripted-pi-1] tool[openprose_submit_outputs]
- 2026-04-26T12:11:45.000Z: pi.output_submission.accepted provider[pi] model[scripted/test-model] outputs[message]
- 2026-04-26T12:11:45.000Z: node.finished
```

## Testing

- `bun test test/pi-events.test.ts test/scripted-pi-session.test.ts test/runtime-planning.test.ts`
- `bun test test/hosted-contract-fixtures.test.ts test/pi-events.test.ts test/scripted-pi-session.test.ts`
- `bun run typecheck`
- `bun test`

Result: all local checks pass. Full suite: 202 pass, 2 skipped live-provider
tests, 0 fail.

## Notable Learning

The trace file is now doing real explanatory work. Instead of treating Pi as a
black box that emits transcript text, OpenProse can explain the runtime path in
the same vocabulary as the graph: node started, provider session created, tool
called, output submitted, node finished.

This gives the next slices much better backpressure. When gates, retries,
cancellations, and live Pi sessions get more complicated, the trace should show
where the runtime made the decision instead of forcing a reader to reconstruct
it from raw agent events.

## Next Slice

Phase 02.7 should enforce pre-session gates: approval-required nodes and
forbidden effects must block before a Pi session is created, and traces should
make that pre-session decision visible.
