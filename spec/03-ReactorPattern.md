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
- **Internal decision log** — not shipped: the dialectic that produced the
  Harness doc; the clean public statements live in the specs above and this
  document does not repeat the dialectic.
- [00-Tenets.md](./00-Tenets.md) — **the constitution**. When any
  document tensions with a tenet, the tenet wins.

The relationship is the same as the one between a language reference and an
effective-style guide. The harness doc tells you the machine has memoization,
forecast-gated quiescence, variable-depth judging, and receipt composition.
This doc tells you how to write contracts so those mechanisms actually engage
instead of degrading to "cron plus a prompt."

This document is organized in three parts, mirroring the rest of the spec:

1. **Ideal** — the Reactor-native authoring pattern as it should be. This is
   the authored vision; it is frozen.
2. **Current** — a code-grounded snapshot of how much of the pattern the
   `openprose/prose` runtime actually realizes at `v0.1` (`0.1.0`), with
   real module paths. This section is mechanically re-derivable from the code.
3. **Roadmap (the Delta)** — the honest gap between Current and Ideal,
   incorporating this document's own open items.

`Ideal − Current = Roadmap`. The three are kept distinct so this document can
never again claim shipped what is not, or aspire in the same breath it reports.

The single most important principle, stated once up front so the rest is read
in its light:

> **The Reactor paradigm does not change OpenProse syntax. It inverts which
> kind is the program.** Every section, kind, and keyword the pattern needs
> already exists. What changes is doctrine: the responsibility is the
> top-level authored object, the system is a fulfillment detail, and two
> contract sections (`### Continuity`, `### Criteria`) acquire a cost and
> decidability obligation they did not visibly carry before.

---

## I. Ideal — The Reactor-Native Authoring Pattern

### The inversion

`01-Language.md`'s "Mental Model" reads, in order: a prompt for one-off work, a
contract for roles/handoffs, a `kind: system` is a dependency graph, Forme
wires it, the VM performs it, and — last — Responsibility Runtime keeps
standing goals true. That ordering is **system-first**. It is correct for
bounded work and wrong for the Reactor.

In the Reactor-native pattern the ordering inverts:

```text
The responsibility is the program.
The gateway is how the world reaches it.
The fulfillment system is an implementation detail of one beat of the loop.
Services, patterns, Forme, and the VM are the substrate the fulfillment
  system happens to be built from.
```

The harness doc states this as "the single-responsibility loop is the base
case." The authoring consequence: **you do not start by writing a system. You
start by writing one sentence of durable intent and what makes it true.** The
system, if any, is derived from the responsibility, not the other way around.

This reframes a table in `01-Language.md` that currently misleads on intent. The
"Directly runnable?" column says `service: Yes`, `system: Yes`,
`responsibility: No`. Technically accurate — a responsibility is _served_, not
_run_. But it implies the responsibility is a lesser, non-executable artifact.
In the Reactor-native pattern the responsibility is the **most** load-bearing
authored object; "not directly runnable" means "continuously reconciled," which
is the entire point, not a limitation.

### The canonical contract set

A Reactor-native unit of work is not a file. It is a small, fixed set of files
with distinct jobs that map one-to-one onto harness layers:

| File | `kind:` | Harness layer it feeds | What the author is really writing |
| --- | --- | --- | --- |
| The standing goal | `responsibility` | Responsibility / Contract Markdown | One decidable sentence + what makes it true |
| Event ingress | `gateway` | Gateway | How and when the world is allowed to wake the loop |
| Fulfillment | `system` (`persist: project`) | Fulfillment | The one beat where world-mutation is permitted |
| Sense | `service` inside the system | Judge evidence | A read-only observation that emits a stable content identity |
| Verdict | `service` inside the system | Judge | Cheapest-sufficient judgment + a calibrated confidence |
| Ledger | `service` (`persist: project`) | Storage / Receipt (approx.) | The durable trail and the composition edge |

The responsibility is normative and semantic. Everything else is derived
infrastructure. A reader who understands only the responsibility understands
the program; the rest is _how_, and is allowed to change without the intent
changing — which is exactly the harness doc's invariant 8 ("state is
replayable and exitable") expressed at authoring time.

### Authoring derived from the invariants

Each harness invariant produces a concrete, checkable authoring rule. This
table is the spine of the pattern; the prose after it only elaborates.

| Harness invariant | Authoring rule it imposes |
| --- | --- |
| 1. Markdown is intent | The responsibility carries all semantic weight. Never push intent into the fulfillment system's prose, a prompt, or a tool config. If it matters, it is in `### Goal`/`### Criteria`/`### Constraints`. |
| 2. Policy is model-authored, compiled, shared | Do not hand-write cadences, hysteresis, or escalation thresholds as imperative ProseScript. Express them as **semantic intent** in `### Continuity`/`### Constraints`. The harness compiles policy; the author states the policy's _shape_, not its registry. |
| 3. Adapters are the only reason homes differ | Author no host-specific logic in contracts. Declare needs in `### Tools`/`### Environment` by name only. The same contract must run local and cloud. |
| 4. Activations are bounded | Never write a fulfillment system that assumes it keeps running. No "while true," no in-session waiting for the next event. Continuity lives in the ledger, not in a session. |
| 5. Cost scales with surprise | Write `### Continuity` so "did anything material change?" is **cheaply decidable**, and decompose the system so the sensing service emits a **stable content identity** the harness can memoize on. Also name the **plan-audit horizon** — the max no-escalation interval before a forced deep revalidation (recorded as a `forecast-recheck`/`plan-age` recheck). This is the rule authors most often violate. |
| 6. The judge fails safe | Write `### Criteria` with **observable referents**. When a criterion has no referent, the correct verdict is "undecidable" — design for that as a welcome output, not an error. |
| 7. Receipts are content-addressed | Make the ledger the explicit, structured trail: `as_of`, last-input identity, decision, evidence pointers. Treat it as the audit/composition/exit unit, not a scratch log. |
| 8. State is replayable and exitable | Keep all durable truth in the responsibility + ledger, in plain Markdown/structured records. A reader must be able to take the contract and its trail to another harness. |

