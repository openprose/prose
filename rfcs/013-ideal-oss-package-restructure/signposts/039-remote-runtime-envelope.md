# 039: Remote Runtime Envelope

**Date:** 2026-04-26
**Phase:** Phase 08, sub-phase 08.2
**Commit:** `pending`

## What Changed

- Changed `executeRemoteFile` to use the real `prose run` kernel instead of the
  older fixture materialization helper.
- Kept deterministic remote execution available by defaulting the remote path to
  the fixture provider when no provider is supplied.
- Updated the remote envelope to schema `0.2` with provider, plan status,
  acceptance, run record path, and plan path.
- Added `plan.json` as a first-class `runtime_plan` artifact in remote artifact
  manifests.
- Updated remote tests so successful, blocked, and effect-approved remote runs
  are generated from runtime store records.

## How To Test

- `bun test test/runtime-materialization.test.ts`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted runtime materialization and remote envelope tests passed: 14 tests.
- Typecheck passed.
- Full test suite passed: 156 tests passed, 1 skipped.

## Next

- Phase 08.3: add hosted/platform contract fixtures that can be vendored or
  snapshotted by the platform runtime/registry client.

## Risks Or Open Questions

- The CLI still configures only the fixture provider by string. Non-fixture
  remote providers need the provider registry/config work before they can be
  invoked from shell-only hosted worker environments.
