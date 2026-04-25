# 05.3 Upstream Binding

This slice makes graph execution materially compositional. The dependency
executor already ran nodes in order; now downstream provider requests receive
the upstream values, artifact records, and run provenance produced by earlier
nodes.

## Binding Rules

- Caller inputs bind directly by port name.
- Caller inputs whose declared type is `run`, `run[]`, or `run<T>` preserve
  `source_run_id` when the value uses `run: {id}` syntax.
- Component inputs wired from upstream nodes bind from the upstream run output:
  - `value` is the upstream artifact content.
  - `artifact` is the local artifact record when it is available.
  - `source_run_id` is the upstream component run id.
  - `upstream_artifacts` contains every artifact record passed into the
    provider request.
- Required upstream outputs are checked before a downstream provider call. If an
  upstream output is absent, the downstream node materializes as blocked with a
  direct reason.

## Provider Contract

`ProviderRequest` was already shaped for upstream binding. This slice starts
populating that shape:

```ts
{
  input_bindings: [
    {
      port: "feedback",
      value: "Tighten the intro.\n",
      artifact: { provenance: { run_id: "graph:review", port: "feedback" } },
      source_run_id: "graph:review",
      policy_labels: []
    }
  ],
  upstream_artifacts: [...]
}
```

The Pi provider prompt now renders input bindings explicitly so harness sessions
can reason over both raw values and source-run provenance.

## Intentional Limits

- Partial current-node reuse can bind through the local artifact store when the
  prior artifact record is available. Copying prior-run artifact files into a
  new run directory remains part of the later graph assembly refinement.
- `run<T>` values currently use explicit `run: {id}` references. A richer local
  resolver for run ids, run directories, and registry-backed runs should remain
  a later slice rather than a hidden parser trick.

## Manual Smoke

```sh
bun bin/prose.ts run examples/run-aware-brief.prose.md \
  --provider fixture \
  --run-root /tmp/openprose-run-aware-smoke \
  --run-id run-aware-smoke \
  --input company='OpenProse profile.' \
  --input subject='run: intake-123' \
  --output brief-writer.brief='Run-aware brief.' \
  --no-pretty
```

Expected summary:

```json
{"run_id":"run-aware-smoke","status":"succeeded","outputs":["brief"]}
```
