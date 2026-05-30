# Stargazer Outreach

## Quick Start

```bash
prose compile
prose serve
```

## What This Repository Does

Keeps high-intent GitHub stargazers identified, enriched, and ready for
thoughtful OpenProse outreach.

The repository watches for new stars, enriches public GitHub and company
context, qualifies fit, drafts useful sample-program ideas, and prevents
duplicate or generic outreach.

## Source Shape

- `src/`: the `high-intent-stargazer-outreach` responsibility, the
  `github-star-events` gateway, and the helper `function`s it `call`s
- `dist/`: compiled topology + canonicalizers produced by `prose compile`
- `runs/`: append-only receipt ledger
- `state/`: the canonical world-model (stargazer history + outreach state)
- `deps/`: installed OpenProse dependencies
