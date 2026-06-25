## Validator, capabilities, and dogfood implementation

**Track: mechanistic (track 1).** See `../docs/doctrine.md`. This code validates integration contracts and runs deterministic proofs. It cannot, by construction, certify track-2 semantic prose-completeness — do not add code paths that pretend otherwise.

This subtree is where runtime-manifest validation, adapter-manifest validation, and live proof machinery live.

Before changing semantics here, read the matching docs/specs:
- `../docs/doctrine.md`
- `../docs/specs/2026-04-15-runtime-conformance-model.md`
- `../docs/specs/2026-04-16-adapter-manifest-model.md`
- `../docs/adapting-and-self-verifying-a-runtime.md`

Rules for code here:
- Keep the strongest honest boundary between `native`, `adapted`, `incidental`, and `unsupported` behavior. Remember: per-capability `native` is a substrate observation, not a claim that the runtime is a native OpenProse compiler (see `../specs/AGENTS.md`).
- Do not weaken validation just to make an example pass. Fix the manifest, proof path, or docs honestly.
- Any meaningful behavior change should come with regression coverage in `tests/` so the same mistake cannot silently recur.
- If you change manifest parsing, proof parsing, or artifact validation, add focused unit tests and update integration tests where appropriate.
- When support scope changes, sync `src/`, `specs/`, `docs/`, and `tests/` together.
- Real proof matters more than theory: after code changes, run the relevant tests, then run real `adapter validate` / `adapter dogfood` flows as appropriate and verify the artifacts on disk.
- Use tmux for long-running live proofs.
