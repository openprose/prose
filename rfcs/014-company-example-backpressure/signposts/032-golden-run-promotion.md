# 032 Golden Run Promotion

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Customer branch: `build/reactive-openprose-company`
Customer commit: `823a9f8 test: add semantic company goldens`

## What Changed

- Added curated semantic goldens to `customers/prose-openprose` instead of
  committing fresh `.prose/runs/` directories.
- Added `goldens/semantic/company-package.snapshot.json` with package hashes,
  selected component contracts, effect kinds, publish-check status, and a
  deterministic company-map runtime smoke.
- Added `scripts/validate-semantic-goldens.ts` to compile the package, run
  `publish-check`, execute `company.prose.md` with `--graph-vm pi`, and compare
  stable JSON semantics.
- Wired the semantic golden check into
  `scripts/validate-openprose-local.sh`.
- Updated the customer README from `prose materialize` to `prose run` and
  documented the semantic golden validation path.
- Refreshed `prose.lock` to the current Prose runtime commit that exposes the
  graph VM CLI vocabulary.
- Changed the company-enrichment narrative heading from a top-level heading to
  `### Notes`, removing accidental parser ambiguity from the package compile
  output.

## Why It Matters

The reference company now has durable backpressure evidence without turning
generated runtime state into the source navigation path. The snapshot checks
the semantics we care about: package shape, selected component contracts,
effect declarations, publish readiness, and the fact that a representative run
goes through the Pi graph VM vocabulary.

This also resolves the Phase 07.3 open question: after scripted Pi replaced the
temporary public fixture runtime, the right golden layer is a curated semantic
snapshot first. Full run-directory fixtures should be promoted only when they
are specifically needed for replay debugging.

## Tests Run

From `customers/prose-openprose`:

- `bun scripts/validate-semantic-goldens.ts --update`
- `bun scripts/validate-semantic-goldens.ts`
- `scripts/validate-openprose-local.sh`

## Test Results

- Semantic golden update and verification passed.
- `prose lint systems` passed with 0 diagnostics.
- Root package compile/publish checks passed with 99 components.
- `release-on-demand`, `gtm-pipeline`, `agent-index-refresh`, and
  `saas-index-refresh` preflights passed.
- `prose run company.prose.md --graph-vm pi` succeeded with scripted Pi output.
- `prose status` and `prose trace` passed for the validation run.
- Nested `customers/prose-startino` package and registry-ref install checks
  passed.

## Tests Not Run

- No live Pi/OpenRouter inference was run in this slice.
- No full `.prose/runs/` directory was promoted.

## Next Slice

- Return to the OSS runtime cleanup path: rename or collapse remaining internal
  "provider" vocabulary where it now means node execution machinery, while
  preserving the intentional distinction between graph VM and model provider.
