# 031: Runtime Vocabulary Cleanup

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: finish runtime vocabulary cleanup`

## What Changed

- Audited public docs, skills, commands, source, and tests for provider/protocol
  vocabulary.
- Kept `model_provider` where it represents model-vendor/profile metadata.
- Normalized runtime-profile graph VM errors to say "model provider profile"
  consistently.
- Renamed internal CLI error locals from provider-oriented names to graph VM
  names.
- Added module-boundary coverage that the public package exports
  `nodeRunners`, not provider namespaces.
- Updated the OpenProse skill live-inference route to use explicit runtime
  profile flags.

## Why

OpenProse's public architecture is now: graph VM, node runner, runtime profile,
single-run handoff, model provider. Older provider/protocol language is only
acceptable in historical tests or in the removed `--provider` flag rejection
path. The exported package surface should make that split obvious.

## How To Test

- `rg -n -- "provider protocol|OpenProse provider|provider interfaces|fixture provider|local process|runtime provider" src docs README.md skills commands test`
- `bun test test/module-boundaries.test.ts test/node-runner-protocol.test.ts test/runtime-profiles.test.ts test/cli-ux.test.ts test/docs-public.test.ts test/agent-entrypoints.test.ts`
- `bun run typecheck`

## What Is Next

- Sweep the intake queue: ignored live Pi files, diagram index placement, and
  whether a `prose doctor` command is warranted.
