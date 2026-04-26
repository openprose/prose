# 014 Single-Run Handoff

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: add single-run handoff`

## Finding

The docs said single-run agent harness portability still mattered, but the
package only had the Pi graph VM runtime and rejection errors for model
providers/single-run harness names. The boundary was conceptually right but not
executable.

## What Changed

- Added `handoffFile`, `handoffSource`, and
  `renderSingleRunHandoffMarkdown`.
- Added `prose handoff <file.prose.md>` with text and JSON output.
- The handoff accepts exactly one executable component and rejects multi-node
  graphs with a concise pointer back to `prose run --graph-vm pi`.
- The handoff exports typed inputs, typed outputs, effects, environment names,
  execution text, package identity, and an output-submission payload shape.
- Added `docs/single-run-handoff.md` and linked it from the docs index.
- Added CLI/API tests and public namespace coverage.

## Tests Run

- `bun test test/single-run-handoff.test.ts test/module-boundaries.test.ts test/cli-ux.test.ts`
- `bun run prose handoff examples/north-star/company-signal-brief.prose.md --input signal_notes=test --input brand_context=test`
- `bun run prose run examples/north-star/company-signal-brief.prose.md --graph-vm pi --output company_signal_brief=test`
- `bun run typecheck`
- `git diff --check`

## Result

OpenProse now keeps both truths cleanly:

- single executable component: export a portable one-off harness handoff
- reactive multi-node graph: run through the Pi graph VM

## Next Slice

Continue public docs cleanup so README, docs, and release pages all point at
this boundary consistently.
