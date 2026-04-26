# 04.2 Dry-Run Adapters

## Build

- Standardize dry-run behavior for external effects:
  - Slack delivery receipts
  - GitHub/repo mutation previews
  - Exa/public data fixtures
  - GitHub star fixture input
- Prefer explicit deployment environment binding over hidden test flags.
- Ensure dry-run artifacts look like real artifacts with clear policy labels.

## Tests

- No real external writes in company acceptance.
- Dry-run artifacts preserve enough provenance to debug.
- Effect policy still blocks unsafe work unless approved.
- Run local company smoke.

## Commit

Commit as `test: add native company dry-run adapters`.

## Signpost

Record which effects are dry-run and which remain blocked.

