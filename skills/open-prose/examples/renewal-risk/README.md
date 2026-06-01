# renewal-risk

The relatable on-ramp: **a standing customer-health truth that re-judges only the
accounts whose signals moved.** SaaS / finance, a single headline responsibility,
selective wake. This is the non-React example the library leads with.

## One-line scenario

Your portfolio of active accounts emits thousands of product-usage, support, and
billing signals a day. `renewal-risk` keeps a current renewal-risk verdict for
every account as a *maintained truth* — and only re-judges an account when **that
account's** signals actually move. Quiet accounts cost nothing; a signal that
nudges an account without changing its verdict never pages the team.

## The DAG

```
Signal Inbox  (ingress, phantom)
     │  @atomic
Account Signals  (gateway · ### Continuity: external-driven · entry point)
     │  acct:<id>          one facet per account — the selective-wake boundary
     ▼
Renewal Risk  (responsibility · the standing maintained truth)
     │   ├─ risk     the live verdict (level + next action) — alertable
     │   └─ history  the append-only decision log — NOT alerted on
     │  risk
     ▼
Renewal Alert Feed  (responsibility · subscribes to `risk` ONLY)
```

`renewal-alert-feed` subscribes to the `risk` facet **only**, never to `history`.
So the team is paged when a verdict *flips* — and stays dark when the standing
truth merely re-judges an account to the same verdict (the non-material memo-hit)
or appends to its decision history.

## What it teaches

- **A standing, maintained truth.** `renewal-risk` is a `responsibility` whose
  `### Maintains` world-model carries every account's current verdict. It reads
  its prior truth **by reference** and carries unchanged accounts forward.
- **Selective wake.** The gateway exposes one `acct:<id>` facet per account. A
  single account's material signal change perturbs *only* its facet, so only that
  account is re-judged — the sibling accounts' lanes stay dark.
- **Cost scales with surprise.** A byte-identical re-delivery memo-skips the whole
  graph (`fresh 0`); a verdict-stable re-judgement re-renders the truth but leaves
  the `risk` facet put, so the alert feed never wakes. Only a real verdict flip
  spends fresh tokens downstream.

## The flow (offline, no key)

The contract is harness-neutral; the verbs below steer toward the Reactor harness.

```sh
reactor doctor                 # honest health report (sandbox, IR presence)
reactor compile --check        # exits 1 (stale) until the project is compiled
```

## The flow (live · needs OPENROUTER_API_KEY + @openai/agents + zod)

```sh
reactor compile                # run the compile sessions -> IR cache (the intelligent phase)
reactor topology               # offline now: the compiled DAG (signals -> renewal-risk -> alerts)
reactor run                    # boot, drain, print dispositions + cost
reactor serve                  # expose the gateway webhook + the maintained truth
reactor receipts               # the chain-verifiable audit ledger
```

## Replay the committed fixture (keyless)

This example ships a frozen, chain-verifiable `replay/` state-dir — the exact
state-dir shape `reactor-devtools` replays. The marquee frame is a long flat-cost
quiet stretch, one alert spike, and a verdict-stable beat that stays dark:

```sh
reactor-devtools ./replay --describe
#   dispositions rendered · skipped · failed
#   surprise-cause  external · input · self
#   COST ROLLUP (tokens) ...  CHAIN-VERIFY ok
```

## The gate

`renewal-risk.test.ts` is the deterministic tier-2 gate. It drives the **real
`@openprose/reactor` reconciler** with deterministic fake renders (no key) via
`generate.ts`, then asserts the six validity-contract properties off the persisted
ledger — compile artifacts, cold-renders-then-skips, `cost.surprise_cause ==
wake.source`, `ATOMIC_FACET` (never `"*"`), `verifyReceiptChain`, and
byte-deterministic regeneration. Run it offline at zero spend:

```sh
REACTOR_OFFLINE=1 npx vitest run skills/open-prose/examples/renewal-risk   # or: pnpm test:examples
```

`renewal-risk.live.test.ts` is the optional tier-3 reliability check; it is a
passing-skipped no-op without a key or under `REACTOR_OFFLINE=1`.

## Files

- `src/account-signals.prose.md` — the `gateway` (`### Continuity: external-driven`).
- `src/renewal-risk.prose.md` — the headline `responsibility` (`### Requires / ### Maintains / ### Continuity`, `#### risk` / `#### history` facets).
- `src/score-account-health.prose.md` — a stateless `function` helper (`### Parameters / ### Returns`).
- `src/renewal-alert-feed.prose.md` — the downstream `responsibility` subscribing to `risk` only.
- `replay/` — the committed, keyless, chain-verifiable state-dir.
- `generate.ts` — regenerates `replay/` from the real reconciler.
