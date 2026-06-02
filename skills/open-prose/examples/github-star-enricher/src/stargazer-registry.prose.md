---
name: stargazer-registry
kind: responsibility
---

# Stargazer Registry

> The headline standing responsibility that dedupes star events and decides, per
> stargazer, whether they advance into enrichment. It is a mounted
> `responsibility` — it `### Requires` the gateway truths, `### Maintains` the
> per-user registry, and declares its `### Continuity`.

### Requires

- The `star-events` gateway's maintained truth, subscribed on its **atomic facet**
  (the exported `ATOMIC_FACET` constant). The registry reads the latest stargazer
  batch by reference.
- The `human-review-events` gateway's maintained truth, on its **atomic facet** —
  so a `suppress` or `sent` mark retracts eligibility.

### Maintains

The registry, keyed by stargazer login, as this responsibility's maintained
truth. The render reads its prior truth **by reference** and self-polices these
**postconditions** before signing — there is **no separate judge beat**:

- a stargazer that is suppressed or already contacted is **not** advanced into
  enrichment without new evidence (prefer false negatives over spam);
- the high-water cursor advances so a re-poll of the same page dedupes.

Its canonicalizer exposes **one eligibility facet per user**, so a change to one
stargazer's eligibility wakes only that stargazer's lane:

#### eligible:<login>

The fingerprint of a single user's eligibility decision. Each per-user
`github-footprint-mapper` subscribes to **only its own** `eligible:<login>` facet
— the per-person fan-out: many stargazers progress independently, and a change to
one never wakes the others.

### Continuity

input-driven: the registry re-renders when the star batch or the review ledger
moves. A re-poll that carries a byte-identical set of stars and no new review
action moves nothing, so the memo key is a **hit** and the registry memo-**skips**
— a `skipped` receipt that spawns nothing. **Cost scales with surprise.**
