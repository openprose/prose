# github-star-enricher

> **Standing goal:** turn open-source attention into thoughtful, evidence-backed
> outreach without becoming spammy. New GitHub stars fan out into per-stargazer
> intelligence; company enrichment is memoized and **shared** across stargazers;
> expensive external calls are **cost-gated**; and the terminal artifact is a
> human-reviewed outreach packet that **never auto-sends**.

**One-line scenario:** three new stars land in one batch: `alice` (high-fit,
`acme`), `bob` (mid-fit, `acme`), `casey` (low-fit, solo). The loop fans them out,
enriches `acme` **once** for both `alice` and `bob`, gates `casey`'s expensive Exa
call **off**, builds and runs a tiny OpenProse sample program for `alice`, and
leaves her outreach packet at `ready_for_review` (drafted, not sent).

This is an OpenProse growth dogfood loop. It stakes out an architecture:
**per-entity fan-out + shared-company receipts + cost-gated enrichment + a hard
human gate**, with an execution-backed sample program as the artifact.

## The DAG (per-person fan-out, a shared-company diamond, a human gate)

```text
 GitHub Star Events ─────────┐         Human Review Events ──┐  (the two external entry points)
        │                    │                │              │
        v                    │                v              │
 Stargazer Registry  <───────┴────────────────┘              │
   │   eligible:alice / eligible:bob / eligible:casey         │
   ├──> Footprint[alice] ─┐                                   │
   ├──> Footprint[bob] ───┤  (per-person fan-out: each subscribes to ONLY its own facet)
   └──> Footprint[casey]  │
        │                 │
        │     ┌───────────┴────────────┐
        │     v                        v
        │  Company[acme]  <── alice+bob fan IN (the DIAMOND, enriched ONCE, shared)
        │  Company[solo]  <── casey
        │     │
        ├──> Person[alice]  (Exa: PAID, above threshold)
        ├──> Person[bob]    (Exa: PAID)
        └──> Person[casey]  (Exa: GATED OFF, below threshold, fresh near zero)
              │
              v
        Intent & Safety[user]  ──track──> Sample Program[user]  (built ONLY for build_sample)
              │                                 │
              └──────────────┬──────────────────┘
                             v
                      Outreach Packet[user]  ── auto_send=false, ready_for_review, STOPS
                             ^
                             └── only Human Review Events can mark it sent_by_human
```

`Footprint[alice]` subscribes to **only** the registry's `eligible:alice` facet,
so a new star on one stargazer never wakes another's lane (per-person fan-out).
`Company[acme]` fans **in** from both `alice`'s and `bob`'s footprints and renders
**once**: when `bob` later wakes it the truth has not moved, so it memo-**skips**
and reuses the shared receipt. `Person[casey]` reads `clears_enrichment_threshold`
and, finding it false, returns a cheap deferred truth without ever paying for Exa.
And `Outreach Packet[*]` carries `auto_send: false` and can only reach
`sent_by_human` through a real action at the **Human Review Events** gateway.

## Run it (the Reactor flow)

The `.prose.md` contracts in `src/` are harness-neutral; the verbs below steer the
Reactor harness. Offline needs no key and no network.

```sh
reactor doctor                 # honest health report (sandbox none, IR absent)
reactor compile --check        # exits 1 (stale): recognized, not yet compiled
reactor compile                # run the compile sessions → IR cache  (needs a key)
reactor topology               # offline now: the compiled DAG (the fan-out + diamond)
reactor run                    # boot, drain, print dispositions + cost
reactor serve                  # serve the world-models + receipts
reactor receipts verify        # chain-verify the on-disk ledger
```

A `reactor run` (or `reactor serve`) writes a chain-verifiable state-dir you can
replay keyless in devtools (the marquee one-liner):

```sh
reactor-devtools <state-dir> --describe
#   dispositions rendered=… · skipped=… · failed=1   (a scripted Exa outage)
#   CHAIN-VERIFY ok
```

## What to try

- **Cost scales with surprise.** Re-run with the _same_ star batch and no new
  review action: the `star-events` gateway memo-**skips**, propagates nothing, and
  the whole graph stays dark (`fresh 0`). Polling frequency does not drive spend;
  surprise does.
- **Move one stargazer.** New GitHub evidence on `alice` perturbs only
  `user:alice` → only `eligible:alice` → only her footprint lane re-renders, and
  because her footprint truth is unchanged the move is **absorbed at the footprint
  boundary** (nothing deeper re-runs). `bob`'s and `casey`'s lanes stay **dark**
  (sibling isolation).
- **Watch the shared company.** `Company[acme]` renders once for `alice` and is
  _reused_ (a memo-skip) when `bob`'s lane wakes it: enrichment is paid per
  company, not per stargazer. Even `bob`'s person-lane retry (below) never re-runs
  it: the company subscribes to a narrow `company-signal` facet, not the retry.
- **Survive a failed external call.** The Exa People adapter goes down for `bob`:
  `Person[bob]` fails **loud and debuggable**; the failed receipt's cost names the
  broken call (`provider: "exa"`, `model: "exa-people"`), the prior identity
  stands, and nothing downstream wakes. When Exa is back, his lane **recovers** on
  the next wake. A failure propagates nothing, exactly like a skip.
- **Trip the cost gate.** Raise `casey`'s GitHub signal above the threshold and her
  `Person[casey]` render jumps from a cheap deferred truth to a ~6× Exa spend.
- **The human gate holds.** No matter the fit, every packet carries
  `auto_send: false` and stops at `ready_for_review`; only a `send_mark` at the
  **Human Review Events** gateway advances it to `sent_by_human`.

## How it is exercised

The example is covered by the project's offline test suite, which drives the
**real `@openprose/reactor` reconciler** with deterministic fake renders (a
dry-run, synthetic-safe GitHub + Exa adapter, so there is no network and no key)
over the FileSystem store + ledger and asserts the validity contract off the
persisted ledger: it compiles to the frozen artifact set; cold-start renders all
and a quiet re-poll skips; `cost.surprise_cause === wake.source` on every receipt
(failed receipts included); `ATOMIC_FACET` everywhere (no `"*"`); the receipt
chain verifies; and two regenerations are byte-identical. It also pins the
flagship lessons: per-person fan-out (a _move-one-stargazer_ beat where only
`alice`'s lane lights and the move is absorbed at her footprint), the shared
`acme` company receipt rendered once and reused, `casey`'s cost-gated-off
enrichment, an Exa _failure → recovery_ whose failed receipt **names the broken
call** (debuggable, not an anonymous red node), and the `auto_send: false` human
gate.

An optional, key-gated live reliability check covers the same flow against the
network; it is a passing **skipped** no-op when keyless or offline.
