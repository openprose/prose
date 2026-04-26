# 003 Measurement Path Normalization

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: normalize measurement report paths`

## Finding

Committed measurement reports contained local absolute paths such as
`/Users/sl/...` and temporary directories from the machine that generated them.
The reports are useful public evidence, but local paths make them look like
private agent residue.

## What Changed

- Updated `scripts/measure-examples.ts` so package snapshots use repo-relative
  or workspace-relative display paths.
- Updated `scripts/live-pi-smoke.ts` so report `run_root` and result `run_dir`
  values are normalized to repo-relative paths or `$TMP`.
- Regenerated `docs/measurements/latest.*` and
  `docs/measurements/runtime-confidence.latest.*`.
- Normalized the committed successful live Pi report paths without rerunning
  paid inference.
- Marked the RFC 015 TODO item as done.

## Tests Run

- `bun run measure:examples`
- `bun scripts/live-pi-smoke.ts --tier cheap --skip --out /tmp/openprose-live-pi-skip.json`
- `bun run typecheck`
- `bun run confidence:runtime`
- `rg -n '/Users/sl|/var/folders|/tmp/openprose|/tmp/' docs/measurements`
- `git diff --check`

## Result

- Deterministic measurements passed.
- Runtime confidence passed: 18 checks.
- Live Pi skip smoke produced normalized `$TMP/...` report paths.
- `docs/measurements` no longer contains local absolute paths.

## Tests Not Run

- Paid live Pi smoke was not rerun. The previous successful live evidence is
  preserved; this slice only changed path presentation and report generation.

## Next Slice

Move to package metadata source SHA policy or binary artifact hashing.
