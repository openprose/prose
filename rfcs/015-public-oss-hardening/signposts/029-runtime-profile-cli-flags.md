# 029: Runtime Profile CLI Flags

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: add runtime profile cli flags`

## What Changed

- Added CLI flags for runtime-profile fields:
  `--model-provider`, `--model`, `--thinking`, `--tools`,
  `--persist-sessions`, and `--no-persist-sessions`.
- Passed those profile values through `prose run`, `prose eval`,
  `prose preflight`, and `prose remote execute`.
- Kept model providers separate from graph VMs; `--graph-vm openrouter` still
  fails with the existing graph-VM vocabulary.
- Preserved deterministic fixture behavior: `--output` runs still materialize
  through the internal scripted Pi profile even if model flags are supplied.
- Updated help text, `commands/prose-run.md`, `docs/inference-examples.md`, and
  `docs/what-shipped.md`.

## Why

Interactive live runs should not require users to memorize environment
variable names before they can try the real Pi graph VM. Environment variables
remain useful for CI and repeated defaults, but explicit flags make the runtime
profile inspectable and keep the graph VM/model-provider split visible.

## How To Test

- `bun test test/runtime-profiles.test.ts test/run-entrypoint.test.ts test/cli-ux.test.ts test/source-tooling.test.ts`
- `bun run typecheck`

## What Is Next

- Continue with command error consistency and final provider/node-runner
  vocabulary cleanup.
