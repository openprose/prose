# Signpost 007: OSS Delegated Deployment Trigger

Date: 2026-04-26

## What Changed

- Extended `triggerLocalDeployment` so a package deployment entrypoint can run through an injected graph runtime or node runner, instead of only the local scripted Pi runner.
- Added CLI support for `prose deployment trigger ... --graph-vm pi --node-executor-command <cmd>`.
- Preserved the scripted Pi path as the default local dry-run mode.
- Added coverage proving a deployment entrypoint graph is planned by OpenProse while each selected node is delegated through an external executor process.

## Why

The hosted platform needs the OpenProse control plane to own package deployment state, run planning, and graph coordination while fanning individual node runs out to a worker fabric such as Sprites. This keeps the OSS package as the canonical reactive meta-harness and lets the platform reuse the same contract in dev and hosted environments.

## Validation

- `bun test test/deployment.test.ts`
- `bun run typecheck`

## Next

- Platform Phase 05/06 can now add org-scoped deployment records and trigger package entrypoints through the same delegated graph execution path used by `remote execute`.
- The platform provider should call `prose deployment init` and `prose deployment trigger` for package deployments, then persist the resulting runtime run artifacts into canonical `OpenProseRun` records.
