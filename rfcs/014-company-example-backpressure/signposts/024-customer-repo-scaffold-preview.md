# 024 Customer Repo Scaffold Preview

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: add customer repo scaffold preview`

## What Changed

- Added `test/customer-repo-scaffold-preview-example.test.ts`.
- The focused test uses a custom Pi-shaped runtime provider that:
  - returns a structured `customer_repo_plan`
  - writes a real package-shaped customer repo into the preview writer's node
    workspace
  - returns `customer_repo_preview` with file paths, byte counts, and SHA-256
    hashes
  - refuses to overwrite an existing customer slug
- Expanded the north-star scripted scenario preview output so it advertises the
  full expected tree instead of only two files.

## Scratch Workspace Output Tree

The generated preview contains:

- `README.md`
- `prose.package.json`
- `responsibilities/intake.prose.md`
- `services/lead-intake.prose.md`
- `workflows/save-grow.prose.md`
- `evals/intake.eval.prose.md`

The test then verifies:

- every previewed file exists in the scratch workspace
- every previewed file includes a SHA-256 hash
- the generated eval compiles
- the generated package has the expected components
- strict publish checks pass for the generated package

## Mutation Backpressure

- Missing `mutates_repo` approval blocks the graph before any Pi session starts.
- An existing `acme-robotics` slug causes the preview writer node to fail and
  produces no graph outputs.
- A seeded preview with deprecated `delivery/` paths is rejected by the required
  eval.

## Why It Matters

This slice makes the scaffold example materially different from a JSON mock. It
uses the runtime's scratch workspace as the mutation boundary and then validates
that the resulting files are real OpenProse package material.

## Tests Run

- `bun test test/customer-repo-scaffold-preview-example.test.ts test/north-star-scripted-scenarios.test.ts test/examples-tour.test.ts`
- `bun run typecheck`
- `bun test`

## Tests Not Run

- `bun run measure:examples`; package/source metadata did not change in this
  slice.

## Next Slice

Phase 05.3 should harden effect policy backpressure across examples: approved
effects in node envelopes, undeclared performed effect failure, and approval
provenance in traces.

## Design Learnings

- The right abstraction for scaffold tests is a provider-owned scratch
  workspace, not runtime-native scaffolding. OpenProse should constrain and
  record the mutation boundary, while the agent/harness owns the actual file
  authoring.
- Strict package checks are a useful backpressure layer for generated company
  repos. They catch whether a scaffold is truly usable rather than merely
  shaped like a file list.
