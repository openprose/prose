# Signpost 002: OSS Entrypoint Discovery And Deployment Preflight

## Summary

Completed the rest of Phase 01:

- package-level entrypoint discovery can be called directly
- `prose.package.json` can optionally provide explicit deployment entrypoint
  metadata
- deployment manifests include package dependencies
- deployment preflight now reports environment bindings, dependency install
  status, effect-policy status, trigger proposals, and dry-run warnings
- the reference company package preflights the target workflows in dev-safe mode

Reference company dry-run preflight with bindings:

- `openprose-company`: ready
- `intelligence-daily`: ready
- `stargazer-daily`: ready
- `gtm-pipeline`: ready
- dependency `github.com/openprose/prose`: pinned and installed
- effects held in dry-run: `delivers`, `human_gate`, `metered`,
  `mutates_repo`, `read_external`, `writes_memory`

## Test Notes

Passed:

```bash
bun run typecheck
bun test
bun run prose package examples --format json --no-pretty
bun run prose package /Users/sl/code/openprose/customers/prose-openprose --format json --no-pretty
bun bin/prose.ts deployment /Users/sl/code/openprose/customers/prose-openprose \
  --format json --no-pretty \
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
  --env REVIEW_CHANNEL=dev
```

## Next

Begin Phase 02 by adding package-level graph planning for deployment
entrypoints. The immediate target is that `gtm-pipeline` and
`intelligence-daily` plan against the full package graph rather than appearing
to have unresolved services under single-file graphing.
