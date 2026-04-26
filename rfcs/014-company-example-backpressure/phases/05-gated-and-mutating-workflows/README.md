# Phase 05: Gated And Mutating Workflows

Goal: pressure effects, approvals, and controlled mutation without touching real
repositories or production systems.

## 05.1 Implement `release-proposal-dry-run`

Build:

- Add a dry-run release graph based on `release-on-demand` and
  `openprose-release`.
- Inputs are git/change fixtures, not live git commands.
- Model a release-needed path and a no-release-needed path.
- Gate any release-needed path before publish/digest nodes.

Tests:

- Release-needed case blocks without approval.
- Release-needed case proceeds with approval.
- No-op release skips the gate and returns `not_required`.
- Seeded fabricated SHA fails.
- Low changelog coverage fails.
- Run `bun run typecheck`.
- Run focused tests and full `bun test`.

Commit:

- Commit as `feat: add release proposal dry run example`.

Signpost:

- Add `signposts/023-release-proposal-dry-run.md` with approval behavior.

## 05.2 Implement `customer-repo-scaffold-preview`

Build:

- Add a scratch-workspace scaffold example based on `gtm-pipeline` and
  `customer-repo-scaffolder`.
- Use pre-enriched profile and Save/Grow program fixtures.
- Write generated files into a temp workspace during tests.

Tests:

- Produces `README.md`, `responsibilities/`, `services/`, `workflows/`, and
  `evals/`.
- Refuses to overwrite an existing slug.
- Seeded output using old `delivery/` directory fails.
- Eval files compile.
- Generated package passes local package checks where feasible.
- Run `bun run typecheck`.
- Run focused tests and full `bun test`.

Commit:

- Commit as `feat: add customer repo scaffold preview`.

Signpost:

- Add `signposts/024-customer-repo-scaffold-preview.md` with temp workspace
  output tree.

## 05.3 Harden Effect Policy Backpressure

Build:

- Ensure gated/mutating examples fail before Pi session launch when approvals
  are missing.
- Ensure approved effects are visible in Pi prompts/tool context.
- Ensure performed effects are validated against declarations.

Tests:

- Missing approval does not create a Pi session.
- Undeclared performed effect fails even if outputs are present.
- Trace shows the approval record used.
- Run `bun run typecheck`.
- Run focused policy/runtime tests and full `bun test`.

Commit:

- Commit as `test: harden example effect policy`.

Signpost:

- Add `signposts/025-effect-policy-backpressure.md`.
