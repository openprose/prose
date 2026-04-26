# 03.2 Local Trigger Run Loop

## Build

- Add CLI shape:

```bash
prose deploy init <package-root> --name openprose-company-dev
prose deploy trigger <deployment-id> --entrypoint company
```

- Support manual triggers first.
- Represent schedule/event triggers as configured but inactive unless manually
  driven in local dev.
- Use package graph planner from Phase 02.

## Tests

- Manual trigger creates a graph run.
- Trigger provenance records deployment id, entrypoint, actor, and trigger kind.
- Missing environment bindings block before node sessions start.
- Run `bun run typecheck`.

## Commit

Commit as `feat: add local deployment trigger loop`.

## Signpost

Record a local manual trigger trace.

