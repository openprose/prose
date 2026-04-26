# Signpost 003: OSS Package Entrypoint Graphs

## Summary

Completed Phase 02:

- added a package-level deployment graph planner
- added `prose deployment plan <package-root> --entrypoint <component>`
- added `prose deployment graph <package-root> --entrypoint <component>`
- kept single-file `plan`/`graph` intact for isolated component development
- planned package entrypoints over resolved package execution edges
- returned JSON stable enough for platform ingestion plus concise text/mermaid
  local views

Reference-company evidence:

- `intelligence-daily` plans ready with six package nodes:
  `intelligence-daily`, `competitor-intelligence`, `mention-intelligence`,
  `competitor-tracker`, `mention-aggregator`, and `platform-scanner`
- `gtm-pipeline` plans ready with required inputs and effect approvals, over
  twelve package nodes including lead enrichment, program design, enrichment,
  eval writing, directory building, and customer repo scaffolding
- `gtm-pipeline` blocks cleanly when required inputs or effect approvals are
  missing

## Test Notes

Passed:

```bash
bun test test/deployment.test.ts
bun run typecheck
bun run confidence:runtime
bun run prose publish-check /Users/sl/code/openprose/customers/prose-openprose --strict --format json --no-pretty

bun bin/prose.ts deployment plan /Users/sl/code/openprose/customers/prose-openprose \
  --entrypoint intelligence-daily \
  --approved-effect delivers \
  --format json --no-pretty

bun bin/prose.ts deployment plan /Users/sl/code/openprose/customers/prose-openprose \
  --entrypoint gtm-pipeline \
  --approved-effect human_gate \
  --approved-effect mutates_repo \
  --approved-effect metered \
  --approved-effect writes_memory \
  --approved-effect delivers \
  --input query='OpenProse prospects' \
  --input query_type='company' \
  --input brand_context='OpenProse agent OS' \
  --format json --no-pretty
```

## Next

Begin Phase 03 by adding a local deployment store and run loop. The immediate
target is to persist deployment manifests, current pointers, package plans, and
dry-run workflow results under a deployment state root rather than one-off run
directories alone.
