# Meta-Operation Proposals Slice

**Date:** 2026-04-25
**Phase:** 02.5 Add Meta-Operation Proposal Records

OpenProse can now represent intelligent meta-operations as durable proposal
records instead of invisible runtime guesses.

## Shape

`MetaOperationProposalIR` covers:

- `intelligent_wiring`
- `contract_repair`
- `missing_metadata`
- `eval_generation`
- `failure_diagnosis`

Every proposal has:

- stable id and version
- state: `pending`, `accepted`, or `rejected`
- title, rationale, evidence, and decision metadata
- a typed payload

Accepted proposals can be passed into `compilePackagePath(path, { proposals })`.
Only accepted proposals become part of package IR:

```ts
package_ir.meta.accepted_proposals
```

Pending and rejected proposals remain outside source and outside package IR
unless a user explicitly accepts or applies them.

## Deterministic Graph Input

Accepted `intelligent_wiring` proposals with `graph_wiring` payloads add graph
edges during package graph normalization. The edge is marked with
`source: "wiring"` and its reason references the accepted proposal id.

Because accepted proposals are included in package semantic projection, accepting
a proposal changes `semantic_hash`. This makes the accepted intelligent decision
auditable and replayable.

## Current Gaps

- There is no CLI command yet for reading, accepting, rejecting, or applying
  proposal files. For now this is a library-level contract for the future
  meta-harness.
- Accepted wiring validates component endpoints but does not yet validate port
  type compatibility. Phase 06 should connect proposals to schema/type checks.
- Contract repair, missing metadata, eval generation, and failure diagnosis are
  durable record shapes only. The harness prompts and review UX that produce
  them belong in later runtime/provider phases.
