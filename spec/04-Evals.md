# OpenProse Reactor Evals

###### How to prove a Reactor-class harness's category claim survives a hostile expert.

The OpenProse corpus divides labor exactly, and each document maps to what
ships:

- [01-Language.md](./01-Language.md) — **the Language & Framework**, bundled as
  the **SKILL**: syntax, kinds, sections, compile model, std/co, CLI surface.
- [02-ReactorHarness.md](./02-ReactorHarness.md) — **the Reactor Harness**,
  bundled as the **CLI/Server**: the runtime control architecture (loop,
  invariants, the reconciler, memoization, forecast, receipts, composition). It answers
  _what the runtime must do_.
- [03-ReactorPattern.md](./03-ReactorPattern.md) — **the Reactor-Native
  Authoring Pattern**: how to write `*.prose.md` so the harness's mechanisms
  engage.
- [04-Evals.md](./04-Evals.md) — **this document, the evaluation methodology**,
  **not shipped as runtime**: it travels with the technical report. It answers
  _how we prove 02's claims are true, to a reader who is paid to say they are
  false_. It is to 02 what a measurement protocol is to a physical theory.
- [00-Tenets.md](./00-Tenets.md) — **the constitution**; when the system is in
  tension with a tenet, the tenet wins.

Three parts, mirroring the structure of its siblings: **the ideal
evaluation**, **what exists today**, **the plan to get there**.

---

## I. The Ideal Evaluation

### What an eval suite for a category claim actually is

It is not a test suite. Tests answer "did the code do what we built it to do."
This instrument answers a harder question: **"is the category real, and is it
ours?"** — asked by a reader who is paid to say no. Every design choice below
is the answer to one question asked of the suite: _what would a hostile expert
need to see before they could no longer dismiss the claim?_ The eval is an
instrument of adversarial persuasion; its credibility is the strength of the
strongest baseline it beats, not the number of tests it passes.

### The only two claims that matter

The technical report makes exactly two load-bearing claims. The suite exists
to make each _difficult to dismiss_, and to **state precisely where each
fails** — a claim with no stated failure boundary reads as marketing:

- **Claim A — "Reactor is better."** Not better in general — better at the one
  thing the architecture exists for: _maintaining truth under evented change at
  a cost that scales with surprise rather than wall-clock time, while failing
  safe._ This is not one claim; it is a small set of per-mechanism falsifiable
  sub-claims (below), each of which could have come out the other way.
- **Claim B — "Model X is better than Model Y _for Reactor_."** The
  first-principles reframe that makes this useful rather than a leaderboard:
  the result is **role-conditional fit**, not a ranking. With no judge, the two
  model-bearing roles are the **render** (does the bounded session compute a
  correct next world-model?) and the **compile** (does the model lower
  `### Maintains` into a _sound_ canonicalizer + postcondition validators?). The
  defensible, report-grade findings are (i) which model is the best renderer and
  which the best compiler; and (ii) **where the architecture compensates for a
  weaker model** — if memoization plus a compiled canonicalizer narrows the gap
  between a cheap and a frontier render, that _is_ the architectural value
  proposition restated in model terms, and it is the single most valuable Claim-B
  result.

### The eval invariants

Each survives the negation test: drop it and a hostile reviewer wins.

1. **Decidability over judgment.** Every headline number is the output of a
   deterministic predicate over a content-addressed artifact — the flat
   `<state-dir>/receipts.json` ledger (02 §6.1), read offline by the keyless
   `reactor-devtools --describe` replay. **No headline claim may rest on an LLM
   grading an LLM** — and with the judge retired, the run phase contains no LLM
   judgment to grade at all; the wall is even cleaner than before. Output
   _quality_ ("was the briefing good?") is real but lives in a separate,
   clearly-labelled, blind-human-adjudicated track that never enters the
   abstract. This wall — decision-trace correctness vs. output quality — is the
   single biggest credibility lever and the methodology's keystone.
