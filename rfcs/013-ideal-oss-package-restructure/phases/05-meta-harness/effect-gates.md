# 05.4 Effect Gates

This slice makes unsafe effects explicit runtime approvals instead of informal
strings passed through the planner.

## Approval Records

OpenProse now has a local effect approval record:

```json
{
  "approval_record_version": "0.1",
  "approval_id": "release-manager-approval",
  "status": "approved",
  "effects": ["human_gate", "delivers"],
  "principal_id": "release-manager",
  "reason": "Approved for release",
  "approved_at": "2026-04-25T00:00:00.000Z",
  "expires_at": null,
  "run_id": "release-run",
  "component_ref": null
}
```

Records can be passed to `prose run` with `--approval approval.json`.
`--approved-effect effect` remains a local development shorthand, but it is now
materialized as a local approval record in `approvals.json` for the run.

Denied records take precedence over local shorthand approvals.

## Runtime Rules

- `pure` and `read_external` remain safe by default.
- Any other effect must be approved before the planner marks the node or graph
  runnable.
- If a graph blocks on `human_gate` or another unsafe effect, the run attempt
  stores a resume point:

```json
{
  "checkpoint_ref": "plan.json",
  "reason": "Graph effect 'human_gate' requires a gate before execution."
}
```

- Provider requests receive the approved effect scope through
  `approved_effects`.
- Denied approvals are surfaced directly in blocked run reasons.

## Manual Smoke

```sh
bun bin/prose.ts run examples/approval-gated-release.prose.md \
  --provider fixture \
  --run-root /tmp/openprose-approval-gate-smoke \
  --run-id approval-gate-smoke \
  --input release_candidate='v1.2.3' \
  --output qa-check.qa_report='QA passed.' \
  --output release-note-writer.release_summary='Release summary.' \
  --output announce-release.delivery_receipt='Delivered to releases.' \
  --approved-effect human_gate \
  --approved-effect delivers \
  --no-pretty
```

Expected summary:

```json
{"run_id":"approval-gate-smoke","status":"succeeded","outputs":["delivery_receipt"]}
```
