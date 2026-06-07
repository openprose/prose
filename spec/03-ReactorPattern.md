# OpenProse Reactor Pattern

###### How to write OpenProse for a Reactor-class harness — the language layer beneath evented reconciliation.

The OpenProse corpus divides labor exactly, and each document maps to what
ships:

- [01-Language.md](./01-Language.md) — **the Language & Framework**, bundled as
  the **SKILL**: syntax, kinds, sections, compile model, std/co.
- [02-ReactorHarness.md](./02-ReactorHarness.md) — **the Reactor
  Harness**, bundled as the **CLI/Server**: the runtime control architecture
  (loop, invariants, the reconciler, memoization, forecast, receipts, composition). It
  answers _what the runtime must do_.
- [03-ReactorPattern.md](./03-ReactorPattern.md) — **this
  document, the Reactor-Native Authoring Pattern**: **SKILL-bundled but
  harness-governed**. Where the Harness doc says what the runtime does, this
  says **what the author writes** so the runtime can do it. It bridges the
  Language doc and the Harness doc and is the definitive guide to writing
  `*.prose.md` for a Reactor-class harness.
- [ReactorFeedback.md](../history/ReactorFeedback.md) — **the
  decision log**, not shipped: the dialectic that produced the Harness doc;
  the clean statements live in the docs above and it does not repeat them.
- [00-Tenets.md](./00-Tenets.md) — **the constitution**. When any
  document tensions with a tenet, the tenet wins.

The relationship is the same as the one between a language reference and an
effective-style guide. The harness doc tells you the machine has memoization,
forecast-gated quiescence, deterministic commit-gating, and receipt composition.
This doc tells you how to write contracts so those mechanisms actually engage
instead of degrading to "cron plus a prompt."

This file has three parts, mirroring the harness doc:

1. The ideal Reactor-native authoring pattern.
2. What the OpenProse skill implements today.
3. What must change in the skill before the pattern is fully authorable.

The single most important principle, stated once up front so the rest is read
in its light:

> **The Reactor paradigm does not change OpenProse syntax. It inverts which
> kind is the program.** Every section, kind, and keyword the pattern needs
> already exists. What changes is doctrine: the responsibility is the
> top-level authored object, the render is where the work happens (there is no
> separate fulfillment system), and two contract sections (`### Maintains` and
> `### Continuity`) carry a cost-and-reconciliation obligation they did not
> visibly carry before.

---

## I. The Ideal Reactor-Native Authoring Pattern

### The inversion

`01-Language.md` settles the mental model: the **responsibility is the program**.
A standing goal, written as durable intent, is the top-level authored object;
everything else is derived from it.

```text
The responsibility is the program.
A gateway is how the world reaches it.
A function is a helper one render calls; the DAG is how responsibilities compose.
Forme, the canonicalizer, and the VM are the substrate, never the unit of authoring.
```

The authoring consequence: **you do not start by writing a system. You start by
writing one sentence of durable intent and what makes it true** — a `### Goal`
and a `### Maintains`. A responsibility is _served_, not _run_, but that is not a
limitation: "not directly runnable" means "continuously reconciled," which is the
entire point. The render of a single responsibility still runs standalone
(language sovereignty), so there is no lesser, non-executable artifact here.

### The canonical contract

A Reactor-native unit of work is, at its smallest, **one file**: a
`kind: responsibility` whose `### Maintains` declares the truth to keep current.
It grows only as the work demands:

| File | `kind:` | What the author is really writing |
| --- | --- | --- |
| The standing goal | `responsibility` | One `### Goal` sentence + the `### Maintains` world-model that makes it true (type, facets, canonicalization, postconditions) |
| Event ingress | `gateway` | How and when the world is allowed to wake the loop |
| A helper | `function` | A called, ephemeral computation a render invokes — `### Parameters` → `### Returns` |

There is no separate "fulfillment system," no "sense service," no "verdict
service," and no "ledger service": the render *is* the fulfillment, the
canonicalizer *is* how change is sensed, `gateCommit` *is* the admissibility check, and
the signed receipt ledger *is* the storage — all owned by the harness, not
authored. A reader who understands the responsibility understands the program;
the rest is _how_, and may change without the intent changing (invariant 1, at
authoring time).

### Authoring derived from the invariants

Each harness invariant produces a concrete, checkable authoring rule. This
table is the spine of the pattern; the prose after it only elaborates.

