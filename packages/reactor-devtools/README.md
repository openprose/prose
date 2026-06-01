# @openprose/reactor-devtools

DevTools / visualization for the [`@openprose/reactor`](../reactor) harness.

It reads the SDK's **append-only, content-addressed receipt ledger** and animates
the DAG the way React DevTools' "highlight updates" animates a component tree:
nodes **flash** on render, **dim-pulse** on memo-skip, go **red** on fail,
per-facet edges light on propagation, and a **fresh-vs-reused token / $ meter**
tracks the thesis — *cost scales with surprise, not the clock.* A reviewer who
has used React DevTools understands Reactor in one screen.

> The visualization **is** the audit trail, animated: it reads the same receipts
> you would audit. Nothing here is a separate telemetry channel.

## Status

Replay-first. Launch scope is **S1 + S2**:

- **S1** — open a saved `<state-dir>`, draw the topology DAG (layered, dark
  theme) + the ordered receipt timeline; a scrubber steps through receipts.
- **S2** ⭐ — node flash on `rendered`+moved-facet, dim grey pulse on `skipped`,
  red on `failed`, per-facet edge lights, a live fresh-vs-reused token/$ meter by
  `surprise_cause`, and play / pause / speed pacing.

**S4** (click-through inspector) is a strong nice-to-have. **S3** (live attach)
and **S5** (facet / diamond polish) are follow-ons (see below).

## Usage (standalone)

```bash
reactor-devtools <state-dir> [--port 4555] [--host 127.0.0.1] [--describe]
```

`--describe` prints a headless run summary (per-node + per-frame dispositions,
moved-facet diff, cost rollup, chain-verify) and exits without a browser -- the
text an agent reads to sanity-check a run. `--version`/`-V` prints the version,
`--help`/`-h` the usage.

A **replayable state dir** = a flat `receipts.json` (the durable trail) + `compile/topology.json`
+ `world-models/`. Replay needs **zero** running reactor and **zero** model key.
If `compile/topology.json` is absent, the viewer falls back to a node-only set
derived from the receipts' distinct `node` values (no edges).

### The SPA (S1 + S2, built)

`reactor-devtools <state-dir>` boots the server and prints a localhost URL; open
it for the viewer. The single, no-build SPA (`src/public/{index.html,app.css,app.js}`)
renders three coordinated regions, all driven by `GET /api/state`:

- **Layered DAG** (left) — a longest-path layered layout of the topology, drawn
  as hand-rolled SVG. Every node referenced by `topology.nodes` *or* by an edge
  endpoint gets a box (so a producer-only ingress still appears, drawn dashed);
  entry-point gateways are gold-bordered; per-facet edges curve with arrowheads
  (named-facet lanes dashed, `@atomic` solid). The whole DAG fits the viewport.
- **Sidebar** (right) — a live **fresh-vs-reused token / $ meter** (cumulative up
  to the scrub head, split by `surprise_cause`, with the replay grand total), and
  the **ordered receipt timeline** (each receipt's index, disposition tick,
  node, and wake cause; current row highlighted, future rows dimmed, click to
  jump; autoscrolls to the head).
- **Scrubber** (bottom) — `⏮ ◀ ▶ ▶| ⏭` transport + a speed selector + a seek
  range + a readout (`frame i/N · node · status · cause · moved [...]`). The
  scrub head marks which node each receipt hit on the graph (cyan for rendered,
  grey for skipped, red for failed) and dims nodes not yet touched in the replay.

Interaction: **space** play/pause, **←/→** step, **Home/End** jump, click a
receipt to jump, drag the seek bar. A `#frame=<n>` URL hash deep-links the viewer
to a specific receipt (useful for screenshots / sharing a moment).

#### The animations (S2 ⭐ — the hero shot)

Pressing **▶** (or stepping forward) fires, per receipt, a **transient,
fire-and-forget** pulse — the cascade. These are layered onto the same DOM as
idempotent state, so a backward scrub or a long jump never replays a cascade;
only a real step/play tick animates. The mapping (plan §4):

