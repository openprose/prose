# 04.3 Measurement

## Build

- Extend measurement output with deployment metrics:
  - deployable entrypoint count
  - configured workflow count
  - run success/failure/blocked counts
  - node reuse savings
  - approval latency placeholder
  - artifact counts
  - eval pass/fail summary
  - cost/time placeholders
- Add reference-company deployment measurements to release confidence only after
  they are stable and not too expensive.

## Tests

- `bun run measure:examples`
- local deployment measurement command
- `bun run confidence:runtime`

## Commit

Commit as `test: measure native company deployment readiness`.

## Signpost

Record initial local deployment metrics and known blind spots.

