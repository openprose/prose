# 037 Remote Execute Runtime Profile

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `refactor: align remote execute runtime selection`

## What Changed

- Changed `prose remote execute` to use the same graph-VM and runtime-profile
  vocabulary as `prose run`.
- Added `--graph-vm` validation to the remote CLI path and kept the removed
  `--provider` flag blocked with the current graph-VM wording.
- Stopped forcing remote execution through a scripted Pi runtime profile when
  the caller supplies an explicit node runner/runtime profile.
- Preserved deterministic `--output` remote fixtures through the normal
  `runFile` scripted-Pi path, so hosted contract tests stay stable.
- Marked the old direct OpenAI-compatible/OpenRouter inference adapter note as
  superseded by the Pi graph-VM architecture.
- Updated docs to state that hosted-compatible remote execution is not a
  separate runtime model.

## Why It Matters

The hosted worker boundary should not quietly fork OpenProse into a second
runtime. A local run, a remote contract fixture, and a hosted worker should all
materialize the same run record shape and runtime profile. This slice keeps
remote execution honest before platform propagation resumes.

## Tests Run

- `bun test test/runtime-materialization.test.ts test/cli-ux.test.ts test/hosted-contract-fixtures.test.ts test/runtime-profiles.test.ts`
- `bun run typecheck`
- `git diff --check`

## Test Results

- Focused runtime/CLI/hosted contract suite: passed.
- Typecheck: passed.
- Diff check: passed.

## Next Slice

- Create a consolidated public-OSS hardening TODO file before fixing further
  issues individually.
- Use that file as the work queue for the next audit pass so improvements are
  traceable rather than scattered.