- **node flash** — `rendered` + a moved fingerprint: a bright decaying halo bloom
  + box glow, hued by `wake.source` (input cyan / self violet / external gold).
  The React-DevTools "highlight update" box.
- **per-facet edge light** — for each moved facet of the producer, its
  `producer → subscriber` lanes light to the facet color and a **token bead**
  rides the path producer→subscriber; *only the moved facet's lanes light* (a
  `hiring`-only subscriber stays dark — the selector boundary, made visible).
- **woken ring** — each **distinct** downstream subscriber the move wakes pulses a
  quick ring, staggered just after the producer flash so propagation reads as a
  cascade. A subscriber reached by ≥2 moved facets is woken **once** (the diamond
  single-wake, deduped by the SDK's own `propagationTargets`).
- **dim grey ripple** — `skipped`: a faint grey halo breathes once, no glow, no
  edges. The "correctly did nothing" shot React can't take. (A `rendered` receipt
  that moved *nothing* — a self-tick that stops there — gets this same dim pulse
  and lights no edges.)
- **red flare** — `failed`: a red halo + box flare; prior truth stands, no edges.
- **cost sparkline** — fresh tokens per receipt, colored by `surprise_cause`, with
  a faint reused underlay and a moving playhead. **Flat near zero on a quiet
  stretch, a tall spike on a surprise** — "cost scales with surprise," rendered.
  The bar that just fired gets a one-shot spike highlight.

**Pacing.** The speed selector (0.5–8×) scales both the step cadence
(≈600 ms/receipt at 1×) and the pulse duration, capped near the step interval
during playback so fast play stays crisp instead of smearing.

## Library

```ts
import { openStateDir, buildSnapshot, startDevToolsServer } from "@openprose/reactor-devtools";

// 1. Open a saved dir and build the SPA payload (pure read of the SDK).
const opened = openStateDir("/path/to/state-dir");
const snapshot = buildSnapshot(opened);

// 2. Or just serve it.
const server = await startDevToolsServer({ stateDir: "/path/to/state-dir", port: 4555 });
console.log(server.url);
```

The package is importable directly so the SURPRISE-COST benchmark front-end or a
docs site can embed the renderer **without pulling the CLI**.

## Stack

Deliberately near-zero-dep, matching the SDK's ethos:

- **Server** — Node's built-in `node:http`. No web framework.
- **Push** — SSE (`/events`) scaffolded as the S3 live-attach seam; replay needs
  no streaming (the SPA owns all pacing client-side).
- **Front-end** — a vanilla, no-build SPA (hand-rolled SVG for the layered DAG +
  CSS/Canvas animations). The graph is a DAG, so a simple layered layout fits.

**Runtime dependencies:** only `@openprose/reactor` (`workspace:*`). That is the
whole point of the package boundary — the SDK stays zero-dep and headless; every
opinionated UI choice is quarantined here, and here it is still near-zero.

## How it reads the harness (the data contract)

All reads go through `src/data` — the only place this package touches the SDK:

| Need | SDK surface |
|---|---|
| Open the durable trail | `createFileSystemStorageAdapter({ directory })` (`@openprose/reactor`) |
| Re-derive the ledger (= replay) | `new FileSystemReceiptLedger({ storage })` (`@openprose/reactor/sdk`) |
| Order + chain index + moved-facet diff + cost rollup | `createReplaySession({ ledger })` (`@openprose/reactor/sdk`) |
| Topology graph | `<state-dir>/compile/topology.json` (`TopologyWorldModel`) — `MountedDag` has no `.topology` in replay |
| Chain / tamper badge | `verifyReceiptChain` (`@openprose/reactor/sdk`) |
| Click-through world-model (S4) | `FileSystemWorldModelStore.readVersion(node, version)` where `version === receipt.fingerprints["@atomic"]` |

