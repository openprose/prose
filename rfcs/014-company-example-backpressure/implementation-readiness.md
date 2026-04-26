# Implementation Readiness

This is the final planning pass before implementation. The package is close
enough to proceed, but only if the first code slice removes the old flat
provider architecture rather than preserving it behind nicer names.

## Readiness Verdict

Proceed with implementation.

The current package already has the hard parts that should be preserved:

- canonical source compilation into IR
- graph planning over prior runs
- node-level current/ready/blocked/skipped status
- run records, node records, artifact records, attempts, graph pointers, trace
  views, status views, and eval acceptance
- a Pi SDK integration spike that can create sessions, subscribe to events,
  select models, and persist session files

The current package also has older experiments that should be removed or
collapsed before they shape the next runtime:

- public `provider` as a flat graph-runtime concept
- public `fixture` as a runtime/provider
- direct `openai_compatible` and `openrouter` graph providers
- `local_process` as a graph provider
- package metadata fields that advertise provider lists and default providers
- CLI help and examples that teach `--provider fixture`
- Pi output capture through output files as the primary path

## Current Package Shape

Useful foundations:

| Area | Current Files | Keep / Reshape |
| --- | --- | --- |
| Compiler and IR | `src/compiler.ts`, `src/types.ts`, `src/ir/*` | Keep. Add runtime profile/package metadata changes. |
| Planner | `src/plan.ts`, `src/graph.ts` | Keep. Later add richer stale reasons from runtime profiles and memory artifacts. |
| Run materialization | `src/run.ts`, `src/runtime/*`, `src/store/*` | Keep core behavior. Rename provider-shaped seams to runtime/node execution. |
| Policy gates | `src/policy/*`, graph blocked-effect planning | Keep. Strengthen pre-session gate tests. |
| Pi spike | `src/providers/pi.ts`, `test/pi-provider.test.ts` | Reshape into Pi graph VM and structured output tool. |
| Test harness | object-injected `RuntimeProvider` tests | Keep the pattern, but rename to scripted Pi session helpers. |

Warts to remove:

| Wart | Current Files | Action |
| --- | --- | --- |
| Public flat provider enum | `src/providers/protocol.ts`, `src/providers/registry.ts`, CLI `--provider` | Replace with runtime layers and profiles. |
| Direct chat adapters | `src/providers/openai-compatible.ts`, openrouter resolver, docs/tests | Delete as OpenProse graph runtimes. OpenRouter becomes Pi model provider config. |
| Command adapter provider | `src/providers/local-process.ts` | Delete from graph runtime. Revisit only if single-run harness support later requires it. |
| Public fixture runtime | `src/providers/fixture.ts`, `fixture materialize`, `--output` CLI smokes | Move deterministic behavior into test-only scripted Pi sessions. |
| File-output primary path | `src/providers/output-files.ts`, Pi output-file prompt | Replace with `openprose_submit_outputs`; keep scratch file effects only where needed. |
| Runtime package metadata | `runtime.providers`, `default_provider` in package JSON | Replace with runtime requirements/profile hints, not provider menus. |

## Implementation Order

Start with Phase 02, not Phase 01.

Reason: Phase 01 fixtures are useful, but if they land on top of the old
provider contract they will reinforce the wrong abstraction. The package should
first make the Pi-backed graph VM the real runtime boundary, then add examples
that pressure it.

Recommended order:

1. Phase 02.1 and 02.2: remove public provider semantics and introduce runtime
   profiles.
2. Phase 02.3 and 02.4: make Pi the graph VM and define the node prompt
   envelope.
3. Phase 02.5 and 02.6: add structured output submission and telemetry.
4. Phase 02.7: prove gates block before sessions.
5. Phase 01: create fixtures/eval rubrics/test doubles against the new runtime
   shape.
6. Phase 03 onward: build examples in the order of React-like pressure.

## Target Module Shape

The implementation does not need to preserve old module paths.

Recommended end state:

```text
src/runtime/
  profiles.ts
  graph-runtime.ts
  node-request.ts
  node-result.ts
  node-envelope.ts
  output-submission.ts
  traces.ts
  records.ts
  bindings.ts
  pi/
    graph-vm.ts
    session-factory.ts
    output-tool.ts
    events.ts
    models.ts
test/support/
  scripted-pi-session.ts
  runtime-scenarios.ts
```

The old `src/providers/` directory should either disappear or become limited to
single-run harness adapters once those are genuinely needed. It should not own
reactive graph execution.

## Testing Posture

Every implementation slice should run:

- the focused tests for the slice
- `bun run typecheck`
- `bun test` unless the slice is documentation-only or a transient deletion
  slice explicitly records why the full suite is temporarily expected to fail

Live Pi smoke remains opt-in:

```text
OPENPROSE_PI_LIVE=1
OPENPROSE_MODEL_PROVIDER=openrouter
OPENPROSE_MODEL=google/gemini-3-flash-preview
```

Deterministic tests should use scripted Pi sessions injected in library tests.
They should not rely on public `--provider fixture`.

## Commit And Signpost Rule

After every code slice:

1. Add or update a signpost in `rfcs/014-company-example-backpressure/signposts/`.
2. Record files changed, tests run, and next slice.
3. Commit with a narrow message.
4. Push the branch.

## Open Questions

No open question blocks implementation.

The only judgment call left is naming. Recommendation:

- Use `graphVm` for the reactive execution substrate.
- Use `modelProvider` for OpenRouter/Anthropic/OpenAI-compatible model routing
  inside Pi.
- Use `singleRunHarness` only for future one-component portability.
- Avoid `provider` in public graph-runtime APIs except where the word means a
  model provider.
