---
name: surprising-bet
kind: responsibility
---

# Surprising Bet Memo

> The headline maintained artifact: one weird-but-actionable product experiment per
> cycle, plus its cheapest kill test. A mounted `responsibility` composing several
> world-models into one living memo. The promise is not "automatic genius" — it is a
> programmable novelty-pressure system that preserves odd hypotheses long enough to
> test them.

### Requires

- The `oblique-ledger`'s maintained truth, on its **atomic facet** (the exported
  `ATOMIC_FACET` constant — never `"*"`). The memo composes the merged oblique
  threads (and, in a fuller weave, the Falsifier and Experiment Designer notes) into
  a single bet.

When the oblique ledger memo-skips (nothing material moved), the memo is not woken
and the prior bet stands — the same memo hash, no fresh spend.

### Maintains

The `SurprisingBetMemo`, as this responsibility's maintained truth:

- `bet`: the product experiment worth considering.
- `why_it_might_be_true`: evidence-linked rationale drawn from the oblique threads.
- `why_it_might_be_wrong`: the strongest falsifier.
- `kill_test`: the cheapest test that could change the team's mind.
- `thread_count`: how many oblique threads fed this bet.

This is a facet-less producer: it exposes its whole truth on the **atomic facet**.
The render reads the oblique ledger by reference and self-polices these
**postconditions** before signing — there is **no separate judge beat**: the bet
cites the receipts that changed it; a kill test is always present.

### Continuity

input-driven: re-render when the subscribed oblique-ledger receipt moves. Reuse the
prior memo when the input receipt set is unchanged. **Cost scales with surprise** —
a no-change replay preserves the same memo hash at zero fresh.
