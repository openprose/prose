# press-desk

**Architecture: a deterministic human gate + a privacy projection.** Domain:
press / partnerships. Inbox: `press@agents.openprose.ai`.

> Inbound press inquiries become a live opportunity register — a high-stakes
> inquiry STOPS at a human gate (never auto-replies), and the public-facing view
> never leaks sender PII.

The standing goal: keep the inbound press / partnership / speaking inbox triaged
into a live opportunity register, paying only for what actually changed, while
two hard safety lines hold by construction — the system never takes an outward
action a human must own, and no sender PII ever escapes into a public projection.

## What it teaches

- **The human gate (`gateCommit`).** A HIGH-importance inquiry drives the briefing
  to status `needs_human` with `auto_reply: false`. The render still *maintains*
  the truth (the register update lands), but it *refuses* the outward action — the
  reply is reserved for a human. The system drafts and packages; it never replies
  by itself. A brief that has reached `needs_human` **skips** on the next quiet
  re-poll — it does not drift and it does not send itself.
- **The privacy projection.** The briefing holds the FULL owner-only view (sender
  name + email + ask) behind `@atomic`, and exposes a `public` facet that is a
  PROJECTION carrying kind + ask + status ONLY. The sender PII never enters the
  public slice, so a downstream public consumer that subscribes to the `public`
  facet can never see who wrote in — privacy by construction, not by review.
- **The dark lane.** A PR blast / cold marketing email is judged irrelevant, so
  its relevance filter leaves its `qualified` facet NULL — a fixed, byte-identical
  token that never moves. The opportunity register never wakes on the noise.

## DAG sketch

```
                 (inbound press feed)
                       │  email:<id>  (one facet per inquiry — the dark lane)
                 ┌─────▼─────┐
                 │ Press     │  gateway · external-driven · single entry point
                 │ Inbox     │
                 └─────┬─────┘
        ┌──────┬───────┼───────┬─────────────┐
        ▼      ▼       ▼        ▼             ▼
    [media] [partner] [speak] [PR blast→NULL] [partner·HIGH]   5 relevance filters
        └──────┴───────┴───────┴─────────────┘
                       │  qualified  (NULL ⇒ dark; never wakes the register)
                 ┌─────▼─────┐
                 │ Opportunity│  media / partnership / speaking facets
                 │  Register  │
                 └─────┬─────┘
       media / partnership / speaking
                       │
                 ┌─────▼─────┐
                 │ Briefing  │  HUMAN GATE (needs_human · auto_reply:false)
                 │           │  + `public` PROJECTION (no sender PII)
                 └───────────┘
```

8 nodes / 14 edges. `gateway.press-inbox` is the single entry point; the graph is
acyclic. (The `speaking` register facet is a *zero-consumer-until-it-moves* lane:
no speaking inquiry is delivered in the scripted episode, so it never wakes — the
same discipline that keeps the dark lanes still.)

## Run it

The contracts in `src/` are harness-neutral. `prose compile` is the intelligent
phase: a session embodies the VM and Forme wires the DAG (gateway → filters →
register → briefing) into the frozen IR. `prose serve` runs the dumb reconciler
over it. Any conforming harness can serve the compiled IR the same way;
replaying a run needs no key.

```sh
prose compile                                          # the intelligent phase → the frozen 8-node / 14-edge DAG
cp dist/manifest.next.json dist/manifest.active.json   # promote the compiled IR
prose serve                                            # the dumb reconciler: a node renders iff its memo key moved
prose status                                           # dispositions, cost rollup, recent runs
```

A run leaves a keyless, chain-verifiable state on disk that any conforming
harness can replay — the universal "aha":

```text
the PR blast stays dark; a HIGH inquiry stops at needs_human (auto_reply:false);
the public view carries kind + ask, never the sender
```

## What ships here

- `src/*.prose.md` — the press-inbox gateway + relevance-filter + opportunity-
  register + briefing contracts (the durable intent the fake renders mirror).

The reference harness carries this example's replay fixture and two checks for
it: an offline, zero-spend gate (topology, cold-render-then-skip,
`cost.surprise_cause === wake.source`, `ATOMIC_FACET`, chain-verify,
byte-determinism) plus the two tenets — the human gate holds (`needs_human` +
`auto_reply === false`) and the public projection carries NONE of the
owner-only sender PII — and an optional key-gated live reliability check that
drives the real relevance-filter render on four labelled inquiries (a PR blast +
one of each kind), reads the published truth, and asks a smart judge to grade
`{relevance_correct, kind_correct, no_pii_leak_in_public, score}` at reliability
≥ 0.8.