### Rule 1 — `### Goal` is one decidable sentence

A goal is a state that should remain true, written so a judge can render a
verdict on it. Not a task ("triage the inbox"), not a deliverable ("produce a
report"), but an invariant ("the research inbox is deduplicated, prioritized,
and converted into action").

The test: could a competent judge, given evidence, say `up` / `drifting` /
`down` about this sentence? If the sentence describes an _activity_ rather than
a _state_, rewrite it until it describes a state. The harness doc's
front-loaded-then-silent promise depends on this: the most valuable early
output is "this sentence is not yet decidable, here is why," and that output is
only possible if the sentence was _trying_ to be decidable.

### Rule 2 — `### Continuity` is written for forecast and memoization

This is the rule that separates a Reactor-native contract from cron-plus-prompt,
and the one the current skill underspecifies.

`### Continuity` is not "how often to run." It is the author's contribution to
two harness mechanisms the author does **not** write directly:

- **Forecast** (the harness manufactures the minimum necessary recheck when the
  world will not announce change). The author's job is to name the **freshness
  referents**: what makes this goal go stale, how fast, and what external
  signal — if any — announces a change. "New stargazers within one business
  day" tells the harness the staleness clock; "outreach history prevents
  duplicate contact unless new evidence" tells it the memo-breaking condition.
- **Memoization** (unchanged input hash → reused verdict, zero tokens). The
  author cannot write the hash, but the author _decides whether one is
  cheaply computable_. Write Continuity so that "nothing material changed"
  corresponds to **a stable, cheaply observed identity** — a content hash of
  the watched artifacts, a max-timestamp, a revision number. If the only way to
  know whether anything changed is to do the full expensive judgment, you have
  written a contract whose cost scales with time, not surprise.

Concretely, a good `### Continuity` answers: what events legitimately wake this;
what the staleness horizon is when no event fires; what condition makes a prior
verdict no longer reusable; and what divergence is _expected and should be
preserved rather than reconciled away_ (the policy-over-time recursion — an
ideal layer is allowed to drift from a plan layer, and that drift is signal).

It must also answer two questions the completeness law now makes load-bearing.
First, the **plan-audit horizon**: how long a _no-escalation_ run may continue
before a forced deep revalidation, independent of the shallow judge's
confidence — the author's input to the harness's plan-age clock (Harness, _The
completeness law_). Second, **whether a cheap stable identity exists at all**:
if "did the semantically relevant content change" cannot be decided more
cheaply than the judgment itself, the author must say so explicitly; the
harness then runs this responsibility at forecast cadence, not surprise
cadence. Silently writing such a contract as if memoization applies is not a
correctness break — forecast still makes it safe — but it is a false cost
promise, and the honest form declares the forecast-cadence shape deliberately,
exactly as projection-only is a deliberate amputation rather than a degenerate
Reactor.

### Rule 3 — `### Criteria` uses observable referents; undecidable is welcome

Every criterion must point at something a judge can observe. "Notes are
current" is undecidable without a referent; "the release notes file's last
commit is newer than the latest merged PR touching `src/`" is decidable.

When a criterion genuinely has no observable referent, the Reactor-native
author does **not** patch around it. The correct behavior is for the judge to
return `blocked` with a natural-language reason "criterion X has no observable
referent" and a recommended fix target (the contract author). This is the
flagship interrupt of the entire architecture — the single highest-leverage
thing the system can say. Author criteria _expecting_ this verdict on the first
few activations; that front-loading is the promise, not a defect.

Do not encode an "undecidable" status. The four coarse statuses (`up`,
`drifting`, `down`, `blocked`) are the control vocabulary; undecidability is a
judge-authored reason attached to `blocked`, lives at the English layer, and
must never become an enum in a contract. `calibration-unattainable` is a
second judge-authored `blocked` sub-reason of the same family: authors of
high-stakes no-anchor responsibilities should *expect a front-loaded
calibration spot-check interrupt* — the asymptote-toward-silence promise
applied to calibration, not just decidability.

### Rule 4 — `### Constraints` draws the actuation boundary

`### Constraints` is where the author quarantines world-mutation. The
render/commit split from the harness doc's React metaphor (judge is pure:
world → status; fulfillment is the only commit-phase side effect) is enforced
at authoring time here.

Two boundary shapes recur:

- **Full Reactor.** Fulfillment may mutate the world (send the email, update
  the briefing, write the register). `### Constraints` bounds _how_ (rate,
  scope, prohibited actions, "leave the final send to a human").
