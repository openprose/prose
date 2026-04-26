# 005 Runtime Layer Boundary

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `refactor: remove public provider runtime surface`

## What Changed

- Removed the public `prose fixture materialize` command and the package script that advertised it.
- Stopped documenting `--provider fixture` as the local runtime path; deterministic `--output` fixtures remain for tests and concise examples.
- Reframed package runtime metadata from flat providers to the intended runtime profile:
  - `graph_vm`
  - `model_providers`
  - `default_model_provider`
  - `default_model`
  - `thinking`
  - `persist_sessions`
- Updated examples, std, co, and hosted-ingest fixtures to advertise `graph_vm: "pi"` with OpenRouter as the model-provider profile.
- Updated CLI and provider-registry errors so `openrouter` and `openai_compatible` are rejected as graph VMs with an explicit model-provider-vs-graph-VM explanation.
- Regenerated package IR and hosted runtime goldens after the runtime manifest shape changed.
- Updated confidence-matrix docs so the reproducible command path no longer uses `--provider fixture`.

## Testing

- `bun run typecheck`
- `bun test`
- `bun run confidence:runtime`

Result: all local checks pass. Full suite: 178 pass, 2 skipped live-provider tests, 0 fail.

## Notable Learning

Migrating a CLI materialization test to the real `run` path exposed that `run<T>` inputs now perform actual local-store lookup, while the old fixture materializer bypassed that runtime validation. The test now seeds a compatible prior run before passing `subject=run:...`, which is better backpressure for the eventual React-like runtime.

## Next Slice

Phase 02.1B should collapse the remaining internal fixture/direct-provider naming into a scripted Pi-session test harness. The public boundary is now correct, but several internal tests and files still use `fixture`, `local_process`, and `openai_compatible` names as implementation scaffolding. That cleanup should happen only after the scripted Pi testing helper exists so the full suite can stay green slice-by-slice.
