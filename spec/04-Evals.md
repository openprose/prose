# OpenProse Reactor Evals

###### How to prove a Reactor-class harness's category claim survives a hostile expert.

The OpenProse corpus divides labor exactly, and each document maps to what
ships:

- [01-Language.md](./01-Language.md) — **the Language & Framework**, bundled as
  the **SKILL**: syntax, kinds, sections, compile model, std/co, CLI surface.
- [02-ReactorHarness.md](./02-ReactorHarness.md) — **the Reactor Harness**,
  bundled as the **CLI/Server**: the runtime control architecture (loop,
  invariants, kernel, memoization, forecast, receipts, composition). It answers
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

This document is structured in three parts, mirroring its siblings:

- **Ideal** — the evaluation suite as it *should* be: the full required
  evaluation methodology and its required suite of evals. This is the authored
  vision. It is frozen.
- **Current** — a code-grounded snapshot of what the deterministic evaluation
  apparatus *actually is* today: the `@openprose/reactor-cradle` v0.1 package,
  with real module paths, real scenario IDs, and real test counts.
- **Roadmap (Delta)** — the honest gap: which named evals are not yet built,
  and what bridges Current → Ideal.

`Ideal − Current = Roadmap`. The three are kept distinct so this document can
never again claim shipped what is not.

---

## I. Ideal — The Ideal Evaluation

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
  the result is **role-conditional fit**, not a ranking. The defensible,
  report-grade findings are (i) which model is the best _judge_ (status
  accuracy + calibration), which the best _fulfiller_ (restoration without
  overreach), which the safest _cheap_ model once calibration is earned; and
  (ii) **where the architecture compensates for a weaker model** — if the
  harness narrows the gap between a cheap and a frontier model, that _is_ the
  architectural value proposition restated in model terms, and it is the single
  most valuable Claim-B result.

### The eval invariants

Each survives the negation test: drop it and a hostile reviewer wins.

1. **Decidability over judgment.** Every headline number is the output of a
   deterministic predicate over a content-addressed artifact — the
   `openprose.receipt v0` log (02). **No headline claim may rest on an LLM
   grading an LLM.** Output _quality_ ("was the briefing good?") is real but
   lives in a separate, clearly-labelled, blind-human-adjudicated track that
   never enters the abstract. This wall — decision-trace correctness vs. output
   quality — is the single biggest credibility lever and the methodology's
   keystone.
2. **The adversary is the strongest cheap thing, not a strawman.** Beating a
   naive single-agent loop proves nothing. The load-bearing baseline is the one
   that is _cheap **and** correct_ in the regime under claim: a strong
   content-diff-plus-embedding cache, and an **oracle-optimally-scheduled
   cron**. The non-obvious, empirically-confirmed point: on the silent-drift
   headline regime a content cache is **blind by construction**, so beating it
   there demonstrates nothing — the honest comparator is the oracle cron, and
   the real claim is _"Reactor's learned forecast approaches an oracle schedule
   it was never given."_ A strong cheap baseline that ties Reactor on a regime
   is reported as a tie **in the abstract**.
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
   irreducible costs (the plan-audit floor; the no-cheap-hash domain; the
   no-anchor calibration tax — 02 _Where it excels_). An eval that only shows
   the favorable regime is not report-grade. The instrument must **quantify the
   boundary**: where cost-scales-with-surprise degrades to forecast cadence,
   and by how much. Stating the boundary precisely is what makes the central
   claim believable.
7. **The eval is itself replayable and exitable.** The suite that proves the
   receipt invariants must obey them: fixtures content-addressed, model
   snapshots pinned, a snapshot roll **voids** (never patches) the run, the
   whole thing reproducible by a skeptic from a fresh clone. The replay engine
   runs against the recorded receipt artifact and never re-derives it.
