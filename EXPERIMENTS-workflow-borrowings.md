# Workflow-inspired experiments (feat/workflow-inspired-experiments)

> Branch-scoped report — intended as the PR body when/if this lands. Three
> opt-in experiments borrowing proven mechanics from imperative multi-agent
> workflow harnesses (specifically Claude Code's Workflow tool) into the
> Reactor, each designed → implemented → adversarially reviewed by independent
> agents, then merged here. Base: `2e5282e`. All three default OFF; the
> no-option path is byte-identical to main, proven by the untouched suite.

## The thesis being tested

Spec 02's comparison boundary holds both ways: a workflow DAG is a Reactor
baseline ("workflow DAG with retries but no reconciler"), but the workflow
side has shipped, ergonomic answers to three things the spec honestly defers:
**budget enforcement** (02: "cost is observed, not budgeted"), **node-level
parallelism** (02 Part III §9, Change B), and **deterministic validation at
the call seam with bounded retry** (gap cluster 1, `gateCommit` unwired).
Each experiment ports the mechanic without violating the constitution: no
model on the decision path, skips stay free, receipts still chain-verify,
fail closed.

## Experiment A — enforced fresh-token budget (`experiment/budget-gate`)

**Borrowed:** Workflow's `budget.{total, spent(), remaining()}` hard ceiling —
work-spawning calls *refuse* once spent ≥ total; enforcement, not observation.

- `ReactorBudgetOption { maxFreshTokens }` threads `mountDag → createReactor →
  runProject → reactor()` facade; CLI stretch: `reactor run --budget-tokens <n>`.
- The guard lives at the one chokepoint every dispatch crosses (the
  `spawnRender`/`spawnRenderAsync` ports built in `mounted-dag.ts`), which is
  *after* the reconciler's memo-skip decision — a zero-token skip structurally
  cannot be blocked or charged.
- Refusal = the existing `failed` outcome: zero-cost receipt, fingerprint
  unmoved, prior truth stands, nothing downstream wakes, chain verifies.
  Durable marker rides `cost.model = "budget-exhausted"` (the v0 receipt has
  no `reason` field — the gap-cluster-2 thin-receipt limit, not papered over;
  `isBudgetExhaustedReceipt()` is the single shim to retire when a real
  `reason` field lands).
- `Reactor.budget` exposes the Workflow-shaped view (`total: null` /
  `remaining() = Infinity` when unset).
- Semantics: dispatch-time refusal (an in-flight render may overshoot and
  still commit — Workflow semantics, never a mid-call abort); `spent()` is
  session-scoped (a restarted serve gets a fresh ceiling); failed receipts are
  not memoizable, so an exhausted node re-refuses cheaply on each wake instead
  of poisoning into a permanent skip.

**Evidence:** 11 new tests (render-invocation counters prove refusal at
dispatch; fingerprint byte-equality proves prior-truth-stands; chain-verify
green). Reviewer verdict: **mergeable**, tests independently reproduced.

## Experiment B — node-level render pool (`experiment/render-pool`)

**Borrowed:** Workflow's bounded worker pool (N concurrent agents, ready-queue,
single-flight per item, everything still completes).

- `maxConcurrency` (integer ≥ 1, default 1 = today's serial drain,
  byte-for-byte) on `ReconcilerOptions`/`MountDagInput`. Only the async verbs
  (`ingestAsync`/`tickAsync`/`drainAsync`) overlap renders; sync verbs never.
- Preserved under concurrency: per-node single-flight, dirty-coalescing,
  height-ordered topological settling (a downstream never renders before its
  feeding wake settles), failure isolation, and a rank-guarded wake writer so
  sibling completion order can't corrupt propagation.
- Pooled results return in completion order (documented); receipts may
  interleave in the flat ledger but per-node chains verify and final
  world-models are serial-identical — pinned by tests running inverted sibling
  latencies over the real content-addressed in-memory ledger.

