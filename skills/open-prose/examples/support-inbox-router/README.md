# support-inbox-router

**Architecture: a cheap spam gate + a faceted router whose facets are channels.**
Domain: support / inbox-ops. Address: `support@agents.openprose.ai` (a
primitive.dev inbound inbox).

> A cheap spam gate makes the whole graph dark on junk; a faceted router turns
> one inbox into selective channels — a docs question never wakes the bug board.

The standing goal: triage the inbound support address into a faceted world-model
that downstream channels subscribe to selectively. Spam is dropped by a cheap
model gate, and every real message updates EXACTLY the channel facet it belongs
to — so each downstream wakes only when ITS channel moves.

## What it teaches

- **The spam tenet (the dark graph on junk).** A cheap per-email triage filter
  decides spam vs ham. A spam email's `routed` facet stays NULL (the fixed empty
  token), so it moves nothing — the router is not even woken and no channel
  listener wakes. The cheap filter is the entire spend on junk; cost scales with
  surprise.
- **The channel tenet (selective channel wake).** The router catalogues ham into
  ONE facet per channel (`bug-reports`, `feature-requests`, `docs-questions`,
  `billing`). Each channel facet fingerprints ONLY that channel's set, so a
  message routed to `docs` moves ONLY `docs-questions` → ONLY the docs-gap-tracker
  wakes. A bug moves ONLY `bug-reports` → ONLY the bug-board wakes. A docs
  question never wakes the bug board.
- **A facet is a subscription symbol — it may have zero consumers.** The
  `#### billing` channel facet has NO downstream listener on purpose. It is a
  real, fingerprinted subscription symbol that simply stays dark because nothing
  subscribes to it.
- **The dark lane.** A delivery moves ONLY that email's `email:<id>` facet on the
  gateway; every sibling triage lane stays dark.
- **Self-driven freshness + dedup.** The docs-gap-tracker carries a `valid_until`
  that lapses one business day after review (a `self`-sourced skip at zero cost —
  the audit floor). A duplicate docs question (same canonical content, different
  sender) does not move `docs-questions`, so the tracker dedup-skips.

## DAG sketch

```
                 (inbound support feed)
                       │  email:<id>  (one facet per email — the dark lane)
                 ┌─────▼─────┐
                 │ Support   │  gateway · external-driven · single entry point
                 │ Inbox     │
                 └─────┬─────┘
        ┌──────┬───────┼───────┬───────┬─────────┐
        ▼      ▼       ▼        ▼       ▼         ▼
     [b1]   [f1]    [d1]     [sp1✗]  [d2]      [b2]      6 triage filters
        └──────┴───────┴───┬───┴───────┴─────────┘   (cheap spam/content filter)
                  routed   │   (spam → routed=NULL → wakes nothing)
                 ┌─────────▼─────────┐
                 │  Channel Router   │  one facet per channel
                 └──┬────┬────┬──────┘
   docs-questions   │    │    │  bug-reports / feature-requests / billing(✗ no consumer)
        ┌───────────┘    │    └───────────┐
        ▼                ▼                 ▼
 [docs-gap-tracker]  [roadmap-signals]  [bug-board]
 (self-driven valid_until · llms.txt / "Talk to us")
```

11 nodes / 16 edges. `gateway.support-inbox` is the single entry point; the graph
is acyclic. `#### billing` is a fingerprinted facet with zero subscribers.

## Conformance expectations

A conforming harness proves spam leaves the router and listeners dark, each ham
message moves only its channel facet, billing has no consumer, duplicate docs
content skips, and self-driven freshness remains auditable at zero fresh cost.

A run leaves a keyless, chain-verifiable state on disk that any conforming
harness can replay — the universal "aha":

```text
the spam email's triage renders but wakes nothing (the dark graph on junk)
a docs question lights ONLY the docs gap tracker; a bug lights ONLY the bug board
billing never lights a consumer — a facet may have zero subscribers
```

## What ships here

- `src/*.prose.md` — the gateway + triage + router + three channel-listener
  contracts. The triage's `### Runtime` names the cheap classifier role
  (`anthropic/claude-haiku-4-5`); a harness may substitute another cheap model
  for the same role.
