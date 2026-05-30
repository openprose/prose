# OpenProse Examples

These examples are small OpenProse Native Repositories. Each one models a real
standing goal as a mounted `responsibility` — the headline kind — that maintains
a world-model, with cross-node helper `function`s it `call`s and a `gateway`
that brings outside events in. Source lives in `src/`, the compiled topology and
per-node canonicalizers in `dist/`, runtime receipts in `runs/`, the canonical
world-model in `state/`, and dependencies in `deps/`.

Each responsibility declares what it subscribes to (`### Requires`), the shape of
the truth it keeps current (`### Maintains`), and its wake-source
(`### Continuity`: input-driven, self-driven, or external-driven). Forme wires
the `### Requires` ↔ `### Maintains` edges at compile time; the dumb reconciler
skips a render when neither the contract nor any subscribed input fingerprint
moved — so cost scales with surprise, not the clock.

## Examples

- [competitor-activity](./competitor-activity/) is the canonical **named-parts
  (facet)** example: one `### Maintains` declares `#### funding`, `#### hiring`,
  and `#### product-launches` as independently-subscribable facets, so a
  downstream wakes only when the part it watches moves.
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
- [session-to-prose](./session-to-prose/) turns local Claude Code, Codex, or
  Pi agent session logs into reusable OpenProse programs with auditable
  receipts.
- [auto-pocock](./auto-pocock/) chains Matt Pocock's published engineering
  skills (grill-with-docs, to-prd, to-issues, tdd, plus his per-repo
  conventions) into a single non-interactive OpenProse system, with the
  two-step grill-and-decide split called out as an OpenProse adaptation.
- [declared-skills](./declared-skills/) shows a minimal `### Skills`
  requirement that fails closed at compile time when the host skill is missing.
- [declared-tools](./declared-tools/) shows a minimal `### Tools` requirement
  that fails closed at compile time when the host CLI executable is missing.

## External Examples

These examples live in separate repos when they depend on product-specific
source code or should keep their own release cadence.

- [grant-radar](https://github.com/openprose/grant-finder/tree/main/examples/openprose)
  demonstrates an OpenProse system that drives the public
  [`grant-finder`](https://github.com/openprose/grant-finder) CLI to produce
  source-cited non-dilutive funding reports for research labs, startups, and
  technical teams. The `grant-finder` repo remains the source of truth for that
  example.

## Quick Start

Open one example directory, then compile and serve it. `prose compile` is the
only intelligent phase — it runs Forme to wire the responsibility DAG and lowers
each `### Maintains` into a deterministic canonicalizer; `prose serve` runs the
dumb reconciler over that frozen output.

```bash
cd skills/open-prose/examples/stargazer-outreach
prose compile
prose serve
```

Each example README explains the standing goal, source layout, and what to try.
