# 03.4 Local Company Smoke

## Build

- Add a local smoke script or command that initializes a deployment for
  `customers/prose-openprose`.
- Run safe/dry-run entrypoints:
  - `company.prose.md`
  - `intelligence-daily`
  - `gtm-pipeline` through approval block
  - `stargazer-daily` with fixture data if available
- Do not require real Slack/GitHub writes.

## Tests

- Smoke exits non-zero on missing service resolution.
- Smoke emits a compact JSON summary.
- Smoke records run ids, graph ids, artifact counts, eval status, and current
  pointer changes.
- Run `bun run confidence:runtime`.

## Commit

Commit as `test: add local openprose native company smoke`.

## Signpost

Record the first local company deployment summary.

