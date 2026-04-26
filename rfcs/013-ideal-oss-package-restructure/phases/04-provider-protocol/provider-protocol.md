# Superseded: Provider Protocol

This page is a historical stub. Phase 04.1 originally defined a flat provider
protocol for fixture, local-process, Pi, and possible CLI harness adapters.

That vocabulary is no longer current.

## Current Reading

- Use **graph VM** for the reactive execution substrate.
- Use **node runner** for the per-node execution boundary.
- Use **runtime profile** for Pi model-provider configuration.
- Use **single-run handoff** for one component exported to another harness.

The implemented code now lives under `src/node-runners/` and `src/runtime/`.
The current protocol shape is `NodeRunRequest` and `NodeRunResult`, not a public
flat provider API.

Historical implementation evidence remains in:

- `../../signposts/015-provider-protocol.md`
- `../../signposts/031m-graph-vm-cli-vocabulary.md`
- `../../../014-company-example-backpressure/signposts/033-node-runner-vocabulary.md`
