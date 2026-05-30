---
role: responsibility-semantics
summary: |
  Semantic contract for `kind: responsibility` files. A responsibility is a
  mounted reactive node: a standing truth it keeps current in a world-model,
  woken over time. Read this file when authoring, reviewing, or compiling
  responsibility-oriented OpenProse source.
see-also:
  - ../responsibility-runtime.md: Compile/run split and layer boundaries
  - reactor.md: The dumb reconciler — wake sources and fingerprint comparison
  - ../forme.md: Compile-phase wiring of Requires ↔ Maintains
  - ../contract-markdown.md: Markdown source format
---

# Responsibility

A goal is a point-in-time requirement.

A **responsibility** is a standing goal: a truth that must remain current over
time. In the reactive model it is a **mounted node** in the reactor DAG — it
subscribes to upstream truth (`### Requires`), maintains its own truth in a
persisted world-model (`### Maintains`), and is woken over time according to its
`### Continuity`.

Responsibilities are the headline kind. A `function` is a stateless called
helper; a `gateway` is sugar for an external-driven responsibility. There is no
`system` kind — composition is intra-node `call` or a cross-node subscription,
never a third autowired graph kind.

## Canonical Shape

```markdown
---
name: high-intent-stargazers
kind: responsibility
id: 067NC4KG01RG50R40M30E20918
---

### Goal

High-intent GitHub stargazers are identified, enriched, and thoughtfully
followed up with.

### Requires

- A current view of new and updated GitHub stargazers.
- A current view of company and operational context for each stargazer.

### Maintains

A roster of qualified stargazers, each with evidence, fit assessment, and
outreach state.

Facets:
- `qualified` — stargazers passing the fit bar, with evidence.
- `outreach` — per-stargazer outreach state and history.

Material: the qualification evidence, the fit verdict, and outreach state.
Immaterial (excluded from the fingerprint): `fetched_at`, request ids,
cosmetic ordering.

Freshness: each entry carries `valid_until`; a lapsed entry is revisited.

Postconditions:
- Every qualified stargazer has evidence from GitHub, company context, and
  likely operational pain.
- No person is contacted repeatedly without new evidence.
- Enrichment and outreach costs stay bounded.

### Continuity

input-driven; self-driven daily so new high-intent stargazers are not left
unattended for more than one business day.

### Execution

(ProseScript render body, or delegate to a `function`.)
```

## Sections

| Section | Meaning |
|---------|---------|
| `### Goal` | The render's one-sentence standing intent |
| `### Requires` | Subscription contracts naming facet-level needs; Forme's match target (`Requires.<facet> ↔ Maintains.<facet>`) |
| `### Maintains` | The world-model **schema** doing four jobs: type, canonicalization spec, facets, postconditions |
| `### Continuity` | The structural wake-source declaration: input-driven (default), self-driven (cadence), external-driven (gateway) |
| `### Invariants` | Properties that must hold regardless of outcome |
| `### Execution` | The render body in ProseScript |

`### Requires` and `### Maintains` are the reactive interface. `### Goal` and
`### Continuity` declare standing intent and wake policy. The rest carry the
execution body and host-capability hints (`### Shape`, `### Environment`,
`### Tools`, `### Runtime`).

## `### Maintains` does four jobs

This is the payoff of the rename from `### Ensures`: an "ensured output" was a
return value, but a "maintained truth" is a standing, typed, subscribable
artifact. Reading `Ensures → Maintains` as a pure rename is a false friend — the
new section carries far more. All four jobs live inside `### Maintains`; none
gets its own block. It is authored as unambiguous natural language and compiled
into a deterministic canonicalizer ahead of run time.

1. **Type** — what the truth looks like (the fields), including freshness fields
   (`valid_until`, `last_corroborated`, `confidence`).
2. **Canonicalization spec** — what equality means for the fingerprint: which
   fields are material, which are volatile-but-immaterial and excluded
   (timestamps, request ids, cosmetic ordering), how sets/numbers/text
   normalize. This is the single highest-leverage memoization control: without
   it, a feed re-polled every 3 minutes always looks changed and "cost scales
   with surprise" degrades into "cost scales with the clock."
3. **Facets** — named, independently-subscribable parts of the truth. A
   downstream subscribed to one facet does not wake when another moves. Optional:
   a single-truth node declares none, and its atomic world-model is the one
   implicit facet.
4. **Postconditions** — the folded-in `### Criteria`: validators the render must
   leave the truth satisfying. Not a separate judge beat; just conditions on the
   output, verified deterministically on commit where possible, otherwise
   self-attested by the render before it signs.

## `### Continuity` is a wake-source declaration

This is a false friend too. It is no longer a narrative freshness/recurrence
policy — it is a **structural** declaration of which wake sources may activate
the node:

- **input-driven** (default) — woken by an upstream receipt whose subscribed
  facet fingerprint moved.
- **self-driven** — the node's own continuity clock emits a synthetic
  self-receipt (a tick) on a declared cadence, for cases where the world will
  not announce the change. `### Continuity` may *read* the world-model's soonest
  `valid_until` to drive the cadence (data-driven freshness), but the cadence
  *rule* stays here and the expiry *data* stays in the world-model.
- **external-driven** — a gateway turns a webhook / cron / manual trigger into a
  receipt at the system's edge.

## What Belongs Here

Put the reactive interface and standing intent here:

- the standing truth that must remain current (`### Goal`, `### Maintains`)
- the upstream needs (`### Requires`)
- the world-model schema, canonicalization, facets, and postconditions
- the wake-source policy (`### Continuity`)

Keep implementation details out:

- concrete cron syntax, webhook routes, queue names
- storage schema and the canonical serialization (the store owns it)
- step-by-step provider behavior
- test cases (they belong in the parallel `kind: test` system)

Concrete connector details belong in optional `kind: gateway` source when
inference cannot safely recover them.

## What folded away

The judge-era responsibility sections are folded into the reactive model:

| Old section | Now |
|-------------|-----|
| `### Criteria` | `### Maintains` postconditions — no separate judge beat |
| `### Constraints` | `### Invariants` / `### Maintains` |
| `### Memory` | the single persisted world-model (one world-model per node) |
| `### Fulfillment` | the render itself, or a delegated `function` |

A true `function` is stateless and has no world-model, so it simply drops
`### Memory`; a `service`-with-memory that becomes stateful is really a
responsibility.

## Compiler Expectations

When compiling a responsibility, the compile phase produces:

- the node in Forme's **topology world-model**, with its resolved
  `Requires.<facet> → Maintains.<facet>` edges (ambiguous or unsatisfied matches
  are surfaced diagnostics, never silent guesses)
- a **canonicalizer** lowered from the `### Maintains` canonicalization spec:
  `canonicalizer(world-model) → fingerprints`
- **postcondition validators** lowered from the `### Maintains` postconditions
  (deterministic where expressible, render-attested otherwise)
- concrete wake-source wiring from `### Continuity` (self-driven cron when a
  cadence is declared; entry points for gateways)

The compiler does not invent provider-specific routes, queues, or payload
shapes the source does not supply, and it lints any subscribed field lacking a
structured backing.

## The reactive question

The reconciler — not a judge — decides the node's activity, by comparing
fingerprints:

- Did any subscribed input fingerprint move, or did the contract change?
- If not, the render is skipped (a cheap `skipped` receipt, nothing spawned).
- If so, one render computes the new truth, leaves its postconditions satisfied,
  writes the world-model, and signs a receipt.
- Only a `rendered` receipt whose fingerprint moved wakes downstreams.

No user-authored judge file is required, and no judge runtime exists. The
commit gate is the compiled postconditions plus render self-attestation.
