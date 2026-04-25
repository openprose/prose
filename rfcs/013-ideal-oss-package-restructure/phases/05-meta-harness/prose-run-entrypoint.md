# `prose run` Runtime Entry Point

Phase 05.1 adds the first real local meta-harness entry point.

The initial runtime path supports exactly one executable component. Multi-node
dependency execution is Phase 05.2.

## Runtime Shape

`prose run` now performs:

1. compile source into IR
2. build a reactive plan
3. resolve a runtime provider
4. create a provider request
5. execute the provider
6. write inspectable run files
7. write provider artifacts through the local artifact store
8. write an attempt record
9. update the local run index
10. print a concise JSON summary

## Provider Defaults

The CLI does not silently pretend fixture output is real execution.

- `--provider fixture` explicitly selects deterministic fixture execution.
- If `--provider` is omitted, fixture execution is selected only when at least
  one `--output port=value` fixture is provided.
- If no provider and no fixture output are provided, `prose run` exits with an
  error.

This preserves the distinction between real harness execution and fixture-only
development.

## Examples

```bash
prose run examples/hello.prose.md \
  --provider fixture \
  --output message="Hello from fixture." \
  --run-root .prose/runs
```

```bash
prose run examples/hello.prose.md \
  --output message="Hello from implicit fixture."
```

## Materialized Files

The run directory includes:

- `ir.json`
- `manifest.md`
- `plan.json`
- `trace.json`
- `run.json`
- `bindings/<component>/<port>.md`

The local store receives:

- provider artifact records
- run attempt records
- run index entries

## Current Limitations

- Exactly one executable component is supported.
- Upstream output propagation is not implemented yet.
- Current run reuse is still plan-only.
- Graph run assembly is not implemented yet.
- Retry, cancel, and resume controls are not implemented yet.

These are the next Phase 05 slices.

