# Superseded: Local Process Provider

This page is a historical stub. Phase 04.3 originally explored a command-style
local process adapter.

The adapter was removed from the ideal package because it is not an agent
harness and it teaches the wrong abstraction at the reactive graph boundary.

## Current Reading

- Reactive graphs run through the Pi graph VM.
- Deterministic tests use scripted Pi.
- One component can be exported through `prose handoff`.
- Shell/process execution should return only if it becomes a well-scoped
  single-run harness adapter with sandboxing, effect mapping, and traceable
  session semantics.

Historical evidence remains in:

- `../../signposts/017-local-process-provider.md`
- `../../../014-company-example-backpressure/signposts/031l-direct-adapter-removal.md`
