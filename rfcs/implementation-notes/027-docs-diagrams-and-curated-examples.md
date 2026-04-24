# 027: Docs, Diagrams, and Curated Examples

## What shipped

This wave turned the repo from "advanced internals with a stale public face"
into a coherent public surface:

- replaced the root README with the current local-first/reactive story
- added `docs/README.md`, `docs/why-and-when.md`, and `docs/what-shipped.md`
- added HTML diagrams under `docs/diagrams/`
- deleted the legacy `skills/open-prose/examples/` tree
- replaced it with a new root `examples/` package
- updated `skills/`, `help.md`, `SKILL.md`, `packages/std`, `packages/co`,
  and `commands/prose-boot.md` to point at the new surfaces

## Why it matters

OpenProse had outgrown the original "skill bundle with many examples" shape.
The runtime, package, graph, and hosted surfaces were real, but the public docs
still taught the older world. This wave makes the visible shape of the repo
match the actual product.

## Verification

- `bun run prose compile examples/hello.prose.md`
- `bun run prose plan examples/approval-gated-release.prose.md --input release_candidate="v0.11.0"`
- browser DOM preview of `docs/diagrams/index.html`

## What is next

The next obvious docs/product work is not more prose volume. It is:

- hardening `packages/std` toward the same package quality standard as
  `examples`, `co`, and the reference company
- folding measurement outputs into richer docs and hosted dashboards
