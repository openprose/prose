# Single-Run Handoff

OpenProse has one reactive graph VM: Pi. Multi-node graphs need that graph VM
because OpenProse must coordinate dependency order, persisted node sessions,
artifact handoff, approvals, selective recompute, traces, and run records.

A single component is different. It can be handed to a compatible one-off agent
harness as a contract bundle.

## Boundary

`prose handoff` exports a single executable component as:

- source/package identity
- typed inputs and supplied values
- typed outputs
- declared effects
- environment names without values
- execution instructions
- an OpenProse output submission payload shape

It does not run the component, create a run record, or coordinate a graph. The
receiving harness is responsible for doing the work and returning the declared
outputs.

`### Execution` content is preserved as semantic instruction text. If it uses
delegation language such as `session` or `call openprose_subagent`, a harness
with child-session support can map that shape to its own child primitive. A
harness without child sessions can still complete the one-off handoff by doing
the work in the parent session and returning the declared outputs.

## Usage

```bash
bun run prose handoff examples/north-star/company-signal-brief.prose.md \
  --input signal_notes="Customer teams want durable agent workflows." \
  --input brand_context="OpenProse is React for agent outcomes."
```

For automation:

```bash
bun run prose handoff examples/north-star/company-signal-brief.prose.md \
  --format json \
  --input signal_notes="Customer teams want durable agent workflows." \
  --input brand_context="OpenProse is React for agent outcomes."
```

If the source compiles to more than one executable graph node, `prose handoff`
refuses and points you back to:

```bash
bun run prose run path/to/graph.prose.md --graph-vm pi
```

## Why This Exists

This keeps the original OpenProse single-run portability idea without making
reactive execution harness-agnostic by pretending every CLI process can become
a graph VM.

- single component: export a contract handoff
- reactive graph: run through Pi as the OpenProse graph VM
- hosted platform: consume the same IR, package metadata, run records, and
  artifact contracts

For the Pi-native child-session protocol, see
[Subagents and Private State](subagents-private-state.md).
