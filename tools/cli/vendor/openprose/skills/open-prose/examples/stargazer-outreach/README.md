# Stargazer Outreach

## Quick Start

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose serve
```

## What This Repository Does

Keeps high-intent GitHub stargazers identified, enriched, and ready for
thoughtful OpenProse outreach.

The repository watches for new stars, enriches public GitHub and company
context, qualifies fit, drafts useful sample-program ideas, and prevents
duplicate or generic outreach.

## Source Shape

- `src/`: responsibility, gateway, fulfillment system, and services
- `dist/`: compiled intent produced by `prose compile`
- `runs/`: bounded activation receipts
- `state/`: durable stargazer history and outreach state
- `deps/`: installed OpenProse dependencies