- **Projection-only Reactor.** The author forbids all world-mutation except
  writing the projection itself. This is a legitimate, common shape: an
  observe-only overseer, a dashboard that must stay true, an audit that watches
  but never touches. It uses the judge and projection half of the architecture
  and deliberately amputates the fulfillment/escalation arm. Say so explicitly:
  "the only writable surface is &lt;the projection&gt;; never modify, signal, or
  write into the observed system."

A projection-only contract is not a degenerate Reactor. It keeps every cost and
audit property; it simply declines the reconcile-the-world payoff. Authors
should choose it deliberately, not back into it.

### Rule 5 — the fulfillment system is decomposed for memoization and variable depth

The fulfillment `kind: system` is where authors most often write the
anti-pattern: one big service that re-derives everything every time. The
Reactor-native decomposition is fixed and small:

1. **Sense** — a read-only service that observes the world and returns,
   alongside the observation, a **stable content identity** (hash, max-ts,
   revision). This identity is what makes harness memoization possible. Mark it
   `persist: project` only if it needs the prior identity to diff.
2. **Judge** — a service that takes the sensed evidence and emits a coarse
   status **and a calibrated confidence**. Cheapest sufficient form by default.
3. **Escalate (conditional)** — a deeper judgment, instantiated as a pattern
   (`std/patterns/fan-out`, `dialectic`, `oversight`), invoked **only** when the
   shallow judge is uncertain or stakes/forecast warrant. Variable depth is an
   authoring decision: a `choice`/`if` in `### Execution` that gates the
   expensive path on the shallow judge's confidence.
4. **Fulfill or project** — the single permitted effect, bounded by
   `### Constraints`.
5. **Ledger** — a `persist: project` service that records the receipt-shaped
   trail and advances the last-seen identity.

The `### Execution` block wires this so that an unchanged content identity
**short-circuits before the expensive judge** (the author's expression of
quiescence behavior 2), and the deep path is gated on confidence (behavior 3).
The author writes the gates; the harness owns the memo and the forecast.

### Rule 6 — composition is consuming an upstream trail, not a new primitive

"Responsibility B depends on responsibility A" needs no new syntax. B's judge
consumes A's latest ledger record (the current stand-in for A's
content-addressed receipt) as an evidence source — identical to consuming a
webhook or a file. Three authoring obligations make this safe:

- **Reference, don't embed.** B's contract names A's responsibility id / ledger
  location as a declared input, not a copied value.
- **Pin revision and trust.** B's `### Criteria` must state which revision of A
  it accepts and, for cross-trust-domain composition, an acceptable signer set. Unpinned
  composition is a supply-chain attack; the author closes that hole, not the
  runtime.
