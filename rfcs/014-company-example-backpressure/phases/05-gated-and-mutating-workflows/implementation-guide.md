# Phase 05 Implementation Guide

Phase 05 proves effect policy is runtime behavior, not prompt decoration.

## 05.1 `release-proposal-dry-run`

Implementation:

- Add summarizer, proposal, human gate, and digest nodes.
- Model no-release-needed path separately from release-needed path.
- Block gated nodes before Pi session launch.

Tests:

- Release-needed path blocks without approval and creates no Pi session.
- Release-needed path proceeds with approval.
- No-op release skips gate.
- Fabricated SHA seeded-bad case fails.

Commit/signpost:

- `feat: add release proposal dry run example`
- `signposts/023-release-proposal-dry-run.md`

## 05.2 `customer-repo-scaffold-preview`

Implementation:

- Generate scratch workspace files only.
- Treat file writes as declared/performed effects.
- Validate generated package shape.

Tests:

- Produces expected directories.
- Refuses overwrite.
- Old `delivery/` path fails.
- Generated evals compile.

Commit/signpost:

- `feat: add customer repo scaffold preview`
- `signposts/024-customer-repo-scaffold-preview.md`

## 05.3 Effect Policy Backpressure

Implementation:

- Assert approved effects are included in node envelopes.
- Assert performed effects are validated after output submission.
- Make traces show approval provenance.

Tests:

- Undeclared performed effect fails.
- Approved effect succeeds.
- Trace shows approval record.

Commit/signpost:

- `test: harden effect policy backpressure`
- `signposts/025-effect-policy-backpressure.md`
