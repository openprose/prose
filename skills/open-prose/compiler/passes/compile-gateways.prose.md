---
name: compile-gateways
kind: service
---

# Compile Gateways

Lower optional `kind: gateway` source into concrete trigger registrations.

### Requires

- `sources`: discovered source records.
- `source_root`: source directory containing the source graph.
- `responsibilities`: compiled responsibility records.
- `activations`: activation intent records.

### Ensures

- `triggers`: concrete trigger records declared by gateways.
- `activations`: activation intent records with gateway trigger ids linked
  where the relationship is deterministic.
- `diagnostics`: warnings or errors when gateway ingress cannot be compiled
  deterministically.

### Strategies

- A gateway defines how time or the outside world enters OpenProse.
- Gateways do not perform fulfillment work. They emit trigger events that wake
  ordinary activations.
- Compile `### Schedule` sections into `cron` triggers with standard
  five-field cron expressions.
- Compile `### Receives` plus `### Emits` sections into `http` triggers when
  method, path, and emitted responsibility trigger id are clear.
- Preserve provider, event, auth, and payload notes as diagnostics or trigger
  metadata only when they are deterministic enough for the harness.
- Emit diagnostics instead of inventing provider subscription setup, auth,
  payload schemas, queue names, or file-watch paths.
