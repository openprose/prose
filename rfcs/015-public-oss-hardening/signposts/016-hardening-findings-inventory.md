# Signpost 016: Hardening Findings Inventory

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

## What Changed

- Added `rfcs/015-public-oss-hardening/FINDINGS.md` as the stable inventory
  for public OSS hardening issues.
- Updated `TODO.md` to point at the findings inventory and promoted newly
  discovered issues into the execution queue:
  - changelog drift
  - skill/command sidecar drift
  - root package publication ambiguity
  - old materializer public API seam
  - runtime-profile preflight gap
  - Pi session persistence visibility
  - named schema-definition enforcement
  - stdlib control/composite semantics
  - provider-to-node-runner vocabulary cleanup

## Validation

- Broad scan with `rg` across `src`, `test`, `docs`, `commands`, `skills`,
  `packages`, and RFCs for stale runtime/provider/materializer language.
- Manual inspection of:
  - `CHANGELOG.md`
  - `skills/README.md`
  - `commands/`
  - `src/materialize.ts`
  - `src/runtime/profiles.ts`
  - `src/node-runners/*`
  - `src/preflight.ts`
  - `packages/std/README.md`
  - `packages/co/README.md`

## Next

- Resume implementation from the TODO queue, starting with the highest
  confusion-reduction items before deeper runtime refactors.
- The likely next slice is changelog plus skill/command sidecar cleanup because
  it is low-risk and keeps public agent entry points aligned.
