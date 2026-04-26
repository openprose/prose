# 001 OpenProse Skill Refresh

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: replace legacy open-prose skill surface`

## Finding

The bundled `skills/open-prose` tree still taught the old model: agents were
asked to simulate the VM, maintain hand-authored filesystem state, and route
through historical command/provider concepts. Because this directory is linked
from the README and Claude plugin metadata, it was a high-risk public confusion
point.

## What Changed

- Replaced the large historical skill tree with a small current
  `SKILL.md` and `README.md`.
- Updated the skill to describe `.prose.md`, IR, Pi as the graph VM, model
  providers inside the Pi runtime profile, durable run records, evals, package
  metadata, and hosted-compatible envelopes.
- Updated Claude command docs to route through the repository CLI instead of
  instructing the model to become the VM.
- Updated plugin metadata, repository onboarding, and the README repository map
  to use current terminology.

## Tests Run

- `rg -n 'Prose Complete|state\\.md|harness-agnostic|--provider|fixture materialize|prose materialize|You ARE the OpenProse VM|ProseScript|Contract Markdown|embody' skills/open-prose commands AGENTS.md README.md .claude-plugin`
- `bun test test/source-tooling.test.ts test/cli-ux.test.ts`
- `bun run prose lint examples/north-star/company-signal-brief.prose.md`
- `bun run prose preflight examples/north-star/lead-program-designer.prose.md`
- `bun run prose run examples/north-star/company-signal-brief.prose.md --graph-vm pi --input signal_notes="A customer asked for durable agent workflows." --input brand_context="OpenProse helps teams compose typed agent outcomes." --output company_signal_brief="Signals noted." --run-root /tmp/openprose-skill-docs-smoke --run-id skill-docs-smoke`
- `bun run typecheck`
- `git diff --check`

## Result

- Active skill/plugin/command docs no longer contain the old VM phrases from
  the hardening scan.
- Focused CLI/source tooling tests passed.
- The example commands embedded in the skill passed.
- Typecheck and diff check passed.

## Next Slice

Move to the next public hardening item: historical RFC notes that still read
like future implementation guides, or generated measurement reports with local
absolute paths.
