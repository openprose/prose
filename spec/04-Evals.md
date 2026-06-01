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
   `<state-dir>/receipts.json` ledger (02 _Open specification items_, item 1), read offline by the keyless
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

Run **both model-bearing roles** (the compile and render roles — 02
_Architecture_) so the compile/render seam stays honest, not assumed. Report
role-fit and **architecture-compensation curves** (the cheap-vs-frontier render
gap with and without memoization + a compiled canonicalizer), never a single
quality ranking.

---

## II. What Exists Today — the shipped replay-and-cost surface

What ships is the **offline half** of the instrument: a real receipt ledger, a
keyless replay over it, and the two cost-truth surfaces the cost thesis is read
through. There is **no judge, verdict, calibration, or policy-compile loop** to
score — the run phase contains no LLM judgment (the dumb reconciler decides
skip / render / gateCommit / propagate over `(contract_fingerprint,
input_fingerprints)`), so decidability-over-judgment (invariant 1) is a property
of the artifact, not a methodology layered on top of it. What is shipped is
**unit- and contract-verified tooling**; what is _not_ shipped is the
preregistered cost-thesis **run** and the adversary baselines — those are Part
III.

- **The proof object exists and replays keyless.** `@openprose/reactor` v0.2.0
  emits the content-addressed receipt (`status ∈ {rendered, skipped, failed}`,
  `cost.tokens.{fresh,reused}`, `cost.surprise_cause ∈ {input, self, external}`,
  `prev`-linked chain) into the flat `<state-dir>/receipts.json` trail (02 _Open
  specification items_). `@openprose/reactor-devtools` v0.1.0 reads that trail
  with **zero running reactor and zero model key**: `reactor-devtools
  <state-dir> --describe` prints per-node `rendered`/`skipped`/`failed`
  dispositions, the moved-facet diff, a **cost rollup split by
  `surprise_cause`** (`tokens.fresh` vs `tokens.reused`, with `wake-cause` as
  the old synonym), and a per-node **chain-verify** line; `--describe --json`
  emits the same as a parseable object for CI/agents. The animated SPA (`flash`
  on render, **dim-pulse on memo-skip**, red on fail, per-facet edge lights, a
  live fresh-vs-reused token meter) is the same read, animated — "the
  visualization _is_ the audit trail." (README + `src/data`, `src/cli.ts`.)
- **Chain-verify is meaning-layer, not cryptographic.** `verifyReceiptChain` /
  `verifyReceipt` run over the **raw on-disk** receipts: each receipt's
  `content_hash` must match its canonical payload and link its `prev`. This is
  tamper-_evident_ against accidental or independent edits (a detected break
  prints `CHAIN-VERIFY FAILED` and exits 1) but **not** non-repudiation against
  a forge that re-stamps the whole trail — v1 has a **null signer** (`{ scheme:
  "none", null_reason: … }`). The library refuses to claim a signature scheme it
  does not have. (reactor README _Signer caveat_; devtools README _data
  contract_.)
- **The Cradle hero shot is the flat-token replay, today realized as a committed
  fixture — not a benchmark result.** The static-world scenario Part I names is
  shipped as the keyless `--example masked-relay` fixture (a deterministic
  content-pipeline state-dir: receipts + `compile/topology.json` +
  `world-models/`) replayed offline, where `tokens.fresh` vs `tokens.reused`
  makes the fresh-vs-reused ratio recoverable from the trail. A `--describe` of a
  shipped sample prints a `(synthetic sample ledger — token counts are
  illustrative, not a bill)` banner: **these token figures are scripted, not a
  measured spend.** A second committed fixture, the **Agent State Observatory**
  (`fixtures/agent-observatory`), is the launch-video corpus — it adds the dark
  facet-lane, a `failed` receipt, and a `self`-tick the masked-relay fixture
  lacks. Both are illustrative cost _stories_, not the report-grade cost
  _result_.
- **The scenario harness is real, and drives the dumb reconciler directly.** A
  surprise-cost eval is authored against the public SDK (`@openprose/reactor` +
  its `/sdk` subpath) by hand: `mountDag` over a `ReconcilerTopology`, a
  deterministic render per node, `ingest(node)` to wake to a fixpoint, then read
  back `ReconcileResult.disposition` and the `createReplaySession({ ledger
  }).costRollup` — the **same read view devtools renders**. The probed property
  is exactly Claim A's memo sub-claim: _a node renders iff its memo key
  `(contract_fingerprint, input_fingerprints)` actually moved_; a quiet re-wake
  must `skip` and leave `costRollup.total.fresh` unmoved. This is the
  `reactor/EVALS.md` "send us the eval where Reactor _should_ skip and doesn't"
  loop, run verbatim in the package's own test suite. The in-tree scenarios
  (`masked-relay`, `implementation-pipeline`, the basic-unit suite) have **pure
  deterministic** offline bodies that gate the commit and a **live** sibling
  (`*.live.test.ts`) that swaps the fakes for the live `createAgentRender`
  adapter — the reconciler cannot tell them apart.