| Harness invariant | Authoring rule it imposes |
| --- | --- |
| 1. Markdown is intent | The responsibility carries all semantic weight. Never push intent into a prompt or a tool config. If it matters, it is in `### Goal` / `### Requires` / `### Maintains`. |
| 2. Materiality is compiled and shared | Declare *what counts as a material change* as natural language inside `### Maintains` — which fields matter, how they normalize, where the facets fall. The compile phase lowers that into a deterministic canonicalizer; you state the materiality, not the hash. |
| 3. Adapters are the only reason homes differ | Author no host-specific logic in contracts. Declare needs in `### Tools` / `### Environment` by name only. The same contract must run local and cloud. |
| 4. Activations are bounded | Never write a render that assumes it keeps running. No "while true," no in-session waiting for the next event. Continuity lives in the receipt ledger, not a session. |
| 5. Cost scales with surprise | Write `### Maintains` so "did anything material change?" is **cheaply decidable** — give the truth a stable content identity and facet it so an unrelated change wakes nobody. Declare freshness (`valid_until`) in `### Continuity` so silent staleness still wakes the node. This is a rule authors often violate. |
| 6. The commit gate is deterministic | State satisfaction as **postconditions inside `### Maintains`** — deterministic where you can express a validator, self-attested by the render where it is semantic. There is no separate judge and no `### Criteria`. |
| 7. Receipts are content-addressed | Trust the harness's signed receipt ledger as the audit / composition / exit unit. Do not hand-roll a scratch log. |
| 8. State is replayable and exitable | Keep all durable truth in the responsibility's `### Maintains` world-model, in plain structured records. A reader must be able to take the contract and its trail to another harness. |

### Rule 1 — `### Goal` is one standing-intent sentence

A goal is a state that should remain true, not a task or a deliverable. Not
"triage the inbox," not "produce a report," but an invariant: "the research inbox
is deduplicated, prioritized, and converted into action."

The test is no longer "could a judge score it" — there is no judge. The test is:
**can you name the maintainable truth and declare its shape in `### Maintains`?**
If the sentence describes an _activity_ rather than a _state_, rewrite it until
it describes a state. A sentence whose truth has nothing observable to maintain
against is the highest-value early signal: the first render fails, its receipt
names the gap, and the contract author hears about it — front-loaded, then
silent.

### Rule 2 — `### Continuity` declares the wake source; `### Maintains` carries the materiality

These were once one rule; they are two jobs, and conflating them is a common
authoring mistake.

`### Continuity` answers **when, beyond an input change, this node should
re-render**:

- **Input-driven (default).** The node wakes when a subscribed `### Requires`
  facet moves. You write nothing extra.
- **Self-driven.** The truth goes stale on its own. Declare a `valid_until`
  freshness window — "a stargazer count older than one business day is stale."
  When it lapses, the continuity clock mechanically moves the facet's fingerprint
  and wakes the node; you do not hand-write a cron.
- **External-driven.** A `kind: gateway` turns an ingress event (webhook, queue,
  schedule) into a wake.

The *memoization* half — what counts as a material change, and whether "nothing
changed" is cheaply decidable — belongs in **`### Maintains`**, not here. Write
`### Maintains` so an unchanged world produces an unchanged fingerprint: give the
truth a stable content identity (a content hash, a max-timestamp, a revision) and
facet it so an unrelated change wakes nobody. If the only way to know whether
anything changed is to redo the full expensive render, you have written a
contract whose cost scales with the clock, not surprise — say so deliberately
(the node will run at freshness cadence), exactly as projection-only is a
deliberate choice rather than a degenerate Reactor.

### Rule 3 — satisfaction is a postcondition in `### Maintains`, not a `### Criteria` judge

There is no `### Criteria` and no judge. State what "satisfied" means as
**postconditions inside `### Maintains`**:

- **Deterministic where you can express it.** "The release-notes file's last
  commit is newer than the latest merged PR touching `src/`" compiles into a
  validator the harness runs at commit. If it fails, the render commits nothing.
