# oblique-weave

**The standing goal:** maintain one weird-but-actionable product experiment per
cycle — a `SurprisingBetMemo` with a cheap kill test — by running a *programmable
novelty-pressure system*. The interesting part is not "many agents." It is **who
sees what**: four adversarial roles, each a first-class subscriber with a
*different masked viewport of the same truth*, and a terminal auditor that can
re-weave who sees what **next epoch** without ever creating a graph cycle.

**One-line scenario:** a `Product Signal Inbox` gateway feeds a deduped
`Signal Ledger`; a `Viewport Policy` projects **one masked view per role**
(Analogist, Adversary, Constraint Breaker, Weirdness Keeper); the roles fan into an
`Oblique Thread Ledger` → `Surprising Bet Memo` → terminal `Novelty Auditor`. A new
signal that touches only one role's masked slice wakes **only that role**; the
auditor's recommended viewport shift returns as a **new explicit Weave Config
receipt** the next epoch.

This is the worked, executable demonstration of **hidden-context adversarial role
composition**: roles as first-class subscribers each with a different masked
viewport, and a terminal recommendation that closes the loop across an epoch
boundary — DAG-preserving.

## The DAG

```
Product Signal Inbox (gateway)        Weave Config (gateway)
        │ @atomic                          │ @atomic
        ▼                                  │   (the auditor's re-weave re-enters HERE next epoch)
   Signal Ledger ──────────┐              │
                           ▼              ▼
                       Viewport Policy  ── one MASKED FACET per role
            ┌───────────────┼───────────────┬───────────────┐
   view:analogist   view:adversary  view:constraint-breaker  view:weirdness-keeper
        ▼               ▼                   ▼                     ▼
    Analogist       Adversary       Constraint Breaker     Weirdness Keeper
        └───────────────┴─────────┬─────────┴─────────────────────┘
                                  ▼
                       Oblique Thread Ledger   (diamond fan-in; minorities preserved)
                                  │ @atomic
                                  ▼
                       Surprising Bet Memo
                                  │ @atomic
                                  ▼
                       Novelty Auditor  (TERMINAL — no edge back; emits a recommended
                                         viewport shift applied as a NEW Weave Config next epoch)
```

Eleven nodes, fourteen edges, **two external-driven entry gateways**, over one
shared ledger. Each role subscribes to its **own** `view:<role>` masked facet (a
named facet, never `"*"`), so it wakes if and only if its slice moved.

## The beat arc (the committed `replay/`)

| epoch | what happens | who renders | the lesson |
|---|---|---|---|
| **cold** | the config + the first signal delivery land | the whole weave lights once | a standing responsibility is compiled + run |
| **quiet** | an identical signal re-delivery | `signals:skipped` *(nothing downstream wakes)* | the marquee `skipped · moved[—] · fresh 0` frame |
| **surprise** | a new founder hunch routes to ONE role | **only the Analogist** re-renders; three siblings stay DARK | a role wakes IFF its **masked viewport** moved (hidden context) |
| **re-weave** | the auditor's recommended seed bump arrives as a NEW Weave Config | the viewport re-routes; the affected roles re-render | the terminal recommendation closes the loop **across an epoch boundary** — no same-epoch cycle |

The surprise epoch is the marquee: a new anomaly perturbs **exactly one** role's
masked facet, so **exactly one** role re-renders and the other three burn zero
fresh. You cannot wake a role by re-waking a fixed-contract entry node — to deliver
fresh external truth you **move the entry node's memo key** (each delivery is a new
gateway contract epoch), and the *masked viewport* is what then decides *who* wakes.

## Run it with the Reactor harness

The `.prose.md` contracts work with any harness; these verbs steer to Reactor.

```sh
reactor doctor                 # honest health report (sandbox, IR presence)
reactor compile --check        # exits 1 (stale): recognized, not yet compiled
reactor compile                # run the compile session -> IR cache (needs a key)
reactor topology               # offline: the compiled DAG (the masked weave)
reactor run                    # boot, drain, print dispositions + cost
reactor receipts               # the audit trail (rendered / skipped / fresh)
reactor serve                  # browse the receipts + world-models locally
```

Replay the committed keyless fixture (no key, one second) in devtools:

```sh
reactor-devtools ./replay --describe
#   dispositions rendered=... · skipped=... · failed=0
#   surprise-cause  external=... · input=...
#   COST ROLLUP (tokens)  fresh=...  CHAIN-VERIFY ok
```

## What to try

- **Re-deliver the same signal** and watch `total.fresh` stay flat — the entry
  node memo-skips and nothing downstream wakes.
- **Land a new anomaly** and watch **only** the one role whose masked viewport it
  routes to re-render; confirm the other three roles stayed dark.
- **Apply the auditor's `recommended_viewport_shift`** as a new Weave Config
  delivery and watch the viewport re-route — the loop closes across the epoch
  boundary, the mounted graph still acyclic.
- Confirm `cost.surprise_cause === wake.source` on every receipt — the cause of the
  spend is the wake that drove it, read off `ctx.wake.source`, never hardcoded.

## How it's built & tested

- `src/*.prose.md` — the harness-neutral contracts: two gateways (the Product
  Signal Inbox + the Weave Config, each `### Continuity: external-driven`), the
  Signal Ledger, the **Viewport Policy** (with `#### view:<role>` masked-facet
  sub-headings), the four roles, the Oblique Thread Ledger, the Surprising Bet Memo,
  and the terminal Novelty Auditor.
- `generate.ts` — drives the **real `@openprose/reactor` reconciler** with
  deterministic fake renders (no key) through the public SDK
  (`createFileSystemStorageAdapter` → `createFileSystemReceiptLedger` → `mountDag`
  → `dag.ingest`) and writes the committed `replay/` state-dir, including a
  self-written `beats.json` so a regeneration is lossless.
- `replay/` — the committed, keyless, chain-verifiable artifacts: a flat
  `receipts.json`, `compile/topology.json` + `compile/labels.json`, and
  `world-models/<hexNodeId>/{published.json, versions/sha256_*.bin}` — the exact
  shape `reactor-devtools` replays.
- `oblique-weave.test.ts` — the deterministic tier-2 gate (offline, zero spend).
  Its body mirrors this README; if it breaks, the README is wrong — fix both.
- `oblique-weave.live.test.ts` — an optional tier-3 reliability check, key-gated
  (a passing-skipped no-op when offline / keyless).
