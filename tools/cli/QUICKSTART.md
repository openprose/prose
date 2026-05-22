# Prose CLI Quickstart

This is the local deterministic Reactor demo path for the CLI worktree. It
uses the bundled `incident-briefing-room` example with local adapters and
writes Reactor receipts on disk. The path is intentionally local: it proves
compile, serve, status projection, receipt production, and fulfillment dispatch
without claiming hosted ingress or live-model fulfillment quality.

## Environment Prerequisites

- Node.js 20 or newer.
- Corepack enabled (`corepack enable`) so the repo uses `pnpm@9.15.0`.
- A prepared checkout of <https://github.com/openprose/prose>.

## Install From A Prepared Checkout

```bash
cd /path/to/prose
corepack enable
pnpm install
pnpm build
cd tools/cli
npm link
prose --help
```

The checkout build compiles the Reactor packages, Cradle, and the CLI in the
same order used by CI.

## Copy The Bundled Example

```bash
cd ../..
demo_parent="$(mktemp -d)"
cp -R skills/open-prose/examples/incident-briefing-room "$demo_parent/"
cd "$demo_parent/incident-briefing-room"
```

## Compile And Activate The Manifest

```bash
prose compile src --harness mock
cp dist/manifest.next.json dist/manifest.active.json
```

`prose compile` validates the emitted repository IR before returning success.
The `mock` harness keeps the shell path offline; the source compiler still
lowers the local `*.prose.md` files into `dist/manifest.next.json`.

## Serve The Responsibility

Run this in the example directory and leave it running:

```bash
PROSE_REACTOR_LOCAL_STATUS=down prose serve --port 7331 --harness mock
```

`prose serve` loads `dist/manifest.active.json`, binds local HTTP triggers, and
records Reactor receipts under `state/reactor/`. The local Reactor adapter is
deterministic and labels usage as `openprose-cli-local` /
`deterministic-shallow-v0`. The `PROSE_REACTOR_LOCAL_STATUS=down` override
makes the demo produce pressure and a forwarded fulfillment artifact without
claiming live external side effects.

## Trigger An Incident Event

In a second terminal, from the same example directory:

```bash
curl -fsS -X POST http://127.0.0.1:7331/incident/events \
  -H 'content-type: application/json' \
  -d '{
    "incident_id": "inc-2026-05-20-checkout-latency",
    "source": "pagerduty",
    "reported_at": "2026-05-20T19:14:00.000Z",
    "summary": "Checkout latency rose after the canary deploy; support has three enterprise tickets.",
    "links": ["https://status.example.test/incidents/inc-2026-05-20-checkout-latency"],
    "severity": "sev2"
  }'
```

The route returns `202 Accepted` after the trigger is accepted. The serve
process should also print a forwarded command for the fulfillment activation:

```text
prose run src/incident-briefing-room.prose.md
```

## Inspect Status And Surprise Attribution

```bash
prose status --tier=owner
prose status --tier=public
```

The owner output should include the Reactor status, the pressure activation,
and per-token surprise attribution. The token counts are local estimates, so
look for the shape rather than fixed numbers:

```text
status: down at ...
surprise: fresh=<N> reused=0 surprise_cause=real-input role=judge provider=openprose-cli-local model=deterministic-shallow-v0
pressure: fulfillment for down -> incident-channel-current.fulfillment;
```

The public projection should still show the status and surprise line, but omit
owner-only details. The receipt log is written at:

```text
state/reactor/067NC4KG0NSK9D9P6WW3JEHV7G/receipts.json
```

Fulfillment dispatch evidence is written under:

```text
runs/<run-id>/fulfillment-artifact.json
```

This quickstart is covered by the spawned CLI test for
`incident-briefing-room`, which compiles the bundled example, promotes
`manifest.next` to `manifest.active`, serves a local trigger, posts an incident
event, waits for one fulfillment artifact, and checks `prose status` for
`surprise_cause=real-input`, `fresh=`, `reused=0`, provider, and model.
