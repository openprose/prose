# 011 Stdlib Ops Current Run Artifacts

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: update std ops run artifacts`

## Finding

The stdlib ops contracts still described the old run folder model: `state.md`,
marker-based execution logs, `program.md`, `services/*.md`, and tool-specific
session spelunking. They also declared internal services that do not exist as
package components, which made `prose lint packages/std/ops` noisy.

## What Changed

- Rewrote `diagnose`, `status`, and `profiler` around current OpenProse run
  artifacts: `run.json`, `trace.json`, node records, bindings, artifact
  manifests, local store attempts, and structured telemetry.
- Refreshed `lint`, `preflight`, and `wire` to describe the current compiler,
  package-scope, dependency, and manifest projection surfaces.
- Removed unresolved self-contained ops `Services` sections.
- Updated `packages/std/ops/README.md`.
- Added `test/std-ops.test.ts` to keep ops contracts compile-clean and free of
  obsolete runtime artifacts.
- Tightened directory linting so ordinary Markdown docs are skipped unless they
  contain a legacy contract.

## Tests Run

- `bun test test/std-ops.test.ts test/source-tooling.test.ts`
- `bun run prose lint packages/std/ops`
- `bun run prose publish-check packages/std --strict`
- `bun run typecheck`
- `git diff --check`

## Result

Stdlib ops now read like operational OpenProse contracts rather than a carryover
from the older VM runtime.

## Next Slice

Clean delivery adapters that still embed host-specific shell/Python recipes.