**Evidence:** 14 new tests incl. serial-equivalence (byte-identical receipt
chains, pool 4 vs serial) and overlap proof (observed in-flight > 1). The
reviewer additionally ran 25 random layered DAGs (7–18 nodes, random
latencies) cold/moved/memo — all serial-identical — and mutation-tested the
guards. Verdict: **mergeable**.

## Experiment C — commit gate + validate-and-retry (`experiment/commit-gate-retry`)

**Borrowed:** Workflow's `schema` seam — deterministic validation at the call
boundary, with the model handed the validation error and retried, bounded.

- `commitGate: { enforcePostconditions: true, maxCommitRetries: N }` on
  `runProject`. When on, `withCommitGate` wraps each render: the candidate
  output is evaluated through the previously-zero-caller `gateCommit(...)`
  (compiled deterministic validators + attestation check) *before* commit.
- Gate failure → re-render up to N times with the deterministic failures fed
  back via `RenderContext.commit_gate_retry`; still failing → `failed`
  receipt, nothing commits, prior truth stands. The gate itself is
  deterministic and offline; only the retry spends model work.
- Cost honesty: a committed retried render's receipt sums every attempt's
  tokens.
- Two documented fail-closed edges: the live agent-render does not emit
  `RenderProduct.attestation` yet, so render-attested obligations always
  refuse under enforcement on the live path (constitutionally correct); and
  the CLI cannot opt in until its IR cache persists the full validator set
  (it caches only the postcondition ref — boot guard throws loudly rather
  than silently not enforcing).

**Evidence:** +7 tests driving the real compile→run→ledger machinery
(retry-then-commit with summed costs; always-invalid → prior truth stands,
no downstream wake; option-off byte-identity). Verdict: **mergeable**.

## Cross-experiment interactions (composed here, not yet co-tested)

- **Budget × pool:** refusal is dispatch-time, so the overshoot bound scales
  with in-flight width — up to `maxConcurrency` renders (not 1) can exceed
  the ceiling and still commit. Acceptable Workflow semantics; should be
  documented on `maxFreshTokens` before any non-experimental landing.
- **Budget × commit gate:** composes correctly — a retried render's summed
  attempt cost is exactly what the budget charges (charge happens on the
  final product's cost at the spawn port).
- **Pool × commit gate:** gated renders run inside pooled slots; single-flight
  means a node's retry loop never overlaps itself. Holds by construction; a
  dedicated three-way test is the named follow-up.

## Known follow-ups (from adversarial review; all minor)

1. A: `--budget-tokens` parses via `Number(...)` — empty string becomes an
   enforced 0 budget; should be a strict-integer usage error (exit 2).
2. A: `budget.charge()` lands before `store.commitPublished` — a commit-throw
   counts tokens for a render that produced no receipt (observation-only
   divergence; comment or restructure).
3. B: two pool guards lack a pinning test (await-all-in-flight after a thrown
   render; `!errored` stop-new-launches) — mutation survivors, need a 3-node
   topology to pin.
4. C: a render body that *throws* (vs returning a failure) on attempt ≥ 2
   escapes the wrapper and maps to `noneCost`, dropping attempts 1..N-1 from
   the receipt (live agent-render never throws by contract; stub/I-O edge).
5. C: stale TSDoc on `skipPostconditions` (now false under enforcement), and
   `skipPostconditions + enforcePostconditions` silently gates nothing.
6. Shared: the v0 receipt's missing `reason` field is now load-bearing for two
   experiments' honesty stories — more weight behind closing gap cluster 2.

## Verification trail

- Per-lane: each implementer ran the full offline gate green; each reviewer
  *independently* reproduced it from a clean worktree (`CI=1 pnpm install` +
  `REACTOR_OFFLINE=1`).
- Merged tree (this branch): `pnpm test:reactor:offline` exit 0 — reactor
  517 tests / 507 pass / 0 fail (10 pre-existing key-gated skips; +31 vs the
  2e5282e baseline's 486), reactor-cli 190 / 189 / 0 (+2), devtools 96 / 96.
- Upstream: `git merge-tree` vs `origin/main` (`83920bc`) is conflict-free;
  reviewers B and C additionally built real merge commits against it and ran
  the gate green.
