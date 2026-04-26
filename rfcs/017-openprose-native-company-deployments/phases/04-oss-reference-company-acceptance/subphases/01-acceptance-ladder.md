# 04.1 Acceptance Ladder

## Build

- Define the reference-company workflows that gate readiness.
- Add fixtures and expected summaries where needed.
- Prefer workflows that uniquely pressure OpenProse:
  - service composition
  - reactive recompute
  - memory/idempotence
  - human gates
  - dry-run mutations
  - package-level current pointers

## Tests

- Publish-check remains strict green.
- Acceptance ladder can be listed by a command or documented fixture.
- Every ladder workflow has input fixture guidance.
- Run customer semantic goldens if changed.

## Commit

Commit as `docs: define native company acceptance ladder`.

## Signpost

Record why each ladder workflow exists.

