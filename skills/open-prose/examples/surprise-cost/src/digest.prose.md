---
name: digest
kind: responsibility
version: 0.15.0
---

# Digest

> The headline standing responsibility: a cron-replacement digest that re-writes
> its brief **only when the upstream signal actually moves**. It is a mounted
> `responsibility` — `### Requires` an upstream truth, `### Maintains` its own
> world-model, and declares its `### Continuity`.

### Requires

- The `signals` gateway's maintained truth, subscribed on its **atomic facet**
  (the exported `ATOMIC_FACET` constant). The digest reads the upstream
  `headline` by reference.

Subscribing to the atomic facet means: the digest is woken exactly when the
gateway's truth moves, and never on a quiet re-wake. When the gateway memo-skips,
nothing propagates, so the digest is not even woken — it spends **zero fresh**.
This is the memo key at work: a node renders **if and only if** its memo key
`(contract_fingerprint, input_fingerprints)` moved.

### Maintains

The current brief, as this responsibility's maintained truth:

- `brief`: the digest line restating the upstream headline.
- `source_epoch`: the gateway epoch this brief was derived from.

This is a facet-less producer: it exposes its whole truth as the single atomic
facet (never `"*"`). The render reads its prior truth **by reference** and
self-polices these **postconditions** before signing — there is **no separate
judge beat**:

- the `brief` restates the current upstream `headline` (it is never stale);
- `source_epoch` equals the gateway `epoch` the brief was derived from.

### Execution

Inside the node, composition is imperative — the digest calls its stateless
helper:

1. Read the upstream `signals` truth by reference (`headline`, `epoch`).
2. `call render-digest-line` with that `headline` and `epoch`.
3. Maintain the returned `{ brief, source_epoch }` as the new truth.

### Continuity

input-driven: the digest re-renders when its required upstream truth moves. A
self-recheck (a `self`-sourced tick) that finds no material move writes an
unmoved fingerprint and **stops** — a `skipped` receipt that spawns nothing.

The cost meter tells the whole story: a quiet re-wake costs nothing (the skip
carries `fresh: 0`); a real change to the upstream contract or truth renders the
digest and the brief re-writes once. **Cost scales with surprise.**
