# Historical: Pi SDK Spike

This page is a historical stub. Phase 04.4 inspected
`@mariozechner/pi-coding-agent` and proved that OpenProse could create a Pi
session, provide a contract, receive outputs, and capture telemetry.

## Current Reading

The spike succeeded and informed the current runtime:

- Pi is the local reactive graph VM.
- OpenProse coordinates one Pi node session per selected graph node.
- Outputs are submitted through `openprose_submit_outputs`.
- Model providers such as OpenRouter are Pi runtime-profile settings.
- Durable execution evidence belongs in OpenProse run, artifact, attempt, and
  trace records.

Historical evidence remains in:

- `../../signposts/018-pi-sdk-spike.md`
- `../../../014-company-example-backpressure/signposts/008-pi-graph-vm.md`
- `../../../014-company-example-backpressure/signposts/036-live-pi-ladder-success.md`
