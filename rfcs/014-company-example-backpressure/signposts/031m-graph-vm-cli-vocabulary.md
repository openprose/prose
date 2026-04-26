# 031m Graph VM CLI Vocabulary

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `refactor: expose graph vm cli selection`

## What Changed

- Replaced the public CLI runtime selector with `--graph-vm`.
- Removed `--provider` from the active public graph runtime surface; using it
  now fails with a direct message pointing to `--graph-vm pi`.
- Changed CLI JSON summaries from `provider` to `graph_vm` for local `prose
  run` output.
- Updated inference docs, release notes, tests, and runtime-confidence checks
  to use `--graph-vm pi`.
- Refreshed generated measurement reports after the confidence matrix.

## Why It Matters

This makes the public interface match the architecture we have been converging
on: Pi is the graph VM, OpenRouter is a model provider inside Pi, and
deterministic `--output` runs use internal scripted Pi. The word "provider"
still exists in lower-level protocol records, but the author-facing command no
longer teaches the flat-provider model.

## Tests Run

- `bun run typecheck`
- `bun test test/cli-ux.test.ts test/run-entrypoint.test.ts test/provider-registry.test.ts test/runtime-profiles.test.ts`
- `bun test`
- `bun run confidence:runtime`

## Test Results

- Focused CLI/runtime tests: 40 pass.
- Full suite: 230 pass, 1 skip, 0 fail.
- Runtime confidence matrix: pass, 18 checks.

## Tests Not Run

- Live Pi inference stayed opt-in/skipped. This was a CLI vocabulary and
  deterministic confidence slice.

## Next Slice

- Consider whether to rename the remaining internal provider protocol to a
  node-execution protocol, or switch to Phase 07.3 semantic golden company
  snapshots now that the public runtime vocabulary is clean.

## Design Learnings

- The CLI is a language design surface. Keeping `--provider pi` would have
  continued to imply that Pi and OpenRouter are the same kind of thing even
  after the runtime internals were fixed.
- A deliberate rejection path for `--provider` is better than silent parser
  drift; it protects users and future agents from accidentally following stale
  examples.
