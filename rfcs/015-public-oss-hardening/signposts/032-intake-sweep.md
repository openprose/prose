# 032: Intake Sweep

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: guard live pi generated artifacts`

## What Changed

- Reviewed local `.prose/live-pi-agent` and `.prose/live-pi-runs` artifacts.
- Confirmed `.prose/` is ignored and the live Pi agent auth/model/run files are
  not part of the public source surface.
- Added a regression to `test/live-pi-smoke.test.ts` that checks representative
  live Pi generated paths with `git check-ignore`.
- Reviewed generated HTML diagrams and kept them under `docs/diagrams/` because
  they already have an index page and are linked from `README.md` and
  `docs/README.md`.
- Decided not to add `prose doctor` yet; `preflight`, runtime confidence,
  binary smoke, live Pi smoke, and measurement evidence now cover the repeated
  setup checks without expanding the CLI surface.

## How To Test

- `bun test test/live-pi-smoke.test.ts`
- `git check-ignore .prose/live-pi-agent/auth.json .prose/live-pi-agent/models.json .prose/live-pi-runs/example/run.json`

## What Is Next

- Run the final hardening verification sweep, update the signpost index if
  needed, then commit and push the completed public OSS hardening pass.
