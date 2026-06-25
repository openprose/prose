# Maintainer Docs

This directory is for maintainers and runtime integrators. It is not the user manual.

User-facing entry points live at the repository root:

- `README.md` for installing and using `openprose-lint`
- the root `CHANGELOG.md` for monorepo release history
- `CHANGELOG.md` in this crate for crate-user details
- `CONTRIBUTING.md` for contributor workflow

Agent-facing repo instructions live in `AGENTS.md` files. Machine-readable contracts live under `specs/`.

## Active Documents

- `doctrine.md` - the boundary between mechanistic conformance claims and semantic OpenProse claims
- `spec-integration.md` - how this linter gates the colocated `openprose/prose` language source, including the public command-surface contract
- `adapting-and-self-verifying-a-runtime.md` - practical runtime adapter and dogfood workflow
- `specs/2026-04-08-preflight-briefing-design.md` - deterministic VM briefing schema, including service-resolution and diagnostic-summary contracts
- `specs/2026-04-15-runtime-conformance-model.md` - runtime capability vocabulary and conformance model
- `specs/2026-04-16-adapter-manifest-model.md` - adapter initialization manifest model

## Specs Are Accepted Contracts

Every document in `docs/specs/` is an accepted, in-force design contract. There is
no in-tree draft or lifecycle status: a spec file lives here only once its model is
implemented and gated by `bash scripts/lint-prose.sh`. Proposals stay on a branch or PR until
merged - merging *is* acceptance.

Do not add `Status:`, `Draft`/`Approved`, or similar lifecycle labels to these
files. An unenforced status claim drifts from reality - two specs once sat at
`Status: Draft` while their models had already shipped and were gated - so
the local lint gate fails if such a label reappears under `docs/specs/`. Specs evolve
only through the release choreography in `spec-integration.md`; superseded specs and
their implementation plans are deleted, not archived (see the Retention Rule below).

## Retention Rule

Keep stable design contracts and repeatable maintainer workflows here.

Do not keep completed implementation plans, stale migration notes, or agent-only rationale in `docs/`. Delete stale files and keep this directory focused on stable maintainer-facing contracts.
