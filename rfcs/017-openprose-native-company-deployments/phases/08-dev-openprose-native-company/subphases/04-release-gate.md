# 08.4 Release Gate

## Build

- Add a single dev release gate that runs:
  - dev doctor
  - package metadata check
  - deployment workflow suite
  - browser cockpit smoke
  - fixture cleanup audit
- Emit compact Markdown and JSON evidence.

## Tests

- Gate passes against dev.
- Gate fails clearly when package graph service resolution regresses.
- Gate fails clearly when deployment current pointers do not update.
- Gate does not leave public fixture data behind.

## Commit

Commit as `test: add native company dev release gate`.

## Signpost

Record final dev evidence and readiness recommendation.

