## Runtime manifests and adapter manifests

**Track: mechanistic (track 1).** See `../docs/doctrine.md`. Manifests in this subtree describe integration-contract claims. They never award track-2 semantic prose-completeness.

Read these before changing anything here:
- `../docs/doctrine.md`
- `../docs/specs/2026-04-15-runtime-conformance-model.md`
- `../docs/specs/2026-04-16-adapter-manifest-model.md`
- `../docs/adapting-and-self-verifying-a-runtime.md`

Rules for this subtree:
- Make the narrowest honest claim. Distinguish **Prose Complete** (track 2, semantic, out of scope here) from **Runtime Conformant** (track 1, operational, certifiable here).
- Name the runtime subject after the concrete thing under proof. If the proof depends on host orchestration, say so in the filename and notes (for example `*-host-mediated-*`).
- In `runtime-subjects/`, mark each capability as `native`, `adapted`, `incidental`, or `unsupported`, and be explicit about what is self-declared versus actually proven.

### Terminology collision: two meanings of "native"

`conformance-capability-schema.json` defines `support_modes` including `native`. This is a **per-capability** label meaning "runtime provides this primitive without adapter wrapping" — e.g. `file-io: mode: native` means the CLI has built-in file I/O rather than needing a shim.

This is **not the same** as "native OpenProse runtime" (a track-2 claim about the whole runtime being an agent-embodied compiler for prose programs).

A host-mediated runtime subject may legitimately declare individual capabilities as `mode: native`. That is a track-1 substrate observation, not a track-2 prose-completeness claim.

Rename is proposed but not yet applied: per-capability `native` → `builtin` (to free `native` for track-2 use only). Until then, anyone reading or writing these manifests must keep the two meanings distinct.
- In `adapters/`, pin exact source identity, phase files, prompt channels, attachments, and `runtime_manifest`.
- Do not describe a runtime as fully supported just because one model run looked good. Back support claims with a repeatable proof path.
- Before claiming support, run `adapter validate`, then run a real `adapter dogfood` proof in tmux, and verify the artifacts on disk.
- Keep specs, docs, code, and tests in sync. If a manifest changes, review the validator/dogfood code and related tests too.
