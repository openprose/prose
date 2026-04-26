# Signpost 004: OSS Local Deployment Store And Trigger Loop

## Summary

Implemented the first local deployment runtime layer:

- `prose deployment init <package-root>` creates a file-based deployment state
  root
- deployment manifests are stored with secret values redacted
- local deployment events are appended to `events.jsonl`
- `prose deployment trigger <state-root> --entrypoint <component>` records a
  package-plan-backed deployment run
- entrypoint latest/current pointers advance only for succeeded trigger records
- blocked trigger records update latest/failed but not current
- deployment run indexes survive process restart

Store layout:

```text
<state-root>/
  deployment.json
  store.json
  events.jsonl
  runs/<run-id>/
    run.json
    plan.json
  pointers/entrypoints/<entrypoint>.json
  indexes/runs.json
```

Reference-company smoke:

- initialized `openprose-company-dev`
- enabled `openprose-company`, `intelligence-daily`, `gtm-pipeline`, and
  `stargazer-daily`
- provided dev-safe placeholder bindings
- triggered `intelligence-daily`
- recorded a succeeded deployment run and advanced its pointer

## Test Notes

Passed:

```bash
bun test test/deployment.test.ts
bun run typecheck

STATE=$(mktemp -d /tmp/openprose-company-deployment.XXXXXX)
bun bin/prose.ts deployment init /Users/sl/code/openprose/customers/prose-openprose \
  --state-root "$STATE" \
  --deployment-name openprose-company-dev \
  --org-id openprose-dev \
  --environment dev \
  --mode dev \
  --enable openprose-company \
  --enable intelligence-daily \
  --enable gtm-pipeline \
  --enable stargazer-daily \
  --env SLACK_BOT_TOKEN=dev \
  --env SLACK_WEBHOOK_URL=dev \
  --env EXA_API_KEY=dev \
  --env REVIEW_CHANNEL=dev \
  --approved-effect delivers \
  --approved-effect human_gate \
  --approved-effect mutates_repo \
  --approved-effect metered \
  --approved-effect writes_memory

bun bin/prose.ts deployment trigger "$STATE" \
  --entrypoint intelligence-daily \
  --approved-effect delivers
```

## Next

Turn trigger records into richer local company smoke evidence: run several
entrypoints, emit compact JSON summaries, and add a repeat/replay check that
shows pointer stability and recompute intent.
