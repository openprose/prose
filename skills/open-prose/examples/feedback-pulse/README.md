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

This is a different audience (product feedback) and a different graph shape
(faceted rollup aggregation) from the inbox-triage diamond — its headline is the
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
is acyclic. `src/` ships the 4 authored contracts and mounts 4 nodes on its own;
the 7-node / 11-edge topology is what the reference harness's per-entity
expansion produces from them (see the Harnesses section of the repository
README).

## Conformance expectations

A conforming harness proves per-message and per-theme isolation, cold-render-
then-skip behavior, chain-verifiable deterministic replay, and a self-sourced
weekly refresh that costs zero fresh tokens when the rollup is unchanged.

A run leaves a keyless, chain-verifiable state on disk that any conforming
harness can replay — the universal "aha":

```text
dispositions rendered=… · skipped=… (self-ticks + dedup)
a pricing complaint moves only the pricing facet; the weekly clock advance
refreshes the pulse at ZERO fresh tokens; quiet self-ticks skip at the floor
```

## What ships here

- `src/*.prose.md` — the gateway + theme-tagger + voice-of-customer + weekly-pulse
  contracts. The weekly-pulse `### Continuity` is the self-driven `valid_until`
  pair (a weekly self-tick + an input-driven rollup move).

The freshness note worth internalizing: **time becoming material is just another
input.** A lapsed `valid_until` is a self-sourced wake; when nothing else moved,
the refresh re-stamps the freshness fields and the brief stays current at zero
cost — the cadence is exactly as auditable as a render.