The event → visual mapping:

| Receipt signal | Visual |
|---|---|
| `status: "rendered"` + a moved facet | node **flashes** (bright decaying pulse) |
| `status: "skipped"` | **dim grey pulse** (memo hit; correctly did nothing; zero fresh) |
| `status: "failed"` | **red node**; no edge lights (fingerprint didn't move) |
| `wake.source` (`input`/`self`/`external`) | flash hue |
| moved facet *f* on producer *p* | light per-facet edges `p → subscriber` for *f* only |
| a downstream woken by ≥2 moved facets of one producer | woken **once** (diamond single-wake) |
| `cost.tokens.fresh` / `reused` + `surprise_cause` | token / $ meter tick |

### HTTP endpoints

The server (`startDevToolsServer`) serves the SPA plus a tiny read-only API:

| Route | Returns |
|---|---|
| `GET /api/state` | the full `ReplaySnapshot` (topology + frames + costRollup). `GET /api/snapshot` is a kept alias. |
| `GET /api/node/:id?version=<v>` | the node's world-model at a version (S4 click-through) via `readVersion`. `version` is a frame's `atomicVersion`. `400` if missing, `404` if no such node/version. |
| `GET /events` | SSE seam for S3 live attach — idle (a comment, held open) in replay. |

### The frame shape the SPA consumes

`GET /api/state` → `ReplaySnapshot` carries `frames: ReceiptFrame[]` in append
order (the scrubber index = `frame.index`). Each frame is a pure projection of one
receipt:

```ts
interface ReceiptFrame {
  index: number;                 // scrubber position (append order)
  node: string;                  // which node to flash / dim / red
  status: "rendered" | "skipped" | "failed";
  wakeSource: "input" | "self" | "external";   // flash hue
  movedFacets: string[];         // facets that moved vs this node's prior receipt
  edgesToLight: { producer: string; subscriber: string; facet: string }[];
                                 // per-facet lanes to light — only on rendered+moved
                                 // (skipped/failed light none); strict facet match
  wokenSubscribers: string[];    // DISTINCT downstreams woken — diamond single-wake
                                 // (deduped via the SDK's own propagationTargets)
  cost: { fresh: number; reused: number; surpriseCause: "input"|"self"|"external" };
  contentHash: string;           // this receipt's address (inspector chain key)
  atomicVersion: string;         // = fingerprints["@atomic"]; pass to /api/node?version=
}
```

`edgesToLight` and `wokenSubscribers` are derived server-side in `buildSnapshot`
from the saved topology and the receipt's moved facets, reusing the SDK's
`propagationTargets` so the **diamond single-wake** (a subscriber reached by ≥2
moved facets of one producer fires exactly once) matches the live reconciler.

## Future `reactor dev` CLI integration (for the CLI agent to wire)

This package ships **standalone** and does not touch `@openprose/reactor-cli`. To
add a `reactor dev` verb later, lazily deep-import the devtools server (mirroring
the CLI's offline-import discipline):

```ts
// in @openprose/reactor-cli, behind `reactor dev <state-dir>`:
const { startDevToolsServer } = await import("@openprose/reactor-devtools");
const { url } = await startDevToolsServer({ stateDir, port });
console.log(`reactor dev: ${url}`);
```

Keep it lazy so a keyless `reactor` install pulls no UI deps unless `dev` runs.

## Follow-ons (out of scope for the launch workflow)

- **S3 — live attach.** Attach to a running `reactor serve` (poll `GET /receipts`)
  or share a process with the mounted DAG and subscribe via the **deferred
  in-process `onReceipt` tap**, pushing receipts to the SPA over the `/events`
  SSE channel scaffolded here.
- **S5 — facet / diamond polish.** Per-facet lane bundling with selector-boundary
  highlighting, diamond single-wake convergent pulse, freshness-bridge
  (`valid_until` lapse → `self`-wake edge light).
