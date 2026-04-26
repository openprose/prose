# 08.1 Publish Company To Dev

## Build

- Ingest or publish `@openprose/prose-openprose` into dev.
- Use immutable source SHA.
- Keep package private/internal unless deliberately testing public package
  discovery.

## Tests

- Dev package version exists.
- Component count matches OSS package output.
- Quality score and metadata hash match expectation.
- Public catalog fixture audit remains clean.

## Commit

Commit any script/docs updates as `test: publish native company to dev`.

## Signpost

Record package id, version id, registry ref, and source SHA.

