---
role: reactor-semantics
summary: |
  The dumb reconciler: the run-phase reactive model for OpenProse. Read this
  file when designing wake sources, fingerprint comparison, propagation, or the
  compile/run split. The world-model is the DOM; subscriptions are props; the
  receipt is setState; this reconciler is the runtime.
see-also:
  - ../responsibility-runtime.md: Compile/run split and layer boundaries
  - responsibility.md: Responsibility as a mounted reactive node
  - ../prose.md: Bounded render harness semantics
  - ../forme.md: Compile-phase wiring into the topology world-model
---

# Reactor

Reactor is the run-phase reactive model for OpenProse. It is **dumb on
purpose**: all of the intelligence lives in the compile phase, and the
reconciler only compares fingerprints and propagates.

The mental model is React, made durable:

| React | Reactor |
|-------|---------|
| the DOM | the **world-model** (a node's maintained truth) |
| props | **subscriptions** (`### Requires.<facet>` ↔ `### Maintains.<facet>`) |
| `setState` / a committed render | the **receipt** (the signed commit object) |
| the runtime / scheduler | the **reconciler** (compare, skip, schedule, propagate) |
| `Object.is` deps comparison | **fingerprint** comparison (dumb, total) |
| which values you list in deps | the **canonicalizer** (compiled once, ahead of time) |

It replaces a task-loop mindset with one question:

> Given the latest receipt and the prior world-model, did any subscribed input
> fingerprint move — and if so, what is the new truth?

## Two phases: intelligent compile, dumb run

The spine is a single cleavage:

- **Compile phase — intelligent, fires only when the *contract set* changes.**
  It lowers natural-language declarations into deterministic artifacts: the
  resolved DAG (Forme's topology world-model), the per-node **canonicalizers**
  (`canonicalizer(world-model) → fingerprints`), and the per-node
  **postcondition validators**. Intelligence decides *what counts as a change*
  here, once, and freezes it. This is the rarest event — surprise decays with
  height.
- **Run phase — dumb, fires on every wake.** The reconciler compares
  fingerprints, skips the unchanged, schedules, commits, and propagates. Zero
  intelligence. An LLM never decides "did this change" at run time; that would
  put intelligence in the layer we keep dumb.

So: intelligence decides what a change *is* once, at compile time;
determinism checks whether one *happened* every time, at run time.

## The render atom

The unit both phases agree on is:

```text
(contract, evidence, prior world-model) -> (new world-model, receipt)
```

A render is one bounded LLM session running ProseScript. It reads the evidence
the wake delivered and queries the prior world-model **by reference** (it is
told where the canonical truth lives; it is never pre-stuffed into context),
writes the updated world-model, and signs a **receipt** carrying the new
fingerprints. It applies its compiled canonicalizer locally, so fingerprinting
works even standalone, with no harness present.

Node-ness comes from **mounting** (being a subscribable producer in the DAG),
never from holding state. Internal memory — reading one's own prior
world-model — is orthogonal; it does not put a node in the graph.

## Wake: one event, three sources

Every wake is a **receipt arrived**. The reconciler only ever observes that one
event; the only variable is *who emitted it* — the wake's `source`:

| Source | Who emitted the waking receipt |
|--------|--------------------------------|
| `input` | an upstream node's receipt whose subscribed facet fingerprint moved (the default) |
| `self` | the node's own continuity clock, emitting a synthetic self-receipt (a tick) |
| `external` | a gateway turning a webhook / cron / manual trigger into an edge receipt |

`### Continuity` declares which sources may wake a node. The synthetic
self-receipt is what lets self-driven and external-driven cadences ride the
same propagation path as ordinary upstream changes — there is no special clock
path in the reconciler.

## The reconcile loop

```text
receipt arrives (input | self | external)
  -> compute memo key = (contract_fingerprint, input_fingerprints)
  -> neither half moved since last receipt?  ->  write skipped receipt, spawn nothing
  -> otherwise spawn one render against the freshly-moved inputs
  -> render writes world-model + signs receipt (rendered | failed)
  -> rendered with a moved fingerprint?  ->  wake downstreams subscribed to the moved facet(s)
```

**Memo / skip.** The key is `(contract_fingerprint, input_fingerprints)` —
nothing else. No judge, no policy artifact, no evidence-receipt list. If neither
the node's own contract nor any subscribed input moved since its last receipt,
the reconciler writes a cheap `skipped` receipt and spawns nothing.

**Single-flight + coalescing.** One render in flight per node — forced by the
model, since a render reads its own prior world-model and appends to its own
ledger. Wakes arriving mid-render do not stack into N more renders; they mark
the node *dirty* and collapse into **one** follow-up render against the
freshly-moved inputs. This is React's batching: five inputs moving mid-render
cost one follow-up render, not five.

**Propagate.** On a `rendered` receipt whose fingerprint moved, the reconciler
wakes the downstreams subscribed to the moved facet(s), resolved by reading the
topology world-model's `edges`. A downstream subscribed to facet *X* does not
wake when facet *Y* moves — facets are React selectors; atomic-only is one giant
context value.

## Fingerprints: how "changed" is decided

A **fingerprint** is a cheaply computed token that changes if and only if the
semantically-relevant content changed. That invariant is the whole definition;
*how* it is computed (digest, high-water mark, revision counter) is a swappable
convention. The reference convention is a content digest over the canonical
serialization.

Three fingerprints of meaning chain through the system:

| Fingerprint | Of what | Answers |
|-------------|---------|---------|
| **contract-fingerprint** | the node's own contract/source | which version produced this |
| **input-fingerprint** | each upstream facet the node subscribes to | did the watched thing change |
| **world-model-fingerprint** | the node's own published truth (+ a token per facet) | the identity downstreams subscribe to |

A node's world-model-fingerprint is published in its receipt; a downstream sees
that as one of its input-fingerprints. The comparison is dumb, deterministic,
and total — exactly `Object.is` against the compiled deps. "Material" was
*frozen by intelligence at compile time, not judged at wake time.*

**Structured-backing rule.** Anything *subscribed* must have a structured,
canonicalizable backing. Free-form rendered prose is a derived projection
excluded from the fingerprint — otherwise an LLM re-rendering the same paragraph
hashes differently every time and falsely re-triggers downstreams. Fingerprint
the structured truth; render prose *from* it.

## The receipt: the single commit object

The receipt is `setState`: the wake event, the memo-key record, the audit
entry, and the trust artifact, all in one. It is the unit of the append-only
ledger — a node's durable memory. Its fields:

| Field | Meaning |
|-------|---------|
| `node` | the node's identity (the ledger is node-scoped) |
| `contract_fingerprint` | which contract version produced this |
| `wake` | the wake's `source` (`input` / `self` / `external`) + refs to the waking receipt(s)/tick |
| `input_fingerprints` | the consumed tuple, one per subscribed facet — the memo key's second half |
| `fingerprints` | a `{ facet → token }` map of the published truth; the reserved **atomic** facet is the whole-truth token |
| `semantic_diff` | render-input context ("3 controls went stale") — never a wake signal |
| `prev` | pointer to the prior receipt (chains the ledger) |
| `status` | `rendered` \| `skipped` \| `failed` |
| `cost` | mechanical token attribution — makes "cost scales with surprise" observable |
| `sig` | v1 meaning-layer attestation; the `signer` is an explicit null state |

**Only `rendered` with a moved fingerprint propagates.** A `skipped` receipt
copies the unchanged `fingerprints` forward and stops there. The wake decision
is fingerprint-only; the `semantic_diff` is render *input*, never a wake signal.

## Failure and freshness

**Failure.** A render that errors or leaves a `### Maintains` postcondition
unsatisfied commits nothing to the published world-model — the last-good truth
stands. It writes a `status: failed` receipt (failures are cheap audit signal,
not silence). Downstreams do not wake: the fingerprint did not move, so to the
dumb reconciler nothing changed. Retry needs no special machinery — the next
upstream receipt or the `### Continuity` self-tick re-attempts.

**Freshness.** Freshness *state* (`valid_until`, `last_corroborated`,
`confidence`) lives in the world-model as data. Freshness *policy* (the recheck
cadence) lives in `### Continuity`. The bridge: a `valid_until` lapsing flips a
fact's status, which moves that facet's fingerprint — so "time becoming
material" is just another change that propagates as surprise. For the silent
case the moving is triggered by the self-driven tick.

## What this is not

There is **no judge** in the wake or commit decision, **no status enum**
(`up`/`drifting`/`down`/`blocked`), **no pressure record**, and **no separate
fulfillment activation**. Commit-gating is compiled postcondition validators
(verified on commit) plus render self-attestation (for irreducibly semantic
conditions). The judge → verdict → pressure → fulfillment loop is the retired
model; do not reintroduce it.
