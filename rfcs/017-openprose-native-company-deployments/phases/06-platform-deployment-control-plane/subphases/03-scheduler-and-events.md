# 06.3 Scheduler And Events

## Build

- Add disabled-by-default trigger records for schedules and future events.
- Add manual scheduler execution path for dev tests.
- Do not auto-run schedules from source metadata.
- Store trigger provenance on every run.

## Tests

- Enabling a schedule requires explicit deployment config.
- Manual schedule tick creates trigger provenance.
- Disabled schedule does not execute.
- Run API tests.

## Commit

Commit as `feat: add deployment trigger records`.

## Signpost

Record trigger semantics and what remains intentionally manual.

