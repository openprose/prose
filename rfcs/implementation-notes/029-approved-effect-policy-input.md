# Approved Effect Policy Input

**Date:** 2026-04-24

## Summary

This slice adds an explicit approved-effect policy input to the local planner,
graph preview, and fixture materializer.

- `prose plan`, `prose graph`, and `prose materialize` now accept
  `--approved-effect <effect>`.
- Execution plans emit `approved_effects` so hosted runtimes can audit which
  policy gates were lifted for a continuation attempt.
- The local fixture materializer can now complete an otherwise gated run when
  all unsafe effects are approved and required fixture outputs are supplied.
- CLI materialization now accepts `--trigger human_gate`, matching the universal
  run trigger vocabulary from RFC 005.

This does not make the local materializer perform real side effects. It only
lets a host record that a gated continuation was explicitly authorized.

## How to Test

```bash
cd /Users/sl/code/openprose/platform/external/prose
bun test
bunx tsc --noEmit
bun bin/prose.ts plan examples/approval-gated-release.prose.md \
  --input release_candidate=v0.11.0 \
  --target-output delivery_receipt \
  --approved-effect human_gate \
  --approved-effect delivers
```

## Next

- Wire platform approval resolution into a graph continuation endpoint that
  passes only the effects approved by durable approval records.
- Keep create/retry run APIs from accepting arbitrary approved effects directly;
  approval-derived continuation should be the first hosted path that can lift an
  unsafe-effect gate.
