## Runtime-conformance and adaptation docs

**Track: mechanistic (track 1).** See `../docs/doctrine.md`. These docs describe what the conformance suite can certify about integration and wiring. They do not settle semantic questions about whether an agent is a native OpenProse compiler — that is track 2 and lives outside this repo.

Read these before changing claims in this subtree:
- `doctrine.md`
- `specs/2026-04-15-runtime-conformance-model.md`
- `specs/2026-04-16-adapter-manifest-model.md`
- `adapting-and-self-verifying-a-runtime.md`

Rules for docs here:
- Use precise terms. Distinguish **Prose Complete** (capability-theoretic, track 2 — semantic) from **Runtime Conformant** (operational/certified, track 1 — mechanistic). A passing conformance run never awards prose-completeness.
- "Native OpenProse runtime" is a track-2 claim. Do not present it as something a mechanical suite can grant. If a proof path is host-mediated or adapted, say that plainly and stop there.
- Do not overclaim. If a proof path is host-mediated or adapted rather than native, say that plainly in docs.
- Tie claims to real evidence: validated manifests, real dogfood runs, and externally verified artifacts on disk.
- Keep docs aligned with the current manifests in `specs/`, the validator/dogfood implementation in `src/`, and the regression tests in `tests/`.
- When example commands change, update them here too.
- If a runtime is only self-declared, say so. Reserve stronger wording for what has actually been proven.