2. **The adversary is the strongest cheap thing, not a strawman.** Beating a
   naive single-agent loop proves nothing. The load-bearing baseline is the one
   that is _cheap **and** correct_ in the regime under claim: a strong
   content-diff-plus-embedding cache, and an **oracle-optimally-scheduled
   cron**. The non-obvious, empirically-confirmed point: on the silent-drift
   headline regime a content cache is **blind by construction**, so beating it
   there demonstrates nothing — the honest comparator is the oracle cron, and
   the real claim is _"Reactor's declared freshness cadence catches drift a
   content cache is blind to, approaching an oracle schedule."_ (Inferring that
   cadence rather than declaring it is a named v-next capability, not what v1
   claims.) A strong cheap baseline that ties Reactor on a regime is reported as
   a tie **in the abstract**.
3. **The cost claim is a preregistered falsifiable hypothesis with an explicit
   null.** "For every token, name the surprise" is operationalized as a
   regression of spend on preregistered surprise-count against the null that
   spend tracks wall-clock / event-count, with the surprise labels frozen and
   content-hashed _before any run_ and the decision rule fixed _before any
   data_. A graph is not a result; a hypothesis that could have failed is.
4. **Preregistration, and the abstract carries its own losses.** Persuasive
   power is inversely proportional to what the report hides. The surprise
   labels, statistical decision rule, baseline set, and model matrix are
   committed (hashed) before runs; ties and losses appear in the abstract with
   the same prominence as wins. A reviewer cannot allege fishing when the
   analysis plan predates the data and the failures are stated up front.
5. **Honest cost-confidence.** Token-truth is local and deterministic; any
   normalized or dollar figure is **provider-reconciled or it is explicitly not
   report-grade** — a hard-won empirical lesson: the provider generation
   endpoint is latency-bound, and response-usage is not reconciled usage. Every
   cost figure carries its confidence tier.
6. **Boundaries are measured, not hidden.** The architecture has structurally
   irreducible costs (the compile-phase floor — re-deriving the canonicalizer,
   topology, and validators when a contract changes; and the no-cheap-hash
   domain, where deciding "did it change" essentially _is_ the work — 02 _Where
   it excels_). An eval that only shows the favorable regime is not report-grade.
   The instrument must **quantify the boundary**: where cost-scales-with-surprise
   degrades to freshness cadence, and by how much. Stating the boundary
   precisely is what makes the central claim believable.
7. **The eval is itself replayable and exitable.** The suite that proves the
   receipt invariants must obey them: fixtures content-addressed, model
   snapshots pinned, a snapshot roll **voids** (never patches) the run, the
   whole thing reproducible by a skeptic from a fresh clone. The replay engine
   runs against the recorded receipt artifact and never re-derives it. The
   report-grade instrument is concrete: a benchmark run emits a real ledger, the
   keyless `reactor-devtools --describe` replays it offline, and the **Cradle**
   static-world flat-token scenario is the cost-thesis hero shot — `tokens.fresh`
   vs `tokens.reused` makes the fresh-vs-reused ratio recoverable from the trail.