- **Carry freshness — semantically, not imperatively.** State B's freshness
  tolerance for upstream inputs as *intent* in `### Continuity`/`### Criteria`
  (e.g. "A may be up to one business day stale; older than that, treat B as
  `drifting` pending a refresh"). The transitive-freshness *function* is
  harness-side, model-authored, and recorded in the policy registry; the
  author supplies its *shape* the same way they supply cadence shape, never a
  hand-written staleness comparison in `### Execution`. An upstream's
  calibration grade (`authored`/`accrued`/`none`) is part of what B weighs —
  an uncalibrated upstream is a supply-chain caveat the author pins, parallel
  to revision/signer.

This is how the three-layer overseer (below) consumes "the plan" — it is a
composition edge, not a special case.

### Patterns that are Reactor-native

The std pattern library is use-case agnostic, but a subset maps directly onto
harness layers and should be the author's default vocabulary:

| Pattern | Reactor-native role |
| --- | --- |
| `oversight` | Separates actor / observer / arbiter — the canonical projection-only or fail-safe judge shape |
| `fan-out`, `dialectic`, `ensemble-synthesizer` | Variable-depth escalation; instantiate only on the uncertain branch |
| `guard` | Precondition gate before an expensive judge or a world-mutating fulfillment |
| `worker-critic`, `proposer-adversary` | Fulfillment with a built-in fail-safe check before commit |
| `map-reduce`, `fan-out` | Sensing a wide world cheaply, in parallel, before judging |

The judge being "a variable-depth circuit, not a fixed circuit" (harness
failure model) is, at the authoring layer, exactly: _instantiate an ensemble
pattern behind a confidence gate, not unconditionally._

### A worked example: the three-layer overseer

A long-running external agent session (here, a Codex run building an eval set
across many subagent waves) must be observed but never interrupted. The author
wants three maintained world-state layers — observed ground truth, the plan
being executed, the overseer's evolving ideal — and three pairwise delta
projections, rendered richly, kept true as the world mutates constantly.

This is structurally the harness doc's Incident Briefing Room with a different
channel, and it is a near-perfect Reactor fit precisely because the naive
implementation (a swarm of subagents that watches forever) is the
cost-scales-with-time anti-pattern the Reactor exists to kill.

**The responsibility** (the whole program):

```markdown
---
name: codex-eval-build-oversight
kind: responsibility
id: 067NC4KG01RG50R40M30E20918
---

### Goal

A three-layer world model — observed ground truth, the plan being executed,
and the overseer's evolving ideal — and the three pairwise delta projections
are current and accurate with respect to the unfolding eval-set build.

### Continuity

- Re-judge on worktree changes and planning-directory changes.
- While the observed session is active, a forecast-paced fallback recheck so a
  silent worktree does not mean a silent overseer.
- Quiesce hard when no material change crosses the layers: an unchanged
  observation identity reuses the prior projection at zero render cost.
- The ideal layer is expected to diverge from the plan over time; divergence
  is preserved as signal and is never reconciled toward the plan.

### Criteria

- Six artifacts reflect the latest material state: three layer views (truth,
  plan, ideal) and three delta views (plan↔truth, ideal↔plan, ideal↔truth).
- Deltas are rendered spatially and from multiple dimensions, not as prose
  lists.
- The plan layer pins the plan revision it was synthesized against; stale-plan
  deltas are labeled, never silently mixed.
- When the build's true state is not yet decidable from observable artifacts,
  the judge says so and routes that to the human — it does not fabricate a
  delta.

### Constraints

- NEVER modify, pause, signal, or write into the observed session, its
  worktree, or the planning directory. Observation is strictly read-only.
- The only writable surface is the six projection artifacts.
- Deep enrichment is bounded and escalated only on judge uncertainty or a
  large delta — never on every event.

### Tools

- cli:git
- cli:fs-read

### Fulfillment

Prefer the local `oversight-projection` system.
```

**The gateway** (event ingress; honest current limit noted inline):

```markdown
---
name: codex-build-signals
kind: gateway
---

### Schedule

- every 3 minutes while the observed session is active
  # forecast-paced poll; replace with a worktree file-watch when serve
  # supports file-change ingress

### Receives

- Manual: refresh

### Emits

- codex-eval-build-oversight.evidence-change

### Payload

Pass changed paths (or "scheduled sweep") as activation context. The
fulfillment system must hash-diff and quiesce when nothing material changed.
```

**The fulfillment system** (projection-only; the `### Execution` block is where
quiescence and variable depth are authored):

```markdown
---
name: oversight-projection
kind: system
---

### Services

- `observe-ground-truth`
- `read-plan`
- `judge-materiality`
- `evolve-ideal`
- `synthesize-deltas`
- `render-projection`

- name: deep-survey
  pattern: std/patterns/fan-out
  with:
    delegate: worktree-prober

### Requires

- `activation_event`: changed paths, scheduled sweep, or manual refresh

### Ensures

- `projection_update`: the six rendered artifacts and a ledger receipt

### Runtime

- `persist`: project

### Execution

```prose
let truth = call observe-ground-truth
  activation_event: activation_event
# returns a content identity; the harness memoizes on it.
# Unchanged identity => prior projection reused, zero render. (quiescence 1+2)

let plan = call read-plan
  activation_event: activation_event

let verdict = call judge-materiality
  truth: truth
  plan: plan

if verdict is quiescent:
  return verdict.prior_projection      # don't act, don't render

let evidence = truth
choice verdict.depth:
  option "shallow":
    evidence = truth
  option "deep":
    let probes = call deep-survey      # gated escalation, not a watcher
      target: verdict.uncertain_regions
    evidence = merge truth with probes

let ideal = call evolve-ideal
  truth: evidence
  prior_ideal: verdict.prior_ideal     # allowed to diverge from plan

let deltas = call synthesize-deltas
  truth: evidence
  plan: plan
  ideal: ideal

let projection_update = call render-projection
  truth: evidence
  plan: plan
  ideal: ideal
  deltas: deltas

return projection_update
```
```

`observe-ground-truth` and `render-projection` carry `persist: project` with a
`### Memory` ledger storing `last_observation_identity`, `as_of`, and
`pinned_plan_revision` — the current stand-in for content-addressed receipts
and the composition edge to the plan. `judge-materiality` is the variable-depth
judge: cheap identity-diff by default, `### Shape` delegating to a critic only
when uncertain. `render-projection`'s `### Constraints` forbids any write
outside the six artifacts — the authored expression of the amputated
fulfillment arm.

### Anti-patterns

Each is the natural non-Reactor instinct and why it breaks an invariant:

- **Writing a `kind: system` first and a responsibility as an afterthought.**
  Inverts the model; the system becomes the source of intent (breaks
  invariant 1).
- **A fulfillment system with a `loop until done` that waits for events
  in-session.** That is a long-running agent loop, not bounded activations
  (breaks invariant 4).
- **A sense service that returns the observation but no content identity.**
  The harness cannot memoize; cost scales with time (breaks invariant 5). This
  is the most common and most expensive mistake.
- **A contract whose only "did anything change" test is the full judgment,
  written as if it memoizes.** Not an invariant-5 _correctness_ break (forecast
  still makes it safe) but a false cost claim. The Reactor-native form names
  the absence of a cheap identity in `### Continuity` and accepts
  forecast-cadence cost deliberately — exactly as projection-only is a
  deliberate amputation, not a degenerate Reactor.
- **Hard-coding cadence/hysteresis/escalation as imperative ProseScript.**
  Steals policy from the model-authored, compiled layer (breaks invariant 2).
- **An unconditional ensemble in `### Execution`.** Fixed-depth judging;
  removes the cost lever (breaks invariant 5).
- **Consuming another responsibility's value by copying it into the contract.**
  Not a verifiable, revision-pinned reference; a supply-chain hole (breaks
  invariants 6/7).
- **"Swarm of subagents that continuously watches."** The cron-plus-prompt
  shape the Reactor replaces. The Reactor-native form is: events wake a cheap
  judge; the swarm is the gated deep path, not the steady state.

### Precedence for authors

When authoring rules tension, follow the harness precedence stack:

```text
correctness  >  safety  >  cost  >  interrupt-minimization
```

If a decidable, safe contract requires more interrupts during authoring,
accept the interrupts. If making a contract cheaper would make it unsafe (a
shallow judge on a high-stakes goal), pay the cost. Silence is a target, never
a constraint the other rules bend around.

---

## II. Current — What the Runtime Realizes at v0.1

This section is a code-grounded audit of `openprose/prose` `main`
(`0.1.0`, tag `reactor-v0.1.0`, packages `@openprose/reactor` and
`@openprose/reactor-cradle`).
It states which elements of Part I's pattern the runtime actually realizes,
and how. It is mechanically re-derivable from the code; treat any drift
between this section and the code as a bug in this section.

The previous edition of this section assumed a `@openprose/responsibility`
package backing "both CLI and API." **That package does not exist.** The
runtime spine that realizes the Reactor shipped instead as
`@openprose/reactor` (`packages/reactor/`), with a deterministic test and
evidence harness `@openprose/reactor-cradle` (`packages/reactor-cradle/`).
Both are published stable OSS packages at `0.1.0`.

### What "the skill" vs "the runtime" means here

Part I is an authoring pattern: it concerns what an author writes in
`*.prose.md`. The headline finding holds and is unchanged — **the
Reactor-native pattern requires no new syntax.** Every section, kind, and
keyword Part I uses is existing OpenProse surface; `01-Language.md`'s Current
section is the authority on the authoring surface and is not re-audited here.

What this section audits is the other half: the **harness runtime** that the
pattern is written _toward_. Part I's promised payoffs — provable quiescence,
forecast-manufactured rechecks, memoization, variable-depth judging, verifiable
composition — are runtime mechanisms. `@openprose/reactor` is the package that
realizes them. The audit below reports how far it has gone.

### The runtime spine, by Part I element

| Pattern element (Part I) | Realized at v0.1? | Where, and how |
| --- | --- | --- |
| The canonical loop — ingest → judge → receipt | **Yes** | `packages/reactor/src/reactor/index.ts` `createRuntimeReactorV0` exposes `ingest`/`tick`/`receipts`/`registry`. `ingestTypedTurn` runs the loop: select planned evidence → check memo → run the shallow judge → append a content-hashed `judge` receipt. |
| Three turn kinds — real input, forecast recheck, escalation | **Yes** | `ReactorRealInputTurnV0`, `ReactorForecastRecheckTurnV0`, `ReactorEscalationTurnV0` (`reactor/index.ts`). Escalation turns produce `blocked-escalation-receipt`s; the scheduler manufactures `forecast-recheck` turns. |
| Quiescence — unchanged input short-circuits before the expensive judge | **Yes (memo-hit)** | `ingestTypedTurn` computes a memo key (`computeMemoKeyV0`, `packages/reactor/src/memo/`) over contract revision + evidence content hashes + dependency memo refs. On a reusable match it appends a `memo-hit-receipt` and **never invokes the judge** — zero model tokens. Exercised end-to-end by the cost thesis (see below). |
| Memoization — content-addressed verdict reuse | **Yes** | `memo/index.ts`: `InMemoryMemoStoreV0`, `createMemoHitReceiptV0`, `createMemoizedVerdictEntryV0`. The runtime memoizes on a stable content identity supplied as evidence `content_hash` — the author-side "stable content identity" obligation of Rule 5 has a real consumer. |
| Forecast — manufactured rechecks when the world is silent | **Yes** | `packages/reactor/src/forecast/index.ts` `evaluateForecastScheduleV0` computes due rechecks; `reactor/index.ts` `tickRuntimeScheduler` drives them. Two recheck kinds exist: `evidence-age` and `plan-age`. `plan-age` is the runtime form of Rule 5's plan-audit horizon. |
| The shallow judge — coarse status + confidence | **Yes** | `packages/reactor/src/judge/index.ts` `runShallowJudgeV0` invokes the model-gateway adapter and returns one of the four statuses (`up`/`drifting`/`down`/`blocked`) plus a `ReceiptConfidenceV0`. `blocked` carries `reason`/`fix_target`/`interrupt_cause` — the Rule-3 undecidable-as-`blocked` doctrine is the receipt schema's actual shape. |
| Variable-depth judging — escalate to an ensemble on uncertainty | **No (stub)** | `runShallowJudgeV0` accepts `depth: "shallow" \| "ensemble"`, but `depth === "ensemble"` **throws `not-implemented-in-v0.1`**. The runtime performs shallow judging only. Cradle carries one live-recorded ensemble-spread cassette (`spikes/k1-ensemble-spread.ts`) as recorded evidence, not a live runtime path. |
| Receipts — content-addressed, verifiable | **Yes** | `packages/reactor/src/receipt/index.ts`: `openprose.receipt v0`, `createReceiptV0`, `verifyReceiptV0`, canonical sha256 hashing, `inspectReceiptProofV0`. Receipt roles are `judge \| fulfill \| summarize \| policy-compile`. |
| Fulfillment — the world-mutating commit beat | **No (role only)** | `fulfill` exists as a `ReceiptRoleV0` enum value and as a kernel `KERNEL_MAY_NEVER` prohibition ("mutate the world or perform fulfillment side effects" — `kernel/index.ts`). There is **no fulfillment executor** in the runtime: the runtime produces judge/forecast/memo/escalation receipts, not world-mutating effects. The full-Reactor "send the email" arm is not yet a runtime path. |
| Projection — owner / subscriber / public tiers | **Yes** | `packages/reactor/src/projection/index.ts`: `projectReceiptV0`, `projectReceiptProofV0`, tiers `owner`/`subscriber`/`public`. This realizes the privacy-as-failure-mode safeguard at the receipt level. |
| Composition — consuming an upstream trail, revision-/signer-pinned | **Yes (verification), partial (signing)** | `packages/reactor/src/composition/index.ts`: `verifyUpstreamReceiptDependencyPinV0`, `evaluateTransitiveFreshnessV0`, `planCompositionPropagationV0`, `computeDownstreamComposedMemoKeyV0`. `ingestTypedTurn` verifies dependency receipts and runs `detectReceiptCycles` (`kernel/index.ts`), blocking on a cycle. Pins verify against contract revision and signer posture. The signer itself is the **null signer** (`createNullSignerReceiptSignatureV0`) — `{ scheme: "none" }` — so cross-trust-domain cryptographic signing is not yet real. |
| The kernel — fixed-circuit safety, backstops, rollback | **Yes** | `packages/reactor/src/kernel/index.ts`: `evaluatePredicate`, `evaluateBackstops`, `compareRollback`, `detectReceiptCycles`, `createKernelSafetyReceipt`, plus `KERNEL_BACKSTOPS` and the 14-item `KERNEL_MAY_NEVER` list. Predicate-tripped reconciliation has a real, deterministic kernel. |
| Policy — model-authored, compiled, recompiled, rolled back | **Yes in the package runtime; host adapters vary** | `packages/reactor/src/policy/index.ts` (≈2.6k lines): `authorPolicyArtifactV0`, `validatePolicyArtifactV0`, `planPolicyRecompileV0`, `executePolicyRecompileV0`, `planPolicyRollbackV0`. `tickRuntimeScheduler` runs the policy loop after a tick (`planAndMaybeExecutePolicyRecompileAfterTick`). The **two compiles** — the contract compile and the policy recompile — are both present in the package runtime: policy is authored by the agent-SDK adapter, validated by a kernel artifact validator, recompiled on drift, and rolled back on self-trip. The CLI serve adapter still uses a deterministic cold-start seed, so this row is runtime-realized but not fully exposed by every host. |
| Cost accounting — flat spend under a static world | **Yes** | `packages/reactor/src/cost/index.ts`: `validateReceiptSurpriseAttributionV0`, `evaluateFlatSpendUnderStaticV0`, token-truth checks. Every receipt carries a `cost` block with `tokens.fresh`/`tokens.reused`. |
| State export / exit — replayable, portable | **Yes (partial)** | `packages/reactor/src/sdk/exit-bundle.ts` + `importReactorExitBundleV0`: the SDK can export and re-import an exit bundle. This is the runtime form of invariant 8; it is a first export surface, not a full cross-harness migration tool. |

### The cost thesis is measured, not asserted

Part I's whole economic claim — "cost scales with surprise, not time" — has a
runnable, package-backed demonstration. The `flat-tokens` example
(`skills/open-prose/examples/flat-tokens`, driven from packed tarballs) runs
four `createReactor().ingest()` turns against a static world and prints
`tokens.fresh=46`, `tokens.reused=46`, `ratio=46:46`: after the first real
judge, identical input yields memo-hit receipts at zero fresh tokens. The
Cradle C5 summary contrasts this with two same-unit deterministic controls — a
no-memo control at `92:0` and a naive-loop control at `92:0`
(`packages/reactor-cradle/src/baselines/`). The memoization arm of Rule 5 is
not a promise; it is observed.

### What the Cradle exercises

`@openprose/reactor-cradle` is the deterministic test harness, not a second
runtime. It carries 121 tests, including roughly ten labelled integration
scenarios (`packages/reactor-cradle/src/__tests__/`): `b1` scheduler tick,
`b2` auto-recompile, `b3` auto-rollback, `b4` cycle detection, `b7` transitive
freshness, `c2` hands-free, `c5` event-changing cost thesis, `e1`/`e2`
composition, `w7` static-cost. `@openprose/reactor` itself carries 155 unit
tests across receipt, kernel, memo, forecast, composition, policy, projection,
judge, cost, and the reactor loop. The canonical loop, quiescence, forecast,
the kernel, policy recompile/rollback, and composition all have integration
coverage; ensemble judging and fulfillment do not, because they are not
implemented.

### The pattern's authoring rules against the runtime

Part I states each rule as an unqualified north star. This is where authoring
reality is honest: every rule is **writable today** (no syntax is missing),
but several lean on runtime mechanisms whose realization is partial.

| Authoring rule | Writable? | Runtime backing at v0.1 |
| --- | --- | --- |
| 1. Intent lives in the responsibility | Yes | Fully supported; an authoring concern, no runtime dependency. |
| 2. Policy stated semantically, not as ProseScript | Yes | The author writes intent in `### Continuity`/`### Constraints`; the model-authored policy compile/recompile/rollback loop is **real** in `policy/index.ts` and runs after each tick. The author's semantic statement has a live consumer. |
| 3. No host-specific contract logic | Yes | `### Tools`/`### Environment` are name-only by design; the runtime is adapter-injected (`ReactorAdaptersV0`, `sdk/index.ts`) with no hidden defaults. |
| 4. Bounded activations | Yes | Idiomatic; `ingest`/`tick` are bounded turns by construction. The anti-pattern is author error, not a runtime gap. |
| 5. Written for memoization / variable depth | Partial | The memoization half is **real and measured** (memo-hit path, cost thesis). The variable-depth half is **not** — `ensemble` depth throws `not-implemented-in-v0.1`. An author who gates a deep path in `### Execution` is writing forward-compatible intent the runtime does not yet execute. |
| 6. Composition via referenced upstream trail | Partial | Dependency-receipt verification, transitive freshness, cycle detection, and composed memo keys are all real (`composition/index.ts`). Cryptographic signing is **null-signer only** — pin the revision now; cross-trust-domain signing awaits a non-null signer adapter. |
| 7. Ledger as receipt/audit/exit unit | Partial | The receipt schema (`openprose.receipt v0`) is real, content-addressed, verifiable, and projectable. `as_of`, `next_forecast_recheck`, and content-addressing are runtime fields, not hand conventions. Exit-bundle export/import exists but is a first surface. |
| 8. Replayable and exitable | Partial | The runtime is deterministic and replay-tested (Cradle replay/parity suites); `exit-bundle.ts` exports and re-imports state. A full cross-harness migration surface is not yet built. |

### Honest current limits for authors

- **No fulfillment executor.** The runtime judges and records; it does not yet
  mutate the world. The full-Reactor shape from Rule 4 is authorable but its
  commit beat is not a runtime path at v0.1. The **projection-only Reactor**
  shape is the one whose every component (sense → judge → receipt → projection)
  has runtime backing — it is, today, the most fully realized Reactor shape.
- **Variable-depth judging is a stub.** `depth: "ensemble"` throws. Gate the
  deep path in `### Execution` for forward compatibility, but expect the
  runtime to take the shallow branch until ensemble judging ships.
- **File-watch gateways are not in live serve.** Serve supports cron and HTTP
  ingress; queues, file watches, and provider subscriptions are later phases.
  The worktree/planning-dir example must use a forecast-paced `### Schedule`
  today and note the intended file-watch form.
- **Composition is verified but null-signed.** Dependency-receipt verification,
  revision pinning, transitive freshness, and cycle detection are real;
  cryptographic signing is the null signer (`{ scheme: "none" }`). Pin the
  revision in `### Criteria` now; cross-trust-domain composition awaits a
  non-null signer adapter.
- **The CLI path is local and deterministic.** It proves package/CLI
  integration, receipt production, and projection — not production ingress or
  hosted fulfillment quality.

> The pattern is fully writable today. Its memoization, forecast, kernel,
> policy-loop, composition-verification, projection, and receipt payoffs are
> **realized in `@openprose/reactor` v0.1** and, for the cost thesis,
> measured. Its variable-depth and world-mutating-fulfillment payoffs are
> **not yet runtime paths**. Author to the ideal; do not claim the runtime
> already reaches what this section marks "No" or "Partial."

---

## III. Roadmap — The Delta

`Ideal − Current = Roadmap`. The gap is of two kinds: **documentation and
doctrine changes** to the OpenProse skill that make the Reactor-native pattern
the taught default, and **runtime work** in `openprose/prose` that closes the
"No"/"Partial" rows of the Current audit. Neither changes OpenProse syntax.

### A. Skill documentation and doctrine

These make the Reactor-native pattern the _taught default_ rather than an
advanced corner.

1. **Invert the Mental Model in `01-Language.md`.** The "Mental Model" section
   lists Responsibility Runtime last, as a continuity addendum to a
   system-centric model. Rewrite it responsibility-first: the responsibility
   is the program; the gateway is ingress; the system is one beat of the loop;
   Forme/VM/ProseScript are the substrate. Keep the system-centric model as the
   bounded-work special case, explicitly labeled as the N=0 (no continuity)
   case of the Reactor base case.
2. **Reframe the "Directly runnable?" table.** Add a column or footnote
   distinguishing _run_ (bounded) from _serve_ (reconciled). State plainly that
   `kind: responsibility` being "not directly runnable" means "continuously
   reconciled" and is the **intended top-level authored object** for any
   standing goal — not a lesser artifact.
3. **Add Reactor-native routing to `SKILL.md`.** "First 90 Seconds" routes
   "Run a `.prose.md` service or system" as the default and Responsibility
   Runtime as a specialist path. Add a recognition signal — "make sure X stays
   true," "keep Y current," "watch Z and maintain a view" → **author a
   responsibility + gateway first**, derive the system second — and a
   first-class route that loads `responsibility-runtime.md` and this pattern
   before `forme.md`/`prose.md`, not after.
4. **Promote the authoring rules into `guidance/authoring.md`.** Add a
   "Reactor-Native Authoring" section porting Part I's eight rules as a
   checklist, with the memoization rule (Rule 5) called out as the one authors
   most often violate, and the sense-service-must-emit-a-content-identity
   requirement stated as a lint-able expectation.
5. **Strengthen `### Continuity` / `### Criteria` doctrine in
   `contract-markdown.md`.** State that `### Continuity` is the author's input
   to forecast and memoization (name the freshness referents and the
   memo-breaking condition; make "nothing changed" cheaply observable) and that
   `### Criteria` must use observable referents, with "undecidable" framed as
   an expected, high-value `blocked` reason routed to the author — never an
   enum.
6. **Add a canonical Reactor-native example.** The examples set demonstrates
   full Reactors (stargazer, incident, compliance). Add a **projection-only**
   example — an observe-but-never-touch overseer like the three-layer
   Codex-build overseer — to teach the amputated-fulfillment shape, the
   composition-via-ledger edge, and the forecast-paced-schedule-as-file-watch
   stand-in. It is the clearest teaching case for "cost scales with surprise,
   not the watched system's activity," and — per the Current audit — the
   Reactor shape whose every component already has runtime backing.
7. **Document the projection-only Reactor as a first-class shape.** Both
   `responsibility-runtime.md` and `concepts/reactor.md` should name
   projection-only (judge + projection, no fulfillment) as a deliberate,
   supported shape with its own `### Constraints` idiom, not an incomplete
   Reactor. It is a recurring real use case (audits, overseers, dashboards),
   currently undocumented, and — because the runtime has no fulfillment
   executor yet — the most fully realized Reactor shape at v0.1.

#### Definition of done for the authoring layer

- `01-Language.md` Mental Model is responsibility-first; the runnable table no
  longer implies responsibilities are lesser artifacts.
- `SKILL.md` routes standing-goal language to responsibility authoring before
  system wiring.
- `guidance/authoring.md` carries the eight Reactor-native rules as a
  checklist, with the content-identity requirement explicit.
- `contract-markdown.md` documents `### Continuity` as forecast/memo input and
  `### Criteria` decidability with the undecidable-`blocked` doctrine.
- A projection-only example ships and runs from a fresh clone.
- Every Part I rule that the Current audit marks "Partial"/"No" is
  cross-referenced to the runtime audit so authors are never told the runtime
  delivers what it does not.

### B. Runtime work — closing the Current audit's gaps

These items bridge the runtime from its v0.1 state to Part I. They are the
substantive "No"/"Partial" rows of Section II.

1. **Variable-depth ensemble judging.** `runShallowJudgeV0` rejects
   `depth: "ensemble"` with `not-implemented-in-v0.1`. The runtime must gain a
   real ensemble path so the confidence-gated deep branch authors write in
   `### Execution` actually executes. Cradle's K1 ensemble-spread cassette is
   the recorded-evidence precursor.
2. **A fulfillment executor.** `fulfill` is a receipt role and a kernel
   prohibition, not a runtime path. The full-Reactor commit beat — the bounded,
   `### Constraints`-governed world-mutation step — must be built before the
   "send the email" shape is more than authorable.
3. **A non-null signer adapter.** Composition verification is real but signed
   with the null signer (`{ scheme: "none" }`). Cross-trust-domain
   composition — Rule 6's acceptable-signer-set pinning — needs a real signer
   adapter to be cryptographically meaningful rather than revision-pinned only.
4. **File-watch and richer gateway ingress.** Live serve is cron + HTTP;
   queues, file watches, and provider subscriptions are later phases. Until
   then the worktree/planning-dir pattern uses a forecast-paced `### Schedule`.
5. **A first-class export/exit and cross-harness migration surface.**
   `exit-bundle.ts` exports and re-imports state; invariant 8's full promise —
   carry the contract and its trail to another harness — needs a hardened
   migration surface.
6. **Postgres parity.** Cradle release parity exercises memory and filesystem
   storage rows; Postgres is marked future.

### C. Open authoring items

Deferred by design, tracked so they are neither invented nor dropped:

1. **Content-identity convention.** The *existence* of the obligation is stated
   in [01-Language.md](./01-Language.md) Part I (a sense service may return a
   stable content identity as an `### Ensures` output) and now has a real
   runtime consumer (the memo key is computed over evidence content hashes).
   Only the *convention* — the exact shape of the identity (hash of what,
   normalized how) — is deferred here, pending the harness receipt-schema
   research (harness open item I.1).
2. **Composition reference syntax — resolved.** "B depends on A" is authored as
   a reserved `responsibility` typed-input in `### Requires` (the same
   mechanism as `run`/`run[]`), pinning upstream id-or-path + contract
   revision + acceptable signer set; see [01-Language.md](./01-Language.md)
   Part III §3. Kernel-verifiable, not a Forme edge. The prose-ledger reference
   is the pre-receipt-schema stand-in until the receipt `composition` block
   lands — and the runtime's `composition/index.ts` is the consumer of that
   block once it does.
3. **Policy-shape vocabulary.** How an author states hysteresis _shape_ ("this
   signal is noisy → widen the band") — and, equally, upstream freshness
   tolerance ("A may be one business day stale") — semantically, in a way the
   model-authored policy compile can consume, is principle-only (harness open
   item I.4). The policy compile that would consume it is real
   (`policy/index.ts`); the author-facing vocabulary is not yet specified.
4. **Projection-tier authoring.** Owner / subscriber / public projection
   contracts (the privacy-as-failure-mode safeguard) have no authoring section
   yet; the runtime tiers exist (`projection/index.ts`) but contract-level
   authoring of them is ad hoc per fulfillment system.

> `02-ReactorHarness.md` says what the machine must do.
> `03-ReactorPattern.md` says what to write so it does it. The pattern is
> fully writable now; its memoization, forecast, kernel, policy-loop,
> composition-verification, and projection payoffs are realized in
> `@openprose/reactor` v0.1 today. Its variable-depth and fulfillment payoffs
> are roadmap. Author to the ideal, document the climb honestly.
