# Phase 06.5: Executable Evals

## Goal

Move evals from package-quality metadata into executable OpenProse contracts
that can judge materialized runs and produce durable pass/fail/score records.

## Implemented Behavior

- Package evals are discoverable from `prose.package.json` through package IR
  resources.
- `executeEvalFile` and `executeEvalSource` run an eval contract against a
  subject run.
- The subject run is passed as a structured JSON payload on the `subject`
  input.
- Eval runs use the same local `prose run` meta-harness and provider protocol
  as ordinary runs.
- Eval outputs are interpreted from JSON fields:
  - `passed`, `pass`, `ok`, or `accepted`
  - `verdict`, `status`, or `overall_verdict`
  - `score`, `quality_score`, or `overall_score`
- Scores above `1` are normalized from a `0-100` scale to `0-1`.
- Durable eval result records are written to the subject run directory under
  `evals/*.json`.
- `prose eval <eval.prose.md> --subject-run <run-dir>` exposes the flow from
  the CLI.

## Record Shape

Eval result records use:

```json
{
  "eval_record_version": "0.1",
  "eval_ref": "evals/quality.eval.prose.md",
  "subject_run_id": "subject-run",
  "eval_run_id": "subject-run:eval:quality-eval-prose-md",
  "required": true,
  "status": "passed",
  "score": 0.92,
  "verdict": "pass"
}
```

The subject run record is not mutated in this slice. Phase 06.6 will decide
when required eval records gate acceptance and current pointer updates.

## Tests

- Discover package eval files from the examples package.
- Execute a passing eval over a materialized run.
- Execute a failing eval and preserve the original subject run record.
- Execute the same path through `prose eval`.

## Commit And Signpost

- Commit this slice as `feat: execute OpenProse evals over runs`.
- Add signpost `031-executable-evals.md`.
- Push both the OSS branch and the parent platform gitlink.
