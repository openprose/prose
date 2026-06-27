# context-boundary

**The standing goal:** maintain a bounded request brief while keeping runtime
payloads out of `### Context`.

This example exists to show the intended shape of `### Context`: it gives the
render read-only grounding, but the actual request still enters through a
gateway, is published as maintained truth, and wakes the downstream
responsibility through `### Requires`.

## The DAG

```text
request-inbox (gateway, external-driven)
   maintains: request
   triggered with --data
        |
        | facet: request
        v
context-brief (responsibility, input-driven)
   requires: request
   context: read-only guidance for interpreting the request
   maintains: brief
```

## What `### Context` does here

`context-brief` uses `### Context` to say:

- where the declared upstream truth is expected to come from;
- that the render must not invent request ids, source revisions, or user goals;
- that the staged request must be read through upstream world-model tools.

The request itself is **not** in Context. It enters through
`reactor trigger request-inbox --data ...`, is folded by the gateway into the
`request` facet, and then wakes `context-brief`.

## Deterministic test path

This example is covered by the Reactor CLI offline tests. From the repository
root:

```bash
REACTOR_OFFLINE=1 pnpm --filter @openprose/reactor-cli build:test
REACTOR_OFFLINE=1 node --test packages/reactor-cli/dist-test/__tests__/run.test.js
REACTOR_OFFLINE=1 node --test packages/reactor-cli/dist-test/__tests__/connectors.test.js
```

The positive end-to-end case is:

```text
stages --data, propagates request truth, and renders a Context-grounded subscriber
```

It exercises this path:

```text
src/*.prose.md
  -> compile with fake structured providers
  -> persisted compiled IR / contract views
  -> reactor trigger request-inbox --data
  -> gateway ingress staging
  -> request-inbox publishes request truth
  -> context-brief wakes from the moved request fingerprint
  -> context-brief reads upstream truth by reference
  -> context-brief publishes state/brief.md
  -> ingress, gateway, and subscriber receipts chain-verify
```

The main negative boundary case is:

```text
the ONE-SHOT `reactor trigger <non-gateway> --data` path fails closed (B3)
```

That negative case proves `--data` cannot be used as a hidden payload lane into a
non-gateway responsibility.

## Manual Reactor run

If you have Reactor configured with a model provider, run:

```bash
cd skills/open-prose/examples/context-boundary
reactor doctor
reactor compile
reactor topology
reactor trigger request-inbox --data '{"id":"ctx-demo-001","source_revision":"manual","goal":"Summarize what the Context boundary allows."}'
reactor receipts
```

You should see:

- topology with `request-inbox` as the external gateway and `context-brief` as an
  input-driven subscriber;
- trigger output where `request-inbox` and `context-brief` render;
- at least three receipts: the staged ingress arrival, the gateway render, and
  the subscriber render;
- `context-brief` waking from input, not from an external payload;
- a published brief that names the request id and source revision from the
  gateway-maintained request truth.

The exact prose in the brief may vary by model. The boundary that should not
vary is the data path: payload -> gateway `Maintains` -> subscriber `Requires`.
