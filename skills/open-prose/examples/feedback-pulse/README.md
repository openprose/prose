# feedback-pulse

**Architecture: rollup aggregation + self-driven weekly freshness.** Domain:
product feedback / voice-of-customer. Inbox: `feedback@agents.openprose.ai` (a
primitive.dev inbound mailbox).

> A weekly voice-of-customer pulse stays current. Themed feedback aggregates into
> per-theme facets, and the brief refreshes on a self-driven weekly cadence — even
> when the inbox is quiet, at ZERO tokens.

The standing goal: keep a noisy inbound feedback stream themed and tallied into a
shipped weekly pulse brief, paying only for what actually changed, and keeping the
brief no staler than a week — without spending a token in a quiet week.

This is a different audience (product feedback) and a different reactor (faceted
rollup aggregation) from the inbox-triage diamond — its headline is the
**self-driven `valid_until` freshness cadence**.

## What it teaches

- **Self-driven `valid_until` freshness.** The Weekly Pulse is a standing,
  maintained truth carrying a `valid_until` that lapses on a weekly cadence. When
  the gateway's `week` clock advances past `valid_until`, the pulse refreshes and
  re-stamps `valid_until` — **even when no feedback arrived all week**. Because a
  quiet refresh moves NO new material (only the freshness clock advanced), that
  continuity render burns **ZERO fresh tokens**. A self-sourced `tick` whose
  inputs have not moved and whose `valid_until` has not lapsed memo-skips at zero
  (the audit floor).
- **Faceted rollup aggregation = per-theme isolation.** The Voice of Customer
  aggregator exposes ONE FACET PER THEME (`pricing`/`performance`/`onboarding`/
  `integrations`) plus a cheap `rollup`. A fresh `pricing` complaint moves ONLY
  the `pricing` facet; the other three theme facets stay byte-identical. A
  consumer subscribed to a different theme never wakes on an unrelated theme.
- **The dark lane.** A new message to one id moves ONLY that message's
  `feedback:<id>` facet; every sibling theme-tagger stays dark.

## DAG sketch

```
                 (inbound feedback feed)
                   │  feedback:<id> (one facet per message — the dark lane)
                   │  week          (the standing weekly clock)
             ┌─────▼──────┐
             │  Feedback  │  gateway · external + self-driven · single entry point
             │  Inbox     │
             └─────┬──────┘
        ┌──────┬───┼───┬───────┐
        ▼      ▼   ▼   ▼        │  week
     [f1]   [f2] [f3] [f4]      │   (the valid_until cadence)
        └──────┴───┴───┘        │
                │ (fan-in)      │
        ┌───────▼────────┐      │
        │ Voice of       │  pricing / performance / onboarding /
        │ Customer       │  integrations facets + rollup
        └───────┬────────┘      │
                │  rollup       │
                └───────┬───────┘
                        ▼
                 ┌────────────┐
                 │  Weekly    │  terminal · self-driven valid_until freshness
                 │  Pulse     │  refreshes weekly at ZERO tokens when quiet
                 └────────────┘
```

7 nodes / 11 edges. `gateway.feedback-inbox` is the single entry point; the graph
is acyclic.

## Run it (Reactor flow)

The contracts in `src/` are harness-neutral; these verbs steer you through the
Reactor harness. Offline replay needs no key.

```sh
reactor doctor                 # honest health report (the best command in the kit)
reactor compile                # the intelligent phase: a session compiles src/*.prose.md
reactor topology               # the compiled DAG (inbox → taggers → voice-of-customer → pulse)
reactor run                    # boot, drain, print dispositions + cost rollup
reactor serve                  # serve the receipts + world-models for inspection
reactor receipts verify        # chain-verify the ledger
```

Replay the committed, keyless fixture in devtools — the universal "aha":

```sh
reactor-devtools ./replay --describe
#   dispositions rendered=… · skipped=… (self-ticks + dedup)
#   a pricing complaint moves only the pricing facet; the weekly clock advance
#   refreshes the pulse at ZERO fresh tokens; quiet self-ticks skip at the floor
```

## What ships here

- `src/*.prose.md` — the gateway + theme-tagger + voice-of-customer + weekly-pulse
  contracts. The weekly-pulse `### Continuity` is the self-driven `valid_until`
  pair (a weekly self-tick + an input-driven rollup move).
- `replay/` — the committed, keyless, chain-verifiable state-dir (topology, labels,
  beats, receipts, world-models) that `reactor-devtools` replays unchanged.
- `generate.ts` — drives the **real** `@openprose/reactor` reconciler with
  deterministic fake renders (no key) and writes `replay/`. Regenerating is
  byte-identical to the committed bytes.
- `feedback-pulse.test.ts` — the offline, zero-spend gate (the validity contract:
  topology, cold-render-then-skip, `cost.surprise_cause === wake.source`,
  `ATOMIC_FACET`, chain-verify, byte-determinism, and the freshness tenet — a
  self-sourced continuity tick on the pulse, a zero-fresh weekly refresh, and
  per-theme isolation).
- `feedback-pulse.live.test.ts` — optional key-gated live reliability check: the
  real theme-tagger render (`openai/gpt-5.4-mini`) over four labelled feedback
  emails, graded by a smart judge (`anthropic/claude-opus-4.8`) at reliability
  >= 0.8. A passing-skipped no-op offline.

The freshness note worth internalizing: **time becoming material is just another
input.** A lapsed `valid_until` is a self-sourced wake; when nothing else moved,
the refresh re-stamps the freshness fields and the brief stays current at zero
cost — the cadence is exactly as auditable as a render.

To regenerate the committed `replay/` after a contract or SDK change:

```sh
tsx generate.ts
```