- **The CLI observe surface is the keyless cost-truth driver.** `@openprose/
  reactor-cli` v0.1.0 ships the model-free, offline-gated read commands —
  `status` (standing compile cost beside live run cost), `topology`, `inspect
  <node>` (fingerprints + chain), `logs`, `trace`, and `receipts (list | verify
  | cost)` — all with `--json`. `reactor receipts cost --json` is the
  CLI-driven equivalent of `reactor-devtools --describe --json`: both surface the
  **same** rollup-by-`surprise_cause` off the trail. `receipts verify` (and a
  `--strict` `inspect`) exits nonzero on a broken chain.

> What is shipped: a real receipt, a keyless replay, two reconciled cost
> surfaces, a hand-driven scenario harness, and two illustrative committed
> fixtures. What is **not yet** shipped: a preregistered benchmark _run_, the
> adversary baselines, the model matrix, and any report-grade cost _result_.
> Today's fixtures tell the cost story; they do not yet measure it.

---

## III. The Plan To Get There — from illustrative fixture to report-grade run

The offline instrument exists; the **measured result** does not. Every item
below is owed to the report, and each is built _on top of_ the shipped trail —
the receipt, the keyless replay, the `surprise_cause` rollup — never against a
competing schema. The order is the order of credibility.

1. **Freeze the preregistration, then mint a real ledger.** The cost thesis is a
   preregistered falsifiable hypothesis (invariant 3): the surprise labels, the
   decision rule, the baseline set, and the model matrix are content-hashed
   _before any run_. The acceptance instrument is already shipped — `reactor
   receipts cost --json` and `reactor-devtools --describe --json` over the flat
   `receipts.json`. What is owed is the run that emits a **non-synthetic**
   ledger: replace the `(synthetic sample ledger)` fixtures with a real
   `reactor serve`/`run` spend so `tokens.fresh` vs `tokens.reused` is a bill,
   not a script. This is the Cradle static-world scenario promoted from
   illustrative fixture to the cost-thesis hero _measurement_.
2. **Build the adversary baselines — the strongest cheap thing, not a strawman**
   (invariant 2). Neither baseline exists yet: an **oracle-optimally-scheduled
   cron** and a strong **content-diff-plus-embedding cache**, each presented to
   the trail under the same replay-and-cost contract the Reactor already
   occupies. The non-obvious honesty: on the silent-drift headline regime a
   content cache is **blind by construction**, so the load-bearing comparator
   there is the oracle cron, and a baseline that ties on a regime is reported as
   a tie **in the abstract**.
3. **Run both model-bearing roles — the Claim-B matrix.** With the judge retired,
   the two roles to vary are **render** (does the bounded session compute a
   correct next world-model?) and **compile** (does the model lower `###
   Maintains` into a _sound_ canonicalizer + postcondition validators?). The
   live `createAgentRender` adapter and the `agent-compile` adapter are the
   seams; the deliverable is the **architecture-compensation curve** — the
   cheap-vs-frontier render gap _with and without_ memoization plus a compiled
   canonicalizer — reported as role-conditional fit, never a single ranking.
4. **Quantify the boundary, do not hide it** (invariant 6). Measure where
   cost-scales-with-surprise degrades to a freshness cadence: the compile-phase
   floor (re-deriving canonicalizer + topology + validators on a contract
   change) and the no-cheap-hash domain (where deciding "did it change"
   essentially _is_ the work). Stating the boundary precisely is what makes the
   central claim believable.
5. **Replay the eval itself from a clean clone** (invariant 7). The fixtures are
   already content-addressed and the replay never re-derives the trail; the
   remaining work is pinning model snapshots so a snapshot roll **voids** (never
   patches) a run, and a skeptic reproduces the headline from a fresh checkout.
6. **Write the report after the evals, never before.** Strong claim, then the
   evidence, then the boundary. Ties and losses in the abstract.

**Genuine deferrals (post-v1).** A **cryptographic byte-hash signer** to replace
the null signer (turning meaning-layer tamper-evidence into non-repudiation);
**ledger compaction** of the flat `receipts.json` as the trail grows;
**facet inference** (the v-next "infer the cadence rather than declare it"
capability invariant 2 names as _not_ what v1 claims), and the default
`valid_until` freshness projector + adaptive serve cadence on the harness side;
and **the fixpoint demonstration** — topology-memoization as one more
responsibility, the closing recursion where "one mechanism, three
demonstrations" is shown rather than asserted (invariant 9). Each is marked
post-v1 and is not gating the first report.

**Launch standard.** Do not publish "Reactor-class harness" until both claims
survive their _strongest cheap adversaries_ under preregistration, the
boundaries are quantified not hidden, the suite replays from a clean clone, and
a skeptical reader can reproduce enough to be unable to dismiss it.