8. **Two truth oracles, never merged** (mirrors 02's failure model):
   correctness-truth ("was the verdict right") and cost-truth ("what did it
   cost") are different sockets with different failure meanings; a cost result
   may never launder into a correctness result or vice versa.
9. **The suite mirrors the unification recursions, not a feature list.** Per
   02's thesis, composition-amortization and policy-recompile-stability are the
   N>1 and policy-over-time recursions of the _same_ memoization mechanism. The
   suite is structured so the report says "one mechanism, three
   demonstrations," not "twelve features."

### Claim A, decomposed

Each sub-claim ships with a one-sentence statement and explicit null, its
strongest cheap adversary, a deterministic verdict predicate, and a
preregistered decision rule.

| Sub-claim | Strongest cheap adversary | Decided by |
| --- | --- | --- |
| Cost scales with surprise, not time | oracle-cron + strong diff/embedding cache | regression vs. null over a content-hashed receipt log |
| Memoized reuse spends zero judge tokens | Reactor-without-memoization | `tokens.reused` is judge-free in the receipt; pure predicate |
| Forecast catches silent drift a cache cannot | content cache (blind here, by construction) | injected silent drift; detection vs. oracle-cron at matched cost |
| Variable-depth preserves accuracy at lower cost | fixed-ensemble Reactor | accuracy delta ≈ 0 with cost delta < 0, preregistered band |
| Fail-safe interrupt precision | cron + prompt with durable state | typed-interrupt confusion matrix vs. oracle labels |
| Receipts replay; composition amortizes; supply-chain pins | Reactor-without-receipts / islands | clean-machine replay equality; N-dependent cost amortization; rejection of unpinned upstream |

### Claim B, decomposed

Run **both adapter seams** (the bounded-activation agent SDK and the
model-gateway socket — 02 _Architecture_) so the seam boundary stays honest and
the policy-author migration path is exercised, not assumed. Report role-fit and
**Reactor-compensation curves** (cheap-vs-frontier gap with and without each
mechanism), never a single quality ranking.

---

## II. Current — What the Apparatus Actually Is

Audited 2026-05-21 against `openprose/prose` `main` at HEAD `52724ed`. The
deterministic evaluation apparatus is the **`@openprose/reactor-cradle`**
package, version **`0.1.0`**, at
`packages/reactor-cradle/`. It is published on npm and depends on
`@openprose/reactor` `workspace:0.1.0`. Its test suite is
**121 tests, 0 failures** (`pnpm --filter @openprose/reactor-cradle test`;
`node --test` over the built `dist/`).

What this section reports is true and narrow: **the Cradle is the deterministic
test-and-evidence harness for the local Reactor package — not the full
report-grade evaluation suite derived in Section III.** It carries deterministic scenarios, baselines,
spikes, and release-evidence helpers. It does not run a live provider/model
matrix, has no preregistered statistical track, and is not the report
apparatus. The Cradle is the deterministic floor that ships at v0.1.

### What the Cradle is

> "`@openprose/reactor-cradle` is the deterministic test harness for the local
> OpenProse Reactor package. It is where Reactor behavior is replayed,
> compared, projected, and packaged into release evidence without requiring
> live services for the normal test path."
> — `packages/reactor-cradle/README.md`

It is explicitly **a test and evidence package, not the production Reactor
runtime**, and not the report-grade eval harness of Section I.

### Deterministic scenarios — what ships and is replayable

The Cradle drives real `@openprose/reactor` behavior under deterministic
doubles (a virtual clock, in-memory and filesystem storage, a recorded
model-gateway). Scenarios are integration tests under
`packages/reactor-cradle/src/__tests__/`, each a single `node:test` case:

| Scenario | File | What it deterministically exercises |
| --- | --- | --- |
| **W7** static cost | `w7-static-cost.integration.test.ts` | Static-world Cradle run; composes Reactor cost helpers; flat-spend under a static world. |
| **C2** hands-free | `c2-hands-free.integration.test.ts` | Static `incident-briefing-static-zero` scenario over a local replay cassette (`fixtures/c2-static-zero.scenario` + `.model-cassette.json`); 4 test cases. |
| **C5** event-changing | `c5-event-changing.integration.test.ts` | Periodic-surprise scenario producing event-changing receipts with no network (`fixtures/c5-periodic-surprise.scenario`). |
| **B1** scheduler tick | `b1-scheduler-tick.integration.test.ts` | Scheduler sleeps before due time and writes a forecast receipt at due time. |
| **B2** auto-recompile | `b2-auto-recompile.integration.test.ts` | Tick auto-recompiles on drift; delays the same evidence inside the min interval. |
| **B3** auto-rollback | `b3-auto-rollback.integration.test.ts` | Tick rolls back a freshly authored self-tripping policy. |
| **B4** cycle detection | `b4-cycle-detection.integration.test.ts` | Ingest blocks an A→B→A dependency receipt graph before any model-gateway call. |
| **B7** transitive freshness | `b7-transitive-freshness.integration.test.ts` | An authored transitive-freshness function changes a downstream freshness verdict. |
| **E1** composition | `e1-composition.integration.test.ts` | Composes A/B/C through receipt pins; stops downstream on memo hits. |
| **E2** composition | `e2-composition.integration.test.ts` | Enforces supply-chain pins, transitive freshness, and fork/exit carry-over. |

Scenario parsing, the runner, and time handling are real modules
(`src/scenario/parser.ts`, `src/scenario/runner.ts`, `src/scenario/time.ts`,
`src/scenario/types.ts`). The world model supports three profiles —
`static`, `periodic-surprise`, `adversarial-silent`
(`src/world/synthetic-world.ts`); `adversarial-silent` is defined and tested as
"typed but fail-closed" — it does not yet drive a full silent-drift detection
eval.

### Baselines — the controls that ship

Three baseline controls live under `packages/reactor-cradle/src/baselines/`,
all deterministic, all exported from the package root:

- **`no-memo`** (`baselines/no-memo/index.ts`) — ablation of the W7 static run:
  re-derives the Reactor receipt schedule with memo credit disabled, charging
  every token-bearing receipt's total as fresh judge work. Schema
  `openprose.reactor-cradle.baseline.no-memo-summary`.
- **`naive-loop`** (`baselines/naive-loop/index.ts`) — a non-Reactor control
  with no receipts, memo keys, forecast policy, or reusable verdict
  architecture; every review turn re-prompts at the recorded cassette's per-turn
  token charge. Schema `openprose.reactor-cradle.baseline.naive-loop.summary`.
- **`cost-thesis`** (`baselines/cost-thesis/index.ts`) — assembles the static
  and event-changing comparison rows from the Reactor run plus the two controls.
  Schema `openprose.reactor-cradle.baseline.cost-thesis.summary`.

This is the apparatus behind the headline v0.1 number. The packaged
`flat-tokens` example drives four real `createReactor().ingest()` turns and
prints **`tokens.fresh=46`, `tokens.reused=46`, `ratio=46:46`**; the C5 summary
compares that Reactor run with the **no-memo control (`92:0`)** and the
**naive-loop control (`92:0`)**.

**Honest boundary of the cost thesis as it ships:** of the three rows, **only
the Reactor row is runtime-produced**. The cost-thesis module labels each row's
provenance explicitly — `runtime-produced`, `simulated` (no-memo), `control`
(naive-loop) — and its own notes state "Only the Reactor row is
runtime-produced." The comparison is a deterministic three-way control
contrast over one runtime receipt schedule. It is **not** the preregistered
spend-vs-surprise regression with a frozen null of Section I, invariant 3 / A1.
There is no statistical decision rule, no preregistered surprise-label freeze,
and no oracle-cron adversary in the package.

### Assertion families — the deterministic predicates

`packages/reactor-cradle/src/assert/index.ts` defines five assertion families,
each a deterministic predicate over a scenario run or receipt log:

- `static-surprise-zero` — static-world surprise stays at zero across the trace.
- `surprise-attribution-complete` — every token-bearing receipt/model payload
  names a valid surprise cause (`real-input`, `forecast-recheck`,
  `escalation`).
- `flat-spend-under-static` — post-bootstrap static-world fresh spend stays
  flat, except plan-audit-floor receipts.
- `no-fixed-interval-work` — forecast-paced runs spend no tokens in
  virtual-clock gaps before the next scheduled check.
- `release-parity-fixture` — emitted by the release-parity module (below).

### Replay model gateway and parity

`src/replay/model-gateway.ts` provides recording/replay model-gateway cassettes
(schema `openprose.reactor.model-gateway-cassette`): the replay gateway
fails closed on an unexpected or out-of-order request and on cassette
exhaustion, and returns byte-identical recorded payloads. `src/replay/parity.ts`
provides a byte-identical comparator and a cross-adapter parity matrix. The
parity matrix has **three rows**: `deterministic-in-memory` (ready),
`filesystem` (ready), `postgres` (**`future` — not implemented**). The matrix
`ok` only when ready rows pass and at least one ran.

### K1 / K2 spikes

Under `packages/reactor-cradle/src/spikes/`:

- **K1 — ensemble spread** (`spikes/k1-ensemble-spread.ts`) — scores a recorded
  model ensemble against a calibration anchor, with a conjunctive diversity
  floor (model-family, provider, size-boundary) before spread can be
  calibrated. Recorded fixtures include a `k1-live-recorded.json` cassette (one
  live-recorded OpenRouter ensemble).
- **K2 — policy author** (`spikes/k2-policy-author.ts`) — validates a recorded
  policy-author artifact's shape and fails closed on off-live-observable facts
  or a malformed policy.
- **live-refresh** (`spikes/live-refresh.ts`) — an explicit, opt-in,
  cap-and-accounting-guarded OpenRouter recording path. By default the normal
  test path **does not read env or perform any live refresh**; the live path is
  guarded, key-redacted, and rejects non-default models.

The spikes are **recorded-only by default**. There is one recorded live K1
cassette; there is **no live provider/model matrix**.

### Release-parity and release-candidate evidence

- **`src/release-parity/index.ts`** — the **R6** recorded release-parity suite,
  a deterministic fixture floor of **10 represented cases**: `healthy-quiet`,
  `drifting-schedules-fulfillment`, `blocked-human-review`,
  `forecast-pulls-judge-earlier`, `hysteresis-prevents-flip-flop`,
  `duplicate-event-idempotency`, `stale-status-fencing`,
  `contract-revision-fencing`, `policy-recompile-byte-identical-registry`,
  `memoized-verdict-zero-fresh-tokens`. Each case carries verified receipts,
  decisions, and trace evidence; the suite runs the byte-identical replay
  parity matrix. It explicitly **defers one case — `down-after-budget-exhaustion`**
  — recording the gap rather than synthesizing a false proof, because the
  runtime exposes no typed retry-budget or pressure-dispatch primitive.
- **`src/release-candidate/index.ts`** — the **R7** release-candidate evidence
  bundle helpers, assembling deterministic Cradle/Reactor smoke and command
  evidence into a content-hashed bundle and Markdown report.

### Eval result and projections

`src/eval/index.ts` builds a content-hashed `openprose.reactor-cradle.eval-result`
artifact over assertion and parity outputs, renders it as Markdown, and
projects it to `owner` / `subscriber` / `public` tiers with secret/PII
redaction. The model-matrix field is **structurally pinned to `not-run`** — the
type `CradleEvalModelMatrixStatusV0` is the single literal `"not-run"`, and the
builder throws if it is anything else. The live model matrix is, by
construction, deferred.

### Other deterministic modules

`policy-author`, `policy-drift`, `recompile`, `rollback`, `policy-replay`, and
`provider-parity` are recorded-proof modules (P-series and D-series) exercising
policy authoring, drift detection, recompile/rollback planning, recorded-artifact
replay, and a two-provider policy-artifact byte-parity proof — all without live
agents or gateways.

### Honest status of the Reactor column

The Cradle drives **real `@openprose/reactor` `createReactor().ingest()`** in
W7/C2 and exercises the receipt, memo, forecast, composition, and kernel
modules directly. In that narrow sense, a deterministic Reactor result **exists
today** — the static-world cost thesis is measured and locally runnable.

But the report-grade Reactor column of Section I — the preregistered cost
regression, the silent-drift detection eval against an oracle cron, the
variable-depth ensemble result, the live model matrix, the boundary
quantification, the blind output-quality track — **is not in this package.**
The Cradle is the deterministic floor; it is what ships at v0.1.

---

## III. Roadmap (Delta) — The Gap to the Ideal

`Ideal − Current`. The Cradle ships the deterministic scenario floor. The
report-grade Required Evaluation Suite remains to be built. The gap, named:

The named suite below is **derived from the Ideal claim tables and invariants
above**. It is not additional authored Ideal text; it is the roadmap checklist
that makes `Ideal − Current` concrete.

- **Claim A — cost & memoization.**
  - **A1 — Cost-scales-with-surprise.** Preregistered regression of spend on
    frozen surprise labels against the wall-clock/event-count null, over a
    content-hashed receipt log, vs. oracle-cron + strong diff/embedding cache.
  - **A2 — Zero-fresh memoized reuse.** Predicate that memo-hit receipts carry
    `tokens.fresh = 0`, vs. Reactor-without-memoization.
  - **A3 — Composition amortization.** N-dependent cost amortization across a
    composed responsibility graph: one mechanism, the N>1 recursion.
  - **A4 — Policy-recompile stability.** Recompile produces a byte-identical
    registry artifact when inputs are unchanged: one mechanism, the
    policy-over-time recursion.
- **Claim A — forecast & drift.**
  - **A5 — Forecast catches silent drift.** Injected silent drift; detection
    vs. the oracle-cron at matched cost (the content cache is blind here by
    construction).
  - **A6 — No fixed-interval work.** Forecast-paced runs spend no tokens in
    virtual-clock gaps before the next scheduled check.
  - **A7 — Variable-depth ensemble.** Variable-depth judging preserves accuracy
    at lower cost than a fixed ensemble, within a preregistered band.
- **Claim A — fail-safe & supply chain.**
  - **A8 — Typed-interrupt precision.** Confusion matrix of typed interrupts
    (`needs-input`, `needs-judgment`, `contract-declared`, …) vs. oracle
    labels, vs. cron + prompt with durable state.
  - **A9 — Auto-recompile on drift.** A drift verdict triggers a bounded
    policy recompile, with a minimum-interval guard.
  - **A10 — Auto-rollback of a self-tripping policy.** A freshly authored
    policy that self-trips is rolled back to last-known-good.
  - **A11 — Cycle / dependency-graph safety.** A cyclic dependency receipt
    graph is blocked before model spend.
  - **A12 — Transitive-freshness fencing.** A stale or contract-mismatched
    upstream receipt is fenced before downstream use.
  - **A13 — Receipt replay equality.** The receipt log replays byte-identically
    from a clean clone; a snapshot roll voids the run.
- **Claim B — role-conditional model fit.**
  - **B1 — Best-judge.** Status accuracy + calibration per model.
  - **B2 — Best-fulfiller.** Restoration without overreach per model.
  - **B3 — Safest-cheap + compensation curves.** Where the architecture narrows
    the cheap-vs-frontier gap, measured across both adapter seams.
- **The boundary & meta track.**
  - **C1 — Boundary quantification.** Where cost-scales-with-surprise degrades
    to forecast cadence, and by how much (plan-audit floor, no-cheap-hash
    domain, no-anchor calibration tax).
  - **C2 — Output-quality track.** A separate, clearly-labelled,
    blind-human-adjudicated track for output quality, walled off from every
    headline number.

1. **The preregistered cost regression (A1, invariant 3) is not built.** What
   ships is a three-way deterministic control contrast (Reactor vs. no-memo vs.
   naive-loop) over a single runtime receipt schedule, with explicit per-row
   provenance. The Ideal requires a regression of spend on **frozen,
   content-hashed surprise labels** against an explicit wall-clock/event-count
   null, with the decision rule fixed before any data. No surprise-label
   freeze, no statistical decision rule, and no oracle-cron adversary exist in
   the package today.

2. **The strongest-cheap adversaries are not all present (invariant 2).** The
   `naive-loop` control is a deliberately weak strawman by the spec's own
   standard. The load-bearing adversaries — a **strong content-diff +
   embedding cache** and an **oracle-optimally-scheduled cron** — are not
   implemented. The silent-drift headline (A5) specifically requires the
   oracle-cron comparator and an injected-drift fixture set; the
   `adversarial-silent` world profile exists but is currently only "typed but
   fail-closed," not a drift-detection eval.

3. **The live provider/model matrix (Claim B: B1/B2/B3) is not run.** The
   eval-result model-matrix field is structurally pinned to `not-run`. One live
   K1 cassette is recorded; the full live matrix, the role-fit findings
   (best-judge / best-fulfiller / safest-cheap), and the **Reactor-compensation
   curves** are entirely future work. Variable-depth live ensemble judging (A7)
   is not in the runtime — the README states the runtime "does not perform
   variable-depth live ensemble judging."

4. **The boundary track (C1, invariant 6) is not quantified.** The
   `flat-spend-under-static` assertion *permits* plan-audit-floor receipts but
   no eval *measures the boundary* — where cost-scales-with-surprise degrades to
   forecast cadence, and by how much. The no-cheap-hash domain and no-anchor
   calibration tax are named in 02 but not measured here.

5. **The blind output-quality track (C2, invariant 1) does not exist.** There
   is no human-adjudicated quality track; the trace-vs-quality wall is honored
   only by omission — no quality numbers are produced at all.

6. **The preregistration apparatus (invariant 4) is not built.** No mechanism
   freezes and content-hashes surprise labels, the statistical decision rule,
   the baseline set, or the model matrix before runs. The recorded fixtures are
   content-addressed (invariant 7 is partially honored), but the analysis-plan
   freeze is absent.

7. **Provider-reconciled cost confidence (invariant 5) is not wired.** Cost
   figures in the Cradle are deterministic token counts from receipts. No
   normalized or dollar figure is provider-reconciled; the confidence-tier
   discipline is methodology, not yet code.

8. **One release-parity case is explicitly deferred:**
   `down-after-budget-exhaustion` — blocked on typed retry-budget and
   pressure-dispatch primitives in the runtime. `postgres-parity` is the third
   parity matrix row, marked `future`.

### Sequencing (carried forward from the original plan)

1. **Proof object stays reconciled.** The methodology derives from
   `openprose.receipt v0` (02 open item I.1). The harness emits one receipt
   definition; the eval scores the receipt the harness actually emits — as the
   Cradle already does.
2. **Land the Reactor-independent contribution first.** Real isolated
   competitor runs plus the cost methodology and the harness comparison are a
   _publishable contribution on their own_ — collected while the report-grade
   Reactor column is built, so the apparatus is proven before the subject.
3. **The Reactor column docks through the Cradle.** The Reactor row is not a
   bespoke emitter bolted onto the eval harness; it is the Reactor presented as
   one more adapter in the Cradle's parity-and-replay contract — a typed SDK
   seam, an adapter-parity matrix with a byte-identity gate, a replay engine
   that runs against the recorded receipt artifact and never re-derives it, and
   assertion families evaluated over the receipt. The deterministic Cradle
   scenarios already occupy that socket; the eval competitor adapters present
   under the same contract, and the report-grade Reactor column slots in when
   the live matrix and preregistered regression land. The first harness
   milestone is itself scoped to _prove or kill the cost thesis_ — the same
   preregistered hypothesis invariant 3 / A1 fixes — so the eval is that
   milestone's acceptance instrument: align the preregistered surprise-label
   and decision-rule freeze with that gate.
4. **Write the report after the evals, never before.** Strong claim, then the
   evidence, then the boundary. Ties and losses in the abstract.

**Launch standard.** Do not publish "Reactor-class harness" until both claims
survive their _strongest cheap adversaries_ under preregistration, the
boundaries are quantified not hidden, the suite replays from a clean clone, and
a skeptical reader can reproduce enough to be unable to dismiss it. The Cradle
delivers the clean-clone replay floor today; the strongest-cheap-adversary and
preregistration bars remain ahead.
