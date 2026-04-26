# 03.1 Local Deployment Store

## Build

- Add `.prose/deployments/<deployment-id>/`.
- Store:
  - deployment manifest
  - enabled workflows
  - environment binding names, not secret values
  - trigger config
  - current/latest pointers
  - event log
  - run index references
- Keep run records immutable in `.prose/runs` or the configured run store.

## Tests

- Store creation is idempotent.
- Store never writes secret values.
- Pointers reference immutable run ids.
- Store can be loaded after process restart.
- Run `bun test`.

## Commit

Commit as `feat: add local deployment store`.

## Signpost

Record the deployment store layout.

