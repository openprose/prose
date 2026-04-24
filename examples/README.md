# OpenProse Examples

This is the new curated example set.

The goal is not to show every historical trick OpenProse ever learned. The goal is to show the current model clearly:

- typed contracts
- graph planning
- selective recompute
- run-aware composition
- approval-gated effects
- company-operating-system workflows

## Examples

| Example | What it shows | Good command |
|---|---|---|
| [`hello.prose.md`](hello.prose.md) | smallest useful typed service | `bun run prose compile examples/hello.prose.md` |
| [`selective-recompute.prose.md`](selective-recompute.prose.md) | target-output planning and recompute savings | `bun run prose plan examples/selective-recompute.prose.md --input draft="A stable draft." --input company="openprose"` |
| [`run-aware-brief.prose.md`](run-aware-brief.prose.md) | `run<...>` inputs, access labels, and typed delivery contracts | `bun run prose graph examples/run-aware-brief.prose.md --input company="OpenProse"` |
| [`approval-gated-release.prose.md`](approval-gated-release.prose.md) | unsafe effects and approval gates | `bun run prose plan examples/approval-gated-release.prose.md --input release_candidate="v0.11.0"` |
| [`company-intake.prose.md`](company-intake.prose.md) | a compact company-as-code workflow | `bun run prose graph examples/company-intake.prose.md --input company_domain="openprose.com" --input inbound_note="warm referral"` |

## A Good Tour

If you only read three things, read them in this order:

1. [`hello.prose.md`](hello.prose.md)
2. [`selective-recompute.prose.md`](selective-recompute.prose.md)
3. [`approval-gated-release.prose.md`](approval-gated-release.prose.md)

That gets you from "contract" to "reactivity" to "policy."

## Package Quality

This directory is also a real package root:

```bash
bun run prose package examples
bun run prose publish-check examples --strict
```

That is deliberate. The examples are meant to model best practice, not bypass it.
