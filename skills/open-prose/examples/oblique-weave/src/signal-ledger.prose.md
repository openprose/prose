---
name: signal-ledger
kind: responsibility
---

# Signal Ledger

> A mounted `responsibility` that dedupes the raw product signals into a stable,
> fingerprinted set — the single source of truth the Viewport Policy masks for the
> roles. It `### Requires` the Product Signal Inbox, `### Maintains` its own
> world-model, and declares its `### Continuity`.

### Requires

- The `signals` (Product Signal Inbox) gateway's maintained truth, subscribed on
  its **atomic facet** (the exported `ATOMIC_FACET` constant). The ledger reads
  the incoming `anomalies` by reference.

Subscribing to the atomic facet means: the ledger is woken exactly when the inbox
truth moves, and never on a quiet re-wake. When the inbox memo-skips, nothing
propagates, so the ledger is not even woken — it spends **zero fresh**.

### Maintains

The deduped anomaly set, as this responsibility's maintained truth:

- `items`: the distinct anomalies, keyed by `id`, sorted for a stable fingerprint.
- `item_count`: how many distinct anomalies are live.

This is a facet-less producer: it exposes its whole truth as the single atomic
facet (never `"*"`). The render reads its prior truth **by reference** and
self-polices these **postconditions** before signing — there is **no separate
judge beat**:

- repeated evidence (the same `id`) is deduped, so a re-delivery of an already-seen
  anomaly does not move the fingerprint;
- the item set is sorted deterministically so the fingerprint is replayable.

### Continuity

input-driven: the ledger re-renders when the inbox truth moves. Dedupe repeated
evidence so noisy re-deliveries memo-skip. **Cost scales with surprise.**