8. **Two truth oracles, never merged** (mirrors 02's failure model):
   correctness-truth ("was the maintained truth right") and cost-truth ("what
   did it cost") are different sockets with different failure meanings; a cost
   result may never launder into a correctness result or vice versa.
9. **The suite mirrors the unification recursions, not a feature list.** Per
   02's thesis, composition-amortization and the **fixpoint**
   (topology-memoization) are the N>1 and self-maintenance recursions of the
   _same_ memoization mechanism. The suite is structured so the report says "one
   mechanism, three demonstrations," not "twelve features." (The fixpoint
   demonstration is a post-v1 track, marked as such.)

### Claim A, decomposed

Each sub-claim ships with a one-sentence statement and explicit null, its
strongest cheap adversary, a deterministic decision predicate, and a
preregistered decision rule.

| Sub-claim | Strongest cheap adversary | Decided by |
| --- | --- | --- |
| Cost scales with surprise, not time | oracle-cron + strong diff/embedding cache | regression vs. null over a content-hashed receipt log |
| Memoized reuse spends zero tokens — the render body never runs | Reactor-without-memoization | a `skipped` receipt carries zero `cost` with fingerprints copied forward; pure predicate over the ledger |
| Forecast catches silent drift a cache cannot | content cache (blind here, by construction) | injected silent drift; detection vs. oracle-cron at matched cost |
| Fail-safe: an inadmissible render commits nothing | cron + prompt with durable state | a failing postcondition leaves the fingerprint unmoved and wakes no downstream — ledger predicate |
| Receipts replay; composition amortizes; supply-chain pins | Reactor-without-receipts / islands | clean-machine replay equality; N-dependent cost amortization; rejection of unpinned upstream |

### Claim B, decomposed

Run **both model-bearing roles** (`agent-compile` and `agent-render` — 02
_Architecture_) so the compile/render seam stays honest, not assumed. Report
role-fit and **architecture-compensation curves** (the cheap-vs-frontier render
gap with and without memoization + a compiled canonicalizer), never a single
quality ranking.

---

## II. What Exists Today

- **Methodology: launch-grade.** The committed eval plan operationalizes every
  invariant above — the soundness model over the receipt log, the
  strongest-cheap-adversary set, the falsifiable cost hypothesis, the
  trace-vs-quality wall, the preregistered statistical protocol (paired
  Wilcoxon on per-scenario token deltas, McNemar on correctness). It has
  survived a multi-lens adversarial red-team and an independent re-audit.
- **Apparatus: built and Reactor-independent.** A multi-family fixture set
  across the headline regimes, competitor adapters on a stateful timeline
  contract, a live isolation runner that routes all model egress through an
  authenticated minting proxy (decision-bound receipts, fail-closed effect-log
  reconciliation), a cost-learning loop that reaches provider-reconciled
  confidence, and deterministic trace-scoring with paired statistics — all
  Reactor-independent, run on a cheap model under a strict cost cap.
- **Evidence: partial.** Real isolated competitor runs are collected; the model
  matrix is in progress. There is **no Reactor result yet**: the Reactor's own
  `openprose.receipt v0` emitter (02 open item I.1) is not built, and Claim A's
  headline is gated on it. No report has been written, by design — the report
  follows the evidence.
- **Proof object: reconciled to spec.** The eval scores the
  `openprose.receipt v0` log the harness actually emits (02 open item I.1); the
  soundness predicates, tamper matrix, trace-vs-quality wall, and
  preregistration are eval-side methodology _over_ that pinned receipt, never a
  competing schema. The methodology tracks 02; it never leads it.

> The methodology is launch-grade; the apparatus is built and Reactor-free; the
> central evidence — the Reactor column — is still owed, and is owed to the
> harness, not to this document.

---

## III. The Plan To Get There

1. **Proof object stays reconciled.** The methodology derives from
   `openprose.receipt v0` (02 open item I.1). The harness emits one receipt
   definition; the eval scores the receipt the harness actually emits.
2. **Land the Reactor-independent contribution first.** Real isolated
   competitor runs plus the cost methodology and the harness comparison are a
   _publishable contribution on their own_ — collected while the Reactor is
   built, so the apparatus is proven before the subject exists.
3. **The Reactor column docks through the Cradle.** The Reactor row is not a
   bespoke emitter bolted onto the eval harness. It is the Reactor presented as
   one more adapter in the harness's own automated test cradle: a typed SDK
   seam, an adapter-parity matrix with a byte-identity gate, a replay engine
   that runs against the recorded receipt artifact and never re-derives it, and
   assertion families evaluated over the receipt. The eval competitor adapters
   present under that same parity-and-replay contract, so when the Reactor's
   emitter lands the Reactor slots into the socket the competitors already
   occupy. The first harness milestone is itself scoped to _prove or kill the
   cost thesis_ — the same preregistered hypothesis this methodology fixes
   (invariant 3, Claim-A row 1) — so the eval is that milestone's acceptance
   instrument: align the preregistered surprise-label and decision-rule freeze
   with that gate.
4. **Write the report after the evals, never before.** Strong claim, then the
   evidence, then the boundary. Ties and losses in the abstract.

**Launch standard.** Do not publish "Reactor-class harness" until both claims
survive their _strongest cheap adversaries_ under preregistration, the
boundaries are quantified not hidden, the suite replays from a clean clone, and
a skeptical reader can reproduce enough to be unable to dismiss it.
