# Phase 01: OSS Deployment Vocabulary

Goal: make "deployment" a first-class OSS concept before adding runtime
behavior.

This phase defines the durable shape that both local and hosted runtimes will
use:

- deployment manifest
- workflow/entrypoint discovery
- environment and secret binding requirements
- trigger proposals
- deployment preflight
- source/package/environment identity

## Sub-Phases

1. [`01-deployment-identity.md`](subphases/01-deployment-identity.md)
2. [`02-entrypoint-discovery.md`](subphases/02-entrypoint-discovery.md)
3. [`03-deployment-preflight.md`](subphases/03-deployment-preflight.md)

## Tests

- `bun run typecheck`
- `bun test`
- `bun run prose package examples --format json`
- `bun run prose package /Users/sl/code/openprose/customers/prose-openprose --format json`

## Commit

Commit after each sub-phase.

## Signpost

Add a signpost in
`rfcs/017-openprose-native-company-deployments/signposts/`.
