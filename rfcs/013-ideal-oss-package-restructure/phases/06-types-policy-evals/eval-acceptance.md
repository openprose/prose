# Phase 06.6: Eval Acceptance Gates

## Goal

Make evals acceptance-bearing. A run can complete successfully at the provider
level, but required evals decide whether that materialization becomes accepted
and current.

## Implemented Behavior

- `RunOptions` accepts `requiredEvals` and `advisoryEvals`.
- `prose run` accepts `--required-eval <eval.prose.md>` and
  `--advisory-eval <eval.prose.md>`.
- Successful runs execute required/advisory eval contracts before final
  acceptance is settled.
- Required eval failures set `acceptance.status: rejected` while preserving the
  run lifecycle `status: succeeded`.
- Eval results are copied into the run's `evals` summary with eval run id and
  score.
- Graph node current pointers only advance when the graph acceptance status is
  `accepted`.
- Failed required evals still allow `latest_run_id` to point at the latest
  attempted materialization for inspection and retry.

## Acceptance Matrix

| Runtime status | Required evals | Acceptance | Current pointer |
| --- | --- | --- | --- |
| succeeded | none | accepted | advances |
| succeeded | all passed | accepted | advances |
| succeeded | any failed | rejected | does not advance |
| succeeded | advisory failed only | accepted | advances |
| failed/blocked | any | pending | does not advance |

## Tests

- A required failing eval over a successful graph leaves all graph node
  `current_run_id` fields unchanged.
- The same graph records the failed eval summary on the graph run record.
- Existing eval execution and runtime entrypoint tests continue to pass.

## Commit And Signpost

- Commit this slice as `feat: gate current runs on required evals`.
- Add signpost `032-eval-acceptance.md`.
- Push both the OSS branch and the parent platform gitlink.
