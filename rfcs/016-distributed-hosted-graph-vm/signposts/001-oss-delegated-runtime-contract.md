# 001: OSS Delegated Runtime Contract

Date: 2026-04-26

## Summary

Added the first distributed hosted graph VM slice:

- added `runtime_profile.execution_placement` with `local`, `workspace_capsule`, and `distributed`
- added a reusable node execution entrypoint for serialized `NodeExecutionRequest` payloads
- added `DelegatedGraphRuntime` so the OpenProse graph VM can run in one process while node runs execute elsewhere
- added `ExternalProcessNodeDelegate` using request/result files for hosted control-plane interop
- added `prose remote execute-node <request.json>`
- added `prose remote execute --node-executor-command <cmd>`
- updated single-component execution to flow through the graph runtime boundary too

## Tests

- `bun test test/distributed-graph-runtime.test.ts test/runtime-profiles.test.ts test/node-runner-registry.test.ts`
- `bun run typecheck`

## Next

Build the platform-side distributed provider contract:

- control-plane provider invokes OSS OpenProse with `execution_placement=distributed`
- node delegate boundary rewrites worker workspace paths safely
- fake worker tests prove node envelopes can be dispatched independently
- Sprites worker implementation becomes the first real remote node capsule

