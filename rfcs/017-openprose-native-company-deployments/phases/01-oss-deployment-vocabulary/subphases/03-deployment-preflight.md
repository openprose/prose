# 01.3 Deployment Preflight

## Build

- Add a deployment preflight library API.
- Add CLI shape:

```bash
prose deploy preflight <package-root> --entrypoint gtm-pipeline
```

- Report:
  - package metadata status
  - deployable entrypoints
  - missing env vars
  - missing dependency installs
  - unsafe effects requiring deployment approvals
  - trigger proposals
  - dry-run adapter recommendations
- Keep this read-only.

## Tests

- Preflight passes for `company.prose.md`.
- Preflight reports required Exa/review bindings for `gtm-pipeline`.
- Preflight reports Slack bindings for `intelligence-daily`.
- Preflight reports no schedule activation unless explicitly configured.
- Run `bun run typecheck`.

## Commit

Commit as `feat: add deployment preflight`.

## Signpost

Record preflight output for the reference company package.

