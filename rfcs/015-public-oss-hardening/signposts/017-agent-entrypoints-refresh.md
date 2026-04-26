# Signpost 017: Agent Entry Points Refresh

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

## What Changed

- Rewrote the unreleased changelog entry so it describes the current Pi
  graph-VM model, scripted Pi deterministic outputs, `prose handoff`, and the
  removed public materialization command family accurately.
- Refreshed `skills/README.md` so the skill directory is described as the
  current OpenProse skill router rather than a canonical VM spec.
- Added `commands/prose-handoff.md` for single-component handoff.
- Updated command sidecars so `/prose-inspect`, `/prose-preflight`, and
  `/prose-run` use current runtime vocabulary.
- Added `test/agent-entrypoints.test.ts` to keep the unreleased changelog,
  skills README, and command sidecars aligned with the current model.

## Validation

- `rg -n -- "local-process|fixture materialize|prose fixture|provider interfaces|canonical definition of what the OpenProse VM is|\\.env files" CHANGELOG.md skills commands`
- `bun test test/agent-entrypoints.test.ts test/docs-public.test.ts test/cli-ux.test.ts`

## Next

- Continue through RFC 015. The next low-risk public cleanup is the historical
  RFC provider phase, then the deeper source-level materializer seam.
