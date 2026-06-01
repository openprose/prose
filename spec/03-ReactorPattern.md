# OpenProse Reactor Pattern

###### How to write OpenProse for a Reactor-class harness — the language layer beneath evented reconciliation.

The OpenProse corpus divides labor exactly, and each document maps to what
ships:

- [01-Language.md](./01-Language.md) — **the Language & Framework**, bundled as
  the **SKILL**: syntax, kinds, sections, compile model, std/co, CLI surface.
- [02-ReactorHarness.md](./02-ReactorHarness.md) — **the Reactor
  Harness**, bundled as the **CLI/Server**: the runtime control architecture
  (loop, invariants, kernel, memoization, forecast, receipts, composition). It
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
forecast-gated quiescence, variable-depth judging, and receipt composition.
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
| The standing goal | `responsibility` | One `### Goal` sentence + the `### Maintains` world-model that makes it true (facets, canonicalization, postconditions) |
| Event ingress | `gateway` | How and when the world is allowed to wake the loop |
| A helper | `function` | A called, ephemeral computation a render invokes — `### Parameters` → `### Returns` |

There is no separate "fulfillment system," no "sense service," no "verdict
service," and no "ledger service": the render *is* the fulfillment, the
canonicalizer *is* how change is sensed, the commit gate *is* the verdict, and
the signed receipt ledger *is* the storage — all owned by the harness, not
authored. A reader who understands the responsibility understands the program;
the rest is _how_, and may change without the intent changing (invariant 8, at
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
| 5. Cost scales with surprise | Write `### Maintains` so "did anything material change?" is **cheaply decidable** — give the truth a stable content identity and facet it so an unrelated change wakes nobody. Declare freshness (`valid_until`) in `### Continuity` so silent staleness still wakes the node. This is the rule authors most often violate. |
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

These were once one rule; they are two jobs, and conflating them is the most
common authoring mistake.

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
  before it signs. `gateCommit` fails closed: no attestation, no commit.

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
re-enters the memo, and `### Invariants` bounds what the render may touch.

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
so the dumb reconciler can skip:

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
  a supply-chain attack the author closes, not the runtime. (In v1 "signed" is
  meaning-layer chain-consistency; the cryptographic signer is a deferred
  milestone.)

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
node, a judge tier, or an autowired graph. Depth — running a critic only on the
uncertain branch — is ordinary `### Execution` control flow, not a
confidence-gated judge ensemble.

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

- Input-driven: wake when the `competitors` watchlist changes.
- Self-driven: each part carries a `valid_until` of +1 business day; when it
  lapses, that part is re-checked against the world.

### Invariants

- Read-only on the outside world: never contact a competitor or alter a source.
- The only writable surface is the `competitor-activity` world-model.

### Tools

- cli:web-fetch
- cli:fs-read
```

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

What the harness does with this, for free:

- A re-poll that finds **no material funding change** produces an unchanged
  `funding` fingerprint, so the monitor writes a `skipped` receipt and the brief
  never wakes — *cost scales with surprise.*
- A new **hiring** signal moves only the `hiring` fingerprint; the brief
  subscribes to `funding`, so it stays asleep — *facets make subscription
  selective.*
- When `funding`'s `valid_until` lapses, the continuity clock moves its
  fingerprint and wakes the monitor with a zero-token self-receipt; if the
  re-check finds real news, *that* propagates to the brief.
- A render that cannot cite a source for an entry fails its postcondition,
  commits nothing, and leaves a `failed` receipt — the prior truth stands.

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
  invariants 6/7). Name the facet in `### Requires` instead.
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

This section assumes the responsibility CLI harness branch is merged and
released (`@openprose/responsibility` backing both CLI and API), consistent
with Part II of the harness doc.

### The authoring surface that already exists

The headline finding: **the Reactor-native pattern requires no
new syntax.** Everything in Part I is expressible with the current skill.

| Pattern element | Skill support today |
| --- | --- |
| `kind: responsibility` with `### Goal`/`### Continuity`/`### Criteria`/`### Constraints`/`### Tools`/`### Fulfillment` | Present; `id:` is tooling-minted and stable across `name:`/filename renames (see `contract-markdown.md`) |
| `kind: gateway` with `### Schedule`/`### Receives`/`### Emits`/`### Payload` | Present |
| Fulfillment `kind: system`, `persist: project`, auto-wired via Forme | Present |
| `### Execution` ProseScript: `call`, `parallel`, `for`, `loop`, `if`, `choice`, `try/catch/finally`, `agent`, `session`, `resume`, pipelines | Present — sufficient for the quiescence short-circuit and variable-depth gate |
| `### Shape` (self / delegates / prohibited) for the actuation boundary | Present |
| `### Memory` (`reads:`/`writes:`) for the durable ledger | Present |
| std patterns (`oversight`, `fan-out`, `dialectic`, `guard`, `worker-critic`, `map-reduce`, …) instantiated by YAML in `### Services` | Present |
| std/delivery renderers and file-writer for projections; project-memory service for the ledger | Present |
| `prose compile` → IR, `prose serve` (cron + HTTP), `prose status`, judge status / pressure / Reactor decision records | Present |

The skill can already express the _shape_ of a Reactor-native program end to
end: a responsibility, a gateway, a projection-only or full fulfillment system,
a memoization-friendly sense/judge/ledger decomposition, variable-depth
escalation behind a confidence gate, and a composition edge via a project
ledger.

### Current authoring limits

Part I states the pattern as an unqualified north star. This section is where
authoring reality is honest.

| Authoring rule | State | Gap / what the author must currently do |
| --- | --- | --- |
| 1. Intent lives in the responsibility | Conformant | Fully authorable today |
| 2. Policy stated semantically, not as ProseScript | Conformant (authoring) | Author writes intent in `### Continuity`/`### Constraints`; the _two-timescale model-authored recompile_ is harness-side and not yet built — the author's semantic statement is correct and forward-compatible regardless |
| 3. No host-specific contract logic | Conformant | `### Tools`/`### Environment` are name-only by design |
| 4. Bounded activations | Conformant | Idiomatic; the anti-pattern is author error, not a skill gap |
| 5. Written for memoization / variable depth | Partial | Author _can and must_ emit a content identity from the sense service and gate depth in `### Execution`; the harness memo and forecast that consume the identity are "Not yet" per harness Conformance Ledger invariant 5. Author writes it now; full benefit lands when the harness does |
| 6. Composition via referenced upstream trail | Partial | Expressible only as a `persist: project` ledger reference today; content-addressed signed receipts with pinned revision/signer are harness "Partial." Pin the revision in `### Criteria` now; cryptographic signing is an optional pluggable adapter for cross-trust-domain composition, not a deferred tier |
| 7. Ledger as receipt/audit/exit unit | Partial | `### Memory` ledger works; `as_of` / `next_forecast_recheck` / content-addressing are conventions the author adds by hand until the receipt schema is finalized |
| 8. Replayable and exitable | Partial | Contract + ledger are plain and portable; a first-class export/exit surface is harness "Partial" |

### Honest current limits for authors

- **File-watch gateways are not in `prose serve`.** Live serve supports cron
  and HTTP only; queues, file watches, and provider subscriptions are explicit
  later phases. The Reactor-native worktree/planning-dir example must use a
  forecast-paced `### Schedule` today and note the intended file-watch form.
- **Memoization, forecast, and variable-depth are harness policy, not author
  syntax.** The author's leverage is indirect: write `### Continuity` and the
  sense service so a stable identity _exists_ to memoize on. A contract that
  makes "did anything change" expensive defeats the mechanism no matter how
  good the harness is.
- **Receipt composition is approximated by project memory.** "B consumes A's
  content-addressed signed receipt" is authored as "B reads A's
  `persist: project` ledger and pins A's revision in `### Criteria`."
  Functionally adequate; cryptographically weaker than the ideal until
  receipts harden.
- **The two-timescale policy loop is not authorable.** Authors state policy
  _shape_ semantically; they cannot yet author the meta-Reactor that recompiles
  policy on drift. This is correct — it is harness machinery — but it means a
  Part I claim ("policy is model-authored and recompiled") is, at the authoring
  layer, an intent statement the runtime does not yet fully honor.

> The pattern is fully writable today. Several of its headline payoffs
> (provable quiescence, forecast-manufactured rechecks, verifiable composition)
> are harness commitments the author writes _toward_ and the runtime does not
> yet fully deliver. Author to the ideal; do not claim the runtime already
> reaches it.

---

## III. What Must Change In The Skill

These are documentation and doctrine changes, not syntax changes. They make
the Reactor-native pattern the _taught default_ rather than an advanced corner.

### 1. Invert the Mental Model in `01-Language.md`

The "Mental Model" section currently lists Responsibility Runtime last, as a
continuity addendum to a system-centric model. Rewrite it responsibility-first:
the responsibility is the program; the gateway is ingress; the system is one
beat of the loop; Forme/VM/ProseScript are the substrate. Keep the
system-centric model as the bounded-work special case, explicitly labeled as
the N=0 (no continuity) case of the Reactor base case.

### 2. Reframe the "Directly runnable?" table

Add a column or a footnote distinguishing _run_ (bounded) from _serve_
(reconciled). State plainly that `kind: responsibility` being "not directly
runnable" means "continuously reconciled" and is the **intended top-level
authored object** for any standing goal — not a lesser artifact.

### 3. Add Reactor-native routing to `SKILL.md`

"First 90 Seconds" routes "Run a `.prose.md` service or system" as the default
and Responsibility Runtime as a specialist path. Add a recognition signal and a
first-class route:

- Recognition signal: "make sure X stays true," "keep Y current," "watch Z and
  maintain a view" → **author a responsibility + gateway first**, derive the
  system second.
- Route: when the user describes a standing goal, load
  `responsibility-runtime.md` and this pattern before `forme.md`/`prose.md`,
  not after.

### 4. Promote the authoring rules into `guidance/authoring.md`

Add a "Reactor-Native Authoring" section that ports Part I's eight rules as a
checklist, with the memoization rule (Rule 5) called out as the one authors
most often violate. Include the sense-service-must-emit-a-content-identity
requirement as a lint-able expectation.

### 5. Strengthen `### Continuity` / `### Criteria` doctrine in `contract-markdown.md`

These two sections are documented thinly relative to the load they now bear.
`contract-markdown.md` should state that `### Continuity` is the author's input
to forecast and memoization (name the freshness referents and the
memo-breaking condition; make "nothing changed" cheaply observable) and that
`### Criteria` must use observable referents, with "undecidable" framed as an
expected, high-value `blocked` reason routed to the author — never an enum.

### 6. Add a canonical Reactor-native example

The examples set demonstrates full Reactors (stargazer, incident, compliance).
Add a **projection-only** example — an observe-but-never-touch overseer like
the three-layer Codex-build overseer — to teach the amputated-fulfillment
shape, the composition-via-ledger edge, and the
forecast-paced-schedule-as-file-watch-stand-in limit. It is the clearest
teaching case for "cost scales with surprise, not the watched system's
activity."

### 7. Document the projection-only Reactor as a first-class shape

Both `responsibility-runtime.md` and `concepts/reactor.md` should name
projection-only (judge + projection, no fulfillment) as a deliberate,
supported shape with its own `### Constraints` idiom, not an incomplete
Reactor. This is a recurring real use case (audits, overseers, dashboards) and
is currently undocumented.

### Definition of done for the authoring layer

- `01-Language.md` Mental Model is responsibility-first; the runnable table no
  longer implies responsibilities are lesser artifacts.
- `SKILL.md` routes standing-goal language to responsibility authoring before
  system wiring.
- `guidance/authoring.md` carries the eight Reactor-native rules as a
  checklist, with the content-identity requirement explicit.
- `contract-markdown.md` documents `### Continuity` as forecast/memo input and
  `### Criteria` decidability with the undecidable-`blocked` doctrine.
- A projection-only example ships and runs from a fresh clone.
- Every Part I rule that is harness-"Partial"/"Not yet" is cross-referenced to
  the harness Conformance Ledger so authors are never told the runtime
  delivers what it does not.

### Open authoring items

Deferred by design, tracked so they are neither invented nor dropped:

1. **Content-identity convention.** The *existence* of the obligation is now
   stated in [01-Language.md](./01-Language.md) Part I (a sense service may
   return a stable content identity as an `### Ensures` output); only the
   *convention* — the exact shape of the identity (hash of what, normalized
   how) — is deferred here, pending the harness receipt-schema research
   (harness open item I.1).
2. **Composition reference syntax — resolved.** "B depends on A" is authored
   as a reserved `responsibility` typed-input in `### Requires` (the same
   mechanism as `run`/`run[]`), pinning upstream id-or-path + contract
   revision + acceptable signer set; see [01-Language.md](./01-Language.md)
   Part III §3. Kernel-verifiable, not a Forme edge. The prose-ledger
   reference is the pre-receipt-schema stand-in until the receipt
   `composition` block lands.
3. **Policy-shape vocabulary.** How an author states hysteresis _shape_ ("this
   signal is noisy → widen the band") — and, equally, upstream freshness
   tolerance ("A may be one business day stale") — semantically, in a way the
   model-authored policy compile can consume, is principle-only (harness open
   item I.4).
4. **Projection-tier authoring.** Owner / subscriber / public projection
   contracts (the privacy-as-failure-mode safeguard) have no authoring section
   yet; today it is ad hoc per fulfillment system.

> `02-ReactorHarness.md` says what the machine must do.
> `03-ReactorPattern.md` says what to write so it does it. The pattern
> is fully writable now; its full power lands as the harness Conformance
> Ledger closes. Author to the ideal, document the climb honestly.
