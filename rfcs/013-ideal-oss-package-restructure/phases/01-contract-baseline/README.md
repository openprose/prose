# Phase 01: Contract Baseline And Test Harness

Goal: create the implementation footing for a full restructure before changing
runtime behavior. This phase should turn the current package into a known,
measured baseline with clear deletion targets and a better test layout.

## 01.1 Inventory Current Runtime Contracts

Build:

- Record the current CLI commands, exported APIs, source parser outputs, IR
  fields, run file shapes, package metadata fields, and std/example promises.
- Mark each contract as keep, replace, delete, or migrate.
- Identify behavior that only exists because of historical compatibility.

Tests:

- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run compile/plan/package/publish-check smoke commands from the phase index.

Commit:

- Commit the inventory and any no-behavior test fixture moves as
  `docs: inventory current OpenProse runtime contracts`.

Signpost:

- Add `signposts/001-contract-inventory.md` with the inventory summary, test
  results, deletion candidates, and next slice.

## 01.2 Split The Test Harness Into Runtime Suites

Build:

- Replace the monolithic test shape with focused suites for source, IR, graph,
  plan, store, provider, package, CLI, and docs quality.
- Keep behavior equivalent while moving tests.
- Add helpers for golden fixtures and CLI smoke tests.

Tests:

- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run at least one CLI smoke through the new helper.

Commit:

- Commit as `test: split OpenProse runtime suites`.

Signpost:

- Add `signposts/002-test-harness-split.md` with moved suites, remaining
  coverage gaps, and the exact commands run.

## 01.3 Define Public Module Boundaries

Build:

- Create the target module directories or barrel exports without large logic
  moves yet: `core`, `source`, `ir`, `schema`, `graph`, `meta`, `store`,
  `runtime`, `providers`, `policy`, `eval`, `package`, and `cli`.
- Document which current files move into each boundary.
- Keep `src/index.ts` explicit and narrow.

Tests:

- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `refactor: establish OpenProse module boundaries`.

Signpost:

- Add `signposts/003-module-boundaries.md` with the boundary map and any files
  intentionally left in temporary locations.

## 01.4 Delete Or Quarantine Non-Ideal Compatibility

Build:

- Remove old code paths that contradict the North Star and are not needed by
  the new runtime.
- Quarantine fixture-only commands behind explicit fixture naming.
- Update CLI help and docs so removed surfaces are not advertised.

Tests:

- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run CLI help and documented smoke commands.

Commit:

- Commit as `refactor: remove non-ideal OpenProse compatibility surfaces`.

Signpost:

- Add `signposts/004-compatibility-removal.md` with removed surfaces, replacement
  surfaces, tests, and any follow-up cleanup.

## Phase Exit Criteria

- The branch has a coherent test harness.
- The current implementation is inventoried.
- The intended module architecture exists.
- No known compatibility shim remains merely to preserve unused old behavior.
