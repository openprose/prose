# Implementation Note 004: Plan Prior-Run Comparison

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 005, RFC 009

## Purpose

The fourth implementation wave teaches `prose plan` to compare freshly compiled
IR against existing run materializations.

This is the first current-vs-stale planner surface. A plan can now say that a
node is still current, or that it is stale because source, IR, inputs, effects,
run status, acceptance, or outputs changed.

## Scope

Added:

1. `--current-run <path>` for `prose plan`.
2. run-directory loading for `run.json` plus `nodes/*.run.json`.
3. `current` node and plan status.
4. stale reasons:
   - `no_current_run`
   - `run_status:<status>`
   - `acceptance:<status>`
   - `source_sha_changed`
   - `ir_hash_changed`
   - `effects_changed`
   - `input_hash_changed:<port>`
   - `output_missing:<port>`
   - `upstream_stale:<component>`
5. graph-level stale reasons.
6. CLI and fixture tests for current plans and stale plans.

## Non-Goals

- No freshness-window expiry yet.
- No dependency package SHA comparison yet.
- No eval policy comparison yet.
- No automatic recompute.
- No current/latest graph pointer storage.

## Validation

This slice is on track when:

- `bun run test` passes.
- planning against a matching materialized run returns `status: current`.
- changing a caller input returns `status: ready` with input stale reasons.
- changing source semantics returns `ir_hash_changed`.
- the CLI can read a run directory passed through `--current-run`.

## Progress Log

- 2026-04-23: Added prior-run comparison to `prose plan`, including current
  status, run-directory loading, stale reason classification, and tests.

## Next Slice

Freshness and dependency invalidation moved into Implementation Note 005.
