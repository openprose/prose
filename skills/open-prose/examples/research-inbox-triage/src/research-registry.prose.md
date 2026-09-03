---
name: research-registry
kind: gateway
version: 0.18.0
---

# Research Registry

> The human-maintained side of triage: the team's active research questions and
> the roster of people who can accept follow-up. Both are edited outside the
> graph, so they enter it through a gateway — no `### Requires`, the latest
> registry as `### Maintains`, and an **external-driven** `### Continuity`. The
> two facets keep a roster change from re-ranking the inbox: priority reads
> `#### active-questions`, assignment reads `#### available-owners`.

### Continuity

- external-driven

### Receives

- Edits to the team's research-questions document: a question opened, closed,
  or re-scoped
- Edits to the owner roster: a person or role added, removed, or marked
  unavailable
- Local event: registry file saved

### Maintains

The current registry as structured truth. Edit timestamps and editor identities
are immaterial; a save that changes no question or owner moves no facet, so
triage does not re-run for a cosmetic edit. Each `####` part below is a facet:
its name is the fingerprint unit, the subscription symbol
`research-inbox-responsibility` names in `### Requires`, and the
`published/<facet>/…` subtree.

#### active-questions

The research questions, initiatives, and watch areas that should influence
priority. Material: the question set (unordered) and each question's id, title,
scope, and status; wording edits that keep the scope are immaterial.

#### available-owners

The people or roles who can accept follow-up work. Material: the owner set
(unordered) and each owner's id, role, and availability.

### Emits

- research-inbox-responsibility

### Payload

Pass the full current registry — every active question and every available
owner — as the incoming truth; the registry is small enough that a
whole-registry delivery is the normal shape.
