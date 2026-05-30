---
name: high-intent-stargazer-outreach
kind: responsibility
id: 067NC4KG19TPD9V8D5N6PV3DDR
---

# High-Intent Stargazer Outreach

### Goal

High-intent GitHub stargazers are identified, enriched, qualified, and prepared
for thoughtful OpenProse outreach.

### Requires

- `stargazers`: a current view of new high-intent GitHub stargazers, with the
  repository and source context needed for bounded public enrichment

### Maintains

- `outreach`: per-stargazer truth, with `qualification` and `contact-history`
  facets
- each entry has: login, repository, first seen time, latest evidence, status,
  draft summary, and contact safety notes
- `qualification` facet (material): fit verdict, evidence summary, outreach
  angle, and recommended next action
- `contact-history` facet (material): first seen time, prior contact decisions,
  and duplicate-contact safeguards, preserved across renders
- immaterial: enrichment scan timestamps and source request ids
- postcondition: recommended outreach names a specific workflow the person could
  reuse or adapt — never generic
- postcondition: a stargazer is never contacted twice without new evidence
- postcondition: final send decisions are left to a human owner

### Continuity

- input-driven: new stargazers should be reviewed within one business day of
  first sighting
- self-driven: revisit stale qualified leads when repository, company, or
  project evidence changes materially

### Invariants

- Do not send generic outreach or claim private knowledge.
- Keep enrichment bounded to public, low-cost sources.

### Execution

```prose
let candidates = call collect-new-stargazers
  stargazers: stargazers
  prior-outreach: outreach

let profiles = call enrich-stargazer
  candidate-stargazers: candidates

let leads = call qualify-stargazer
  stargazer-profiles: profiles

let batch = call draft-outreach
  qualified-leads: leads

return { outreach: batch }
```