- **Self-attested where it is semantic.** Where the obligation cannot be reduced
  to a validator, the render must attest it satisfied its own `### Maintains`
  before it signs. `gateCommit` fails closed: no attestation, no commit. (Part II:
  the deterministic gate is built but currently unwired, so the live commit rides
  the render's self-attestation until the compiled validators are threaded on.)

When the truth genuinely has *nothing observable to maintain against*, the render
cannot satisfy its postcondition and writes a `failed` receipt naming the gap —
routed to the contract author. Author postconditions *expecting* this on the
first few activations; that front-loading is the promise, not a defect. There is
no `up`/`drifting`/`down`/`blocked` status to encode and no "undecidable" enum —
the `failed` receipt and its reason carry it.

### Rule 4 — `### Invariants` draws the actuation boundary

`### Invariants` (the section that absorbs the old `### Constraints`) is where the
author quarantines world-mutation — the authoring-time expression of the
render/commit split: a render may act, but only the canonicalized published truth
re-enters the memo, and `### Invariants` is where the author bounds what the
render may touch — the actuation boundary the harness is to enforce at the
render/commit split. (Part II: authored but not yet lowered into the render.)

Two boundary shapes recur:

- **Full Reactor.** The render may mutate the world (send the email, update the
  briefing, write the register). `### Invariants` bounds _how_ (rate, scope,
  prohibited actions, "leave the final send to a human").
- **Projection-only Reactor.** The author forbids all world-mutation except
  writing the published truth itself: an observe-only overseer, a dashboard that
  must stay true, an audit that watches but never touches. Say so explicitly:
  "the only writable surface is the published truth; never modify, signal, or
  write into the observed system."

A projection-only contract is not a degenerate Reactor. It keeps every cost and
audit property; it simply declines the reconcile-the-world payoff. Choose it
deliberately, not by backing into it.

### Rule 5 — write `### Maintains` so the harness can memoize

Authors most often write the anti-pattern: a render that re-derives everything
every time. The fix is not a service decomposition — it is shaping `### Maintains`
so the dumb reconciler can skip. The reconciler keys each render on the 3-tuple
`(contract_fingerprint, input_fingerprints, freshness_epoch)`; your leverage is
to make the input fingerprints move only on real change. (Shipped v1 realizes the
freshness term as a forecast self-receipt over a 2-tuple key — identical decision
semantics; see [02-ReactorHarness.md](./02-ReactorHarness.md) Part II.)

1. **Give the truth a stable content identity.** The canonicalizer fingerprints
   the published truth; make sure an unchanged world yields an unchanged
   fingerprint (drop volatile fields — a re-poll timestamp, a request id — from
   materiality). This is what lets the reconciler skip *before* any render runs
   (quiescence behavior 1).
2. **Facet the truth.** Split `### Maintains` into `####` parts so a consumer
   subscribing to one facet is not woken by a change in another (quiescence
   behavior 3). A diamond reconverges to a single wake.
3. **Declare freshness.** Put `valid_until` windows in `### Continuity` so silent
   staleness still wakes the node (quiescence behavior 2).

Variable-depth work, where you genuinely need it, is ordinary control flow
*inside the one render* — a `call` to a `function` for an expensive sub-step,
gated by an `if` in `### Execution`. It is not a "judge tier" and not an
autowired service graph.

### Rule 6 — composition is subscribing to an upstream facet, not a new primitive

"Responsibility B depends on responsibility A" needs no new syntax. B names the
upstream facet in `### Requires`; Forme matches it to A's `### Maintains` facet
and draws the subscription edge. B's render wakes on A's receipt when that
facet's fingerprint moves — identical to consuming a webhook. Two authoring
obligations make it safe:

- **Reference, don't embed.** B's `### Requires` names A's responsibility id /
  facet as a declared subscription, not a copied value.
- **Pin revision and trust.** For cross-trust-domain composition, pin which
  revision of A you accept and an acceptable signer set; unpinned composition is
  a supply-chain attack the author closes, not the runtime. (Part II: v1 "signed"
  is meaning-layer chain-consistency over a null signer; the cryptographic
  byte-hash signer is deferred.)

Freshness needs no special authoring: each facet carries its own `valid_until`,
so a stale upstream facet's fingerprint lapses and wakes B through the ordinary
path. There is no transitive-freshness function to shape and no per-cycle
staleness comparison to hand-write.

This is how a downstream responsibility consumes an upstream one — a subscription
edge, not a special case.

### Patterns that are Reactor-native

The std pattern library is use-case agnostic, but a subset recurs in
Reactor-native contracts and should be the author's default vocabulary:

| Pattern | Reactor-native role |
| --- | --- |
| `fan-out`, `map-reduce` | Sensing a wide world cheaply, in parallel, inside one render |
| `guard` | A precondition gate before an expensive `call` or a world-mutating step |
| `worker-critic`, `proposer-adversary` | A built-in check a render runs before it attests and commits |
| `oversight` | The actor / observer / arbiter split — the canonical projection-only shape |

These coordinate `call`s to `function`s *inside a render*; none is a separate
node or an autowired graph. Depth — running a critic only on the uncertain
branch — is ordinary `### Execution` control flow.

### A worked example: the competitor-activity monitor

The running example across the harness and world-model specs: keep a current
picture of a set of competitors, where downstream consumers care about
*different parts* of that picture and should wake only when their part moves.

**The responsibility** (the whole program):

```markdown
---
name: competitor-activity-monitor
kind: responsibility
id: 067NC4KG01RG50R40M30E20918
---

### Goal

The activity of the tracked competitors — their funding, hiring, and product
launches — is current.

### Requires

- `competitors`: the watchlist (names + domains) this monitor tracks.
- `pages` from `competitor-sources-gateway`: the latest fetched source content,
  staged with a cheap content identity so unchanged sources don't wake the
  extraction.

### Maintains

A `competitor-activity` world-model with three independently-subscribable parts:

#### funding
Rounds, amounts, investors, and dates. Material: a new or changed round.
Immaterial: re-ordering, prose phrasing, the timestamp of the last poll.

#### hiring
Open roles and headcount signals by function. Material: a role appears or
closes, or headcount crosses a band. Immaterial: list order, exact view counts.

#### product-launches
Announced launches and ship dates. Material: a new launch or a moved date.

Postcondition: every entry cites the source it was derived from; an entry with
no observable source is not committed (the render attests this).

### Continuity

- Input-driven: wake when `pages` (new staged source content) or the
  `competitors` watchlist changes. Unchanged sources leave the `pages`
  fingerprint still, so the expensive extraction memo-skips at zero render tokens.
- Self-driven: each part carries a `valid_until` of +1 business day as a safety
  net, so a silently stale part is re-checked even if the gateway missed a change.

### Invariants

- Read-only on the outside world: never contact a competitor or alter a source.
- The only writable surface is the `competitor-activity` world-model.

### Tools

- cli:fs-read   # reads staged source content; the gateway owns web-fetch
```

**The gateway** that feeds it — cheap, deterministic ingress with a stable
content identity, so the monitor's render only fires on real change:

```markdown
---
name: competitor-sources-gateway
kind: gateway
id: 067NC4KG01RG50R40M30E2091A
---

### Goal

The latest fetched source content for each tracked competitor is staged for
extraction — fetched and staged only, never interpreted here (extraction is the
monitor's render).

### Continuity

external-driven: the competitor sources cannot push, so the gateway re-checks
them on a *freshness-paced* cadence — a `valid_until` of +6h on the staged
`pages`, not a blind heartbeat (invariant 5).

### Maintains

#### pages
The fetched source content per competitor, normalized to its stable main text.
Material: the content hash of a competitor's normalized text changed. Immaterial:
fetch timestamp, request ids, response headers, ads, and boilerplate.

### Schedule

- Re-fetch each competitor's funding, careers, and product pages when the staged
  `pages` freshness window (+6h) lapses — the freshness-paced recheck for sources
  that cannot push, not a fixed-interval poll.
```

The gateway does the cheap, deterministic half (fetch + normalize + hash); the
monitor does the expensive, semantic half (extract funding / hiring / launches),
and only when the gateway's `pages` fingerprint actually moves.

**A downstream consumer** subscribes to one facet, and wakes only on that facet:

```markdown
---
name: weekly-competitor-brief
kind: responsibility
id: 067NC4KG01RG50R40M30E20919
---

### Requires

- `funding` from `competitor-activity-monitor`   # subscribes to ONE facet

### Maintains

A short brief summarizing the latest funding activity for the watchlist.

### Continuity

- Self-driven: a `valid_until` of +7 days, so the brief refreshes weekly even
  if funding stays quiet.
```

What an ideal Reactor harness does with this:

- A gateway poll that finds **no changed source content** leaves the `pages`
  fingerprint unmoved, so the monitor's extraction **memo-skips at zero render
  tokens** (the gateway pays only a cheap, non-LLM fetch + hash) and the brief
  never wakes — *cost scales with surprise.* When sources change but the funding
  *facet* does not, the monitor renders, re-derives an unchanged `funding`
  fingerprint, and still leaves the brief asleep.
- A new **hiring** signal moves only the `hiring` fingerprint; the brief
  subscribes to `funding`, so it stays asleep — *facets make subscription
  selective.*
- When `funding`'s `valid_until` safety net lapses, the continuity clock advances
  the monitor's freshness epoch and wakes it with a zero-token self-receipt; the
  monitor re-extracts from the latest staged `pages`, and only real news
  propagates to the brief.
- A render that cannot cite a source for an entry fails its postcondition,
  commits nothing, and leaves a `failed` receipt — the prior truth stands.

Two of these are ideal harness behavior the contract is authored to, not yet
delivered: forecast-paced freshness arming (today `serve` polls a flat interval)
and the gateway's `### Schedule` cadence (today dropped by the compiler) are Part
II deferrals — the contract above is correct; the harness climbs to it.

No `kind: system`, no `### Services`, no judge, no ledger service: the render
maintains the world-model, the canonicalizer senses change, `gateCommit` gates
the commit, and the signed receipt ledger is the trail.

### Anti-patterns

Each is the natural non-Reactor instinct and why it breaks an invariant:

- **Modeling the work as a graph of services instead of one responsibility.**
  Inverts the model; the wiring becomes the source of intent (breaks
  invariant 1). Start from the `### Maintains` truth, not a system.
- **A render with a `loop until done` that waits for events in-session.** That
  is a long-running agent loop, not bounded activations (breaks invariant 4).
- **A `### Maintains` with no material/immaterial split, so every re-poll looks
  changed.** The canonicalizer's fingerprint moves every cycle; the reconciler
  can never skip and cost scales with the clock (breaks invariant 5). This is the
  most common and most expensive mistake.
- **A contract whose only "did anything change" test is the full render, written
  as if it memoizes.** Not an invariant-5 _correctness_ break (the continuity
  clock still makes it safe) but a false cost claim. The Reactor-native form names
  the absence of a cheap identity and accepts freshness-cadence cost
  deliberately — exactly as projection-only is a deliberate choice, not a
  degenerate Reactor.
- **Hand-coding a cadence in `### Execution`** instead of declaring the wake in
  `### Continuity` (an input subscription or a `valid_until`). It hides the
  schedule from the harness and defeats forecast-paced quiescence (breaks
  invariant 5).
- **Putting volatile fields in `### Maintains`** — a poll timestamp, a request
  id, a re-ordered list — so the fingerprint moves on noise (breaks invariant 5).
- **Consuming another responsibility's value by copying it into the contract.**
  Not a verifiable, revision-pinned subscription; a supply-chain hole (breaks
  Rule 6 composition and invariant 7's content-addressed receipts). Name the
  facet in `### Requires` instead.
- **"Swarm of subagents that continuously watches."** The cron-plus-prompt shape
  the Reactor replaces. The Reactor-native form is: a subscribed input or a
  lapsed `valid_until` wakes one bounded render; nothing watches in between.

### Precedence for authors

When authoring rules tension, follow the harness precedence stack:

```text
correctness  >  safety  >  cost  >  interrupt-minimization
```

If a correct, safe contract surfaces more `failed` receipts to the author early,
accept them. If making a contract cheaper would make it unsafe (dropping a
postcondition on a high-stakes goal so it commits without checking), pay the
cost. Silence is a target, never a constraint the other rules bend around.

---

## II. What The OpenProse Skill Implements Today

The current model in Part I — intelligent compile (per-node canonicalizer +
Forme topology + postcondition validators, fired only on a contract-set change)
over a dumb deterministic run (compare `(contract_fingerprint, input_fingerprints)`
→ skip / render / `gateCommit` / propagate) — is the model the shipped skill
authors against. This section is the conformance ledger: what the skill routes
today, measured honestly against that pattern.

The reference harness backing the skill is the three packages that ship
together — `@openprose/reactor` (the engine SDK, `0.3.1`), `@openprose/reactor-cli`
(command `reactor`, `0.2.2`, thirteen commands), and `@openprose/reactor-devtools`
(the replay viewer, `0.2.0`). The skill's `responsibility-runtime.md` and
`concepts/{responsibility,reactor}.md` are already written to this model; the
retired judge/verdict/status/pressure/fulfillment vocabulary is gone from the
authoring surface, not merely deprecated, and the legacy `prose` CLI binary has
been removed (the language is embodied by the SKILL in-session).

### The authoring surface that already exists

The headline finding still holds: **the Reactor-native pattern requires no new
syntax** — but the syntax it requires is the *current* one. The skill routes the
kinds and sections Part I names, and only those.

| Pattern element | Skill support today |
| --- | --- |
| `kind: responsibility` with `### Goal` / `### Requires` / `### Maintains` / `### Continuity` / `### Invariants` (+ `### Tools` / `### Shape` / `### Runtime`) | Present and canonical (`concepts/responsibility.md`, `contract-markdown.md`); `id:` is tooling-minted and stable across `name:`/filename renames |
| `kind: function` with `### Parameters` / `### Returns` — a stateless called helper (the former `service`) | Present; run as a lone render with no Forme phase |
| `kind: gateway` — sugar for an external-driven responsibility; Forme's entry-point set | Present; `reactor serve` registers it and stages ingress (fetch → extract → stage + a durable idempotency cursor) |
| `kind: pattern` / `kind: test` | Present; patterns expand at compile time, tests route to the in-session `prose test` semantic (there is no `reactor test` subcommand) |
| Facets: `####` parts under `### Maintains` — name = fingerprint unit + subscription symbol; atomic default | Present and **facet-granular propagation is live in production** (the v2 named-parts model); a downstream subscribed to one facet does not wake when another moves |
| `### Maintains` as the world-model schema doing four jobs (type, canonicalization spec, facets, postconditions) | Present; the postconditions live **inside `### Maintains`**, compiled to validators (there is no separate `### Criteria` section — it was removed) |
| `### Continuity` as the structural wake-source declaration (input / self / external) | Present; self-driven recheck and the gateway entry point are both wired (Phase 4) |
| `### Execution` ProseScript for variable-depth work inside one render | Present — an `if`-gated `call` to a `function` is the depth mechanism, not a judge tier |
| Compile as SKILL-loaded sessions (Forme / canonicalizer / postcondition) → deterministic lowering → content-addressed IR cache | Present; a `.prose` set mounts without hand-authoring via a true semantic `Requires ↔ Maintains` match |
| Run: dumb reconciler — memo-skip on unmoved `(contract_fp, input_fp)`, single-flight + coalescing, failure = no-commit, propagate only on a `rendered` moved fingerprint | Present (`@openprose/reactor`); restart-survival proven (truth + ledger survive a fresh process) |
| `gateCommit`: deterministic postcondition validators + render self-attestation of `### Maintains`; receipt status in `{rendered, skipped, failed}` | Partial; no judge, no verdict, no status enum — but the commit rides the render's **self-attestation** today: the deterministic `gateCommit(...)` validators are built and tested yet have **zero live callers** (02-ReactorHarness gap cluster 1) |
| Content-addressed, chain-verifiable receipt ledger; cost = `tokens.fresh` vs `tokens.reused` + `surprise_cause` | Present (`reactor receipts` chain-verifies and tamper-detects; the devtools meter renders "cost scales with surprise") |
| Composition: a downstream responsibility names an upstream facet in `### Requires`; Forme draws the subscription edge | Present; the reconciler reads the topology `edges` to resolve propagation |

The skill can already express a Reactor-native program end to end *in the current
model*: one responsibility with a faceted `### Maintains`, a gateway for ingress,
a `function` helper for an expensive sub-step, an actuation boundary in
`### Invariants`, postcondition-gated commit, and a composition edge that is a
real subscription rather than a copied value. Two honest caveats the author must
hold (see limits): the `### Invariants` actuation boundary is **authored but not
yet harness-enforced** — it is never lowered into the render, so it constrains the
model only as prose; and the postcondition gate currently rides the render's
self-attestation, not the deterministic `gateCommit(...)` validators.

### Current authoring limits

Part I states the pattern as an unqualified north star. This is where authoring
reality is honest, rule by rule.

| Authoring rule (Part I) | State | What the author must currently know |
| --- | --- | --- |
| 1. Intent lives in the responsibility | Conformant | Fully authorable today |
| 2. Materiality stated semantically in `### Maintains` | Conformant (authoring) | The author states materiality in prose; it is lowered to a deterministic canonicalizer. The lowering runs **only spec→code** — a compile session reads the `### Maintains` prose and emits the canonicalization spec, which the deterministic producer compiles. There is no `.prose` *parser*; compile is sessions, not a grammar |
| 3. No host-specific contract logic | Conformant (authoring); harness resolution deferred | `### Tools` (`cli:` / `mcp:`), `### Environment`, and `### Skills` are authored name-only and never install or contact at compile — but the Reactor harness does not yet **consume** them: compile reads only `### Requires`/`### Maintains`/`### Continuity`/`### Execution`, and the render runs a fixed built-in toolset, so declared capability names are inert today. Fail-closed resolution/enforcement of the declared surface is a forward item (02 Part III §10) |
| 4. Bounded activations | Conformant | Idiomatic; the "loop until done" anti-pattern is author error, not a skill gap |
| 5. Written for memoization / variable depth | Conformant | The reconciler's skip on `(contract_fp, input_fp)` is live (cost scales with surprise, including an immaterial-churn re-poll that still skips); facet selectors are live; depth is an `if`-gated `call` in `### Execution`. The author's leverage is real today |
| 6. Composition via a subscribed upstream facet | Conformant (meaning-layer) | A downstream names the upstream facet in `### Requires` and Forme wires the edge; receipts are content-addressed and the chain is verifiable. The **cryptographic** signer is a null-state — v1 "signed" is meaning-layer chain-consistency, not a byte-hash — so cross-trust-domain *pinning to a signer set* is not yet enforceable |
| 7. Receipts as the audit / composition / exit unit | Conformant | The ledger is flat `<state-dir>/receipts.json`, content-addressed, chain-verifiable; `cost` (fresh/reused/surprise_cause) and `status` are first-class. No hand-rolled scratch log is needed |
| 8. Replayable and exitable | Conformant | Contract + world-model + ledger are plain and portable; `reactor-devtools <state-dir>` replays a saved run with zero running reactor and zero key |

### Honest current limits for authors

- **`### Continuity` self-driven recheck exists, but `serve`'s freshness clock
  arms nothing by default.** The bridge is real (a lapsed `valid_until` flips a
  fact's status, moves the facet fingerprint, and wakes the node — a **zero-token**
  fingerprint move, not a model re-render), and the SDK computes each node's
  soonest `next_self_recheck`. But the shipped `serve` daemon's freshness reader
  defaults to none and no node emits `valid_until` by default, so it sleeps a flat
  `--poll-interval` (default 60s) and does the fixed-interval work the ideal
  forbids. Forecast-paced / adaptive idle is the deferred next step. Declare
  `valid_until` now; the cadence tightens later without a source change.
- **The `### Invariants` actuation boundary is authored, not enforced.** The
  authored rate/scope/prohibited-action quarantine is never lowered into the
  render — neither compiled, attested, nor harness-checked — so it constrains the
  model only as prose, bounded in practice by the cwd-rooted workspace sandbox and
  the turn cap. There is also no world-mutation actuation sink yet (render tools
  are fs/shell over a private workspace; connectors are read-only ingress).
- **A gateway's `### Schedule` cadence is not yet honored.** Gateways poll
  external sources, but a per-gateway `### Schedule` (e.g. "every 6h") is dropped
  by the compiler today; cadence is the serve loop's flat poll interval. Declare
  the intended schedule now; it binds once the compiler carries it.
- **The deterministic commit gate is unwired.** `compilePostconditions(...)`
  runs on the compile path, but the gate that evaluates it, `gateCommit(...)`, has
  zero live callers; the commit rides the render's `### Maintains` self-attestation
  (02-ReactorHarness gap cluster 1).
- **Serve ingress is local cron-poll + HTTP only.** Gateway poll connectors and
  an HTTP trigger surface ship; **queues, file watches, and provider
  subscriptions** do not. A worktree/planning-dir watcher must use a poll
  `### Continuity` today and note the intended file-watch form.
- **The cryptographic signer is a null-state, and the dependency edge pins no
  signer set.** Composition pins a content-addressed *revision* and is
  chain-verifiable at the meaning layer, but the topology edge carries no
  *acceptable-signer-set* pin, and the byte-hash signer that would enforce one is
  deferred. Functionally adequate within one trust domain; cryptographically
  weaker than the ideal across domains.
- **Materiality is authored, not yet inferred.** The author writes the
  material/immaterial split in `### Maintains` prose and the compile session
  lowers it. The skill does **not** infer facets or materiality from the truth's
  shape; that inference loop is deferred. The store also does not materialize a
  per-facet `published/<facet>/…` subtree on disk (it persists `published.json`
  + content-addressed blobs) — facet-granular propagation holds regardless; only
  the on-disk subtree mirror is absent.

> The pattern is fully writable today, in the current model. Its remaining
> climb is harness cadence and cryptographic hardening (forecast-paced rechecks,
> richer ingress adapters, the byte-hash signer), not retired vision. Author to
> the ideal; do not claim the runtime delivers the deferred items it does not.

---

## III. What Must Change In The Skill

The retired-model framings are gone: the skill already routes the current kinds
and sections, the examples are migrated, and `concepts/{responsibility,reactor}.md`
teach the no-judge model. What remains is the climb from "fully authorable in the
current model" to "every Part I payoff is also *delivered*" — a mix of finishing
the authoring story for the newest sections and the genuine harness deferrals.

### 1. Finish the facet authoring story

Facet propagation is live and the named-parts model is canonical, but two seams
are open:

- **Facet inference is deferred.** Today the author writes the `####` parts and
  the material/immaterial split by hand. The skill should eventually offer a
  lint that flags an under-faceted `### Maintains` (one giant atomic truth whose
  consumers clearly want selectors) — and, post-v1, an inference pass that
  proposes facets from the truth's shape.
- **The on-disk subtree mirror is absent.** The store fingerprints each facet's
  material field-paths and persists `published.json` + content-addressed blobs;
  it does not materialize a `published/<facet>/…` subtree. Author doctrine
  should not promise a subtree on disk — describe facets as the *subscription
  and fingerprint* unit, which is what actually ships.

### 2. Complete the no-judge postcondition doctrine in `contract-markdown.md`

`### Maintains` now carries four jobs (type, canonicalization, facets,
postconditions) and `### Continuity` is a structural wake-source declaration.
These are documented in `concepts/responsibility.md`; `contract-markdown.md`
should mirror the load they bear:

- `### Continuity` is the author's input to memoization and cadence — name the
  freshness referents (`valid_until`) and the wake sources (input / self /
  external), and make "nothing changed" cheaply observable.
- Postconditions are the author's commit gate. State them as observable
  referents; when the truth has *nothing observable to maintain against*, that
  is an expected, high-value `failed` receipt routed to the author — **never** a
  `blocked`/`drifting` status enum (those are retired).
- The failed receipt that *names the gap and routes it to the author* depends on
  the harness widening the durable receipt with `as_of`, a `reason`, and an
  author-addressing field (02 gap cluster 2); until that lands, the doctrine is
  authorable but the routed reason is dropped at commit. Author to it now.

### 3. Land the materiality lowering's prose→spec half

Compile runs as SKILL-loaded sessions and the **spec→code** canonicalizer
lowering is real (a compile session emits the canonicalization spec; the
deterministic producer compiles it). The remaining work is hardening the
**prose→spec** step — reading the author's `### Maintains` materiality prose into
the spec reliably — so that "state the materiality, not the hash" is trustworthy
across more contract shapes. This is a compile-session quality effort, not a new
grammar; there is no `.prose` parser to build.

### 4. Wire the deterministic commit gate

The author states satisfaction as postconditions inside `### Maintains`, and the
compile phase lowers them to deterministic validators (`compilePostconditions`
runs on the compile path). But the gate that would evaluate them at commit,
`gateCommit(...)`, has zero live callers — the commit rides the render's own
`### Maintains` self-attestation. So the author's postconditions are *compiled*
but not yet the *enforced* commit gate. Threading the compiled validators onto
the live commit step (02 gap cluster 1) makes Rule 3's "no attestation, no
commit" a deterministic guarantee rather than a render self-report. The author
writes postconditions to it now; the enforcement tightens harness-side.

### 5. Lower and enforce the `### Invariants` actuation boundary

Rule 4's actuation quarantine is authored prose today: `### Invariants` declares
the rate/scope/prohibited-action bounds, but the section is never lowered into
the render — it constrains the model only as prose, bounded in practice by the
cwd-rooted workspace sandbox and the turn cap, with no world-mutation actuation
sink. Lowering it into the render (02 gap cluster 3) makes a projection-only
contract's "the only writable surface is the published truth" a harness-enforced
guarantee rather than an author's request. Author the boundary now; it binds once
the harness lowers it.

### 6. Forecast-paced continuity cadence

The self-driven recheck path is wired (freshness-lapse → synthetic self-receipt,
a zero-token fingerprint move), but `reactor serve` polls it on a flat
`--poll-interval`. The deferred work is arming each node's soonest
`next_self_recheck` off its freshness so an idle reactor sleeps to the next real
expiry instead of waking every interval — the *forecast-paced quiescence* Part I
implies. The same step is owed for a gateway's declared `### Schedule`, which the
compiler drops today (so the gateway runs on the flat serve poll, not its
authored cadence); honoring it as a freshness-paced cadence rides with this work.
The author already writes the `valid_until` (and the `### Schedule`) that feeds
it; the cadence tightens harness-side, without a source change.

### 7. Richer serve ingress adapters

`reactor serve` supports local cron-poll and HTTP, plus gateway poll connectors
with a durable idempotency cursor. Queues, file watches, provider subscriptions,
and webhook authentication remain later runtime phases. Until they land, a
file-watch-shaped responsibility is authored as a poll `### Continuity`; the
intended ingress form should be noted in the contract so it migrates cleanly.

### 8. The cryptographic signer (cross-trust-domain composition)

The receipt ledger is content-addressed and chain-verifiable, and the `signer`
is an explicit null-state (`{ scheme: "none", null_reason: ... }`; the signature
union ships only the null branch). v1 "signed" means meaning-layer
chain-consistency. The deferred milestone is the
cryptographic byte-hash signer, after which a downstream can pin an *acceptable
signer set* in `### Requires` and have it enforced — closing the cross-trust-domain
supply-chain edge that is, today, the author's discipline rather than the
runtime's guarantee.

### Definition of done for the authoring layer

- `contract-markdown.md` documents `### Continuity` as the cadence/memo input
  and `### Maintains` postconditions as the commit gate, with the
  retired-status-enum doctrine explicit.
- A facet under-faceting lint exists; doctrine never promises an on-disk
  `published/<facet>/…` subtree.
- The prose→spec materiality lowering is hardened across the example corpus.
- The compiled postconditions are wired onto the live commit (`gateCommit`), so
  the author's `### Maintains` postconditions are the enforced commit gate, not
  only the render's self-attestation.
- The `### Invariants` actuation boundary is lowered and harness-enforced, so a
  projection-only contract's "only the published truth is writable" is a
  guarantee, and the failed receipt carries the routed `reason`.
- `reactor serve` arms `next_self_recheck` (forecast-paced cadence) so an idle
  reactor sleeps to the next real expiry.
- The cryptographic signer lands and a pinned signer set is enforceable for
  cross-trust-domain composition.

### Open authoring items

Deferred by design, tracked so they are neither invented nor dropped:

1. **The fixpoint (topology-as-responsibility).** Mounting the compile-phase
   renders — Forme above all — as ordinary nodes so the reconciler wakes them on
   a contract-set-change receipt, and the system maintains itself, is the
   closing recursion. It is **post-v1** by design; v1 runs compile as a batch
   step on contract change with the topology a fixed input per scheduling epoch.
   This is the deliberate deferral, not an oversight.
2. **Facet / materiality inference.** The author states facets and materiality
   today; an inference loop that proposes them from the truth's shape is
   v-next.
3. **Ledger compaction.** A signed-snapshot-plus-truncate path for high-churn
   nodes is deferred; today the ledger is the full append-only trail.
4. **The default `valid_until` freshness projector for serve.** A first-class
   serve-time projector that surfaces soonest-expiry across nodes (the input to
   adaptive idle) rides with the forecast-paced cadence work above.

> `02-ReactorHarness.md` says what the machine must do.
> `03-ReactorPattern.md` says what to write so it does it. The pattern is
> fully writable now in the current model; its full power lands as the harness
> climbs from flat-poll continuity and a null-state signer to forecast-paced
> rechecks and a cryptographic chain — and, last, to the fixpoint. Author to the
> ideal, document the climb honestly.
