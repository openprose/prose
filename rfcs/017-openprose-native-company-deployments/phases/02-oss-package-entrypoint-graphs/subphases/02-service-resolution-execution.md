# 02.2 Service Resolution And Execution Edges

## Build

- Promote package service references into executable graph edges.
- Preserve source maps from workflow service declaration to resolved component.
- Treat ambiguous service references as blockers for deployment execution.
- Add explicit tie-breaker support if needed through manifest entrypoint config
  or accepted wiring proposals.

## Tests

- No unresolved service references for selected reference-company workflows.
- Ambiguous service references block with actionable diagnostics.
- Cross-system shared adapters resolve through package dependencies or package
  graph resources.
- Run `bun run prose publish-check /Users/sl/code/openprose/customers/prose-openprose --strict`.

## Commit

Commit as `fix: resolve package service execution edges`.

## Signpost

Record service edge counts and any remaining ambiguity.

