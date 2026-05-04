# OpenProse Examples

These examples are small OpenProse Native Repositories. Each one models a real
standing goal with source in `src/`, compiled intent in `dist/`, runtime
receipts in `runs/`, durable state in `state/`, and dependencies in `deps/`.

## Examples

- [stargazer-outreach](./stargazer-outreach/) keeps high-intent GitHub
  stargazers enriched and ready for thoughtful follow-up.
- [incident-briefing-room](./incident-briefing-room/) keeps an incident channel
  briefed with sourced status, impact, and next actions.
- [customer-risk-radar](./customer-risk-radar/) keeps customer risk visible
  before renewals or escalations surprise the team.
- [release-readiness](./release-readiness/) keeps a release candidate ready to
  ship with evidence, risks, and rollback notes.
- [vendor-renewal-watch](./vendor-renewal-watch/) keeps vendor renewals
  prepared before auto-renewal or negotiation windows close.
- [research-inbox-triage](./research-inbox-triage/) keeps a research inbox
  deduplicated, prioritized, and converted into action.
- [content-performance-loop](./content-performance-loop/) keeps content
  performance learnings flowing into next actions.
- [compliance-evidence-tracker](./compliance-evidence-tracker/) keeps audit
  evidence fresh, reviewed, and gap-aware.

## Quick Start

Open one example directory, then compile and serve it:

```bash
cd skills/open-prose/examples/stargazer-outreach
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose serve
```

Each example README explains the standing goal, source layout, and what to try.
