# 02.3 Package Graph CLI

## Build

- Add CLI shape:

```bash
prose deploy plan <package-root> --entrypoint gtm-pipeline
prose deploy graph <package-root> --entrypoint intelligence-daily --format json
```

- Show:
  - selected nodes
  - reused/current nodes
  - blocked nodes
  - missing inputs
  - effect gates
  - trigger proposal
  - deployment state request shape

## Tests

- CLI returns JSON and text views.
- JSON view is stable enough for platform ingestion.
- Text view is concise enough for local developers.
- Run `bun run confidence:runtime` if command routing changes.

## Commit

Commit as `feat: add package deployment graph cli`.

## Signpost

Record command output for `intelligence-daily` and `gtm-pipeline`.

