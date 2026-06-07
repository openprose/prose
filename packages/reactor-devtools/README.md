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
reactor-devtools --example surprise-cost [--describe]   # bundled fixture, no path
reactor-devtools --example surprise-cost --copy-to ./.reactor [--force]  # seed it into your own dir
```

**No global install?** The `reactor-devtools` bin ships only in this package, so a
`cli`-only or SDK-only install does **not** put it on your `PATH` (`command not
found`). Run it without any global install via `npx`, which fetches this package
and runs its bin in one shot:

```bash
npx -p @openprose/reactor-devtools reactor-devtools --example surprise-cost --describe
npx -p @openprose/reactor-devtools reactor-devtools <state-dir>   # boot the viewer
```

(`-p @openprose/reactor-devtools` tells `npx` which package provides the
`reactor-devtools` bin; the trailing args are passed straight through.) A global
`npm i -g @openprose/reactor-devtools` then makes `reactor-devtools` available
directly; the future `reactor dev <state-dir>` CLI verb is the eventual no-extra-
install path once the `reactor` CLI wires it (see *Future `reactor dev` …* below).

**Boot the browser DAG viewer (the visual hero shot):** `reactor-devtools <state-dir>`
(or `reactor-devtools --example masked-relay`) with **no `--describe`** starts a small
local server and prints a **localhost URL** — open it for the animated, scrubbable DAG
(node flash on render, dim-pulse on memo-skip, per-facet edge lights, a live
fresh-vs-reused token meter). No model key, no build step.

**Machine-readable surface (CI / agents):** `reactor-devtools --describe --json` emits
the same run summary as a JSON object you can parse — see *Machine-readable output*
below. (`reactor receipts cost --json`, from the [`reactor` CLI](../reactor-cli), is
the other machine-readable cost surface.)

`--example <name>` replays a fixture **shipped inside this package** — it resolves
the bundled state-dir internally (relative to the installed package), so it works
after `npm i -g` (or `npx -p @openprose/reactor-devtools …`) from **any** directory
with **no path to compute**. The bundled set is the narrated headline corpus:
`masked-relay`, **`surprise-cost`** (the core *cost-scales-with-surprise* thesis),
`agent-observatory`, `inbox-triage`, `monorepo-ci`, and `research-tree` (see
*Fixture coverage* below). An unknown / un-bundled name lists the shipped ones and
**exits non-zero** — a typo never silently succeeds.

`--describe` prints a headless run summary (per-node + per-frame dispositions,
moved-facet diff, cost rollup split by **surprise-cause** — `wake-cause` is the old
synonym — and a chain-verify line) and exits without a browser -- the text an agent
reads to sanity-check a run. Add `--json` (`--describe --json`) to emit the **same
data** as a machine-readable JSON object instead of text (see *Machine-readable
output* below). `--version`/`-V` prints the version, `--help`/`-h` the usage.

`--copy-to <dir>` (only with `--example`) copies the bundled sample fixture
(`receipts.json` + `compile/` + `world-models/`) into `<dir>`, so you can replay a
real-shaped ledger sitting in your **own** project keyless:

```bash
reactor-devtools --example masked-relay --copy-to ./.reactor
reactor-devtools ./.reactor --describe        # replay a ledger in YOUR tree
```

It refuses a non-empty / already-a-state-dir `<dir>` unless you pass `--force`,
and the confirmation is explicit that this is the **sample** ledger, not your own
computed run — your real receipts come from `reactor serve`/`run` with a model key.

A `<state-dir>` you pass by path must **exist** and look like a reactor state-dir
(a `receipts.json` or a `compile/` directory inside it). A non-existent path or a
non-state-dir errors non-zero (`state-dir not found` / `not a reactor state-dir`)
rather than silently rendering an empty ledger — so a wrong cwd after a global
install never masquerades as `LEDGER EMPTY`. `LEDGER EMPTY` (exit 0) is reserved
for a real, existing, compiled-but-unrun dir.

A **replayable state dir** = a flat `receipts.json` (the durable trail) + `compile/topology.json`
+ `world-models/`. Replay needs **zero** running reactor and **zero** model key.
If `compile/topology.json` is absent, the viewer falls back to a node-only set
derived from the receipts' distinct `node` values (no edges).

`compile/topology.json` is read tolerantly: both the flat `TopologyWorldModel`
shape (`{ nodes, edges, entry_points, acyclic }`) **and** the nested envelope
`reactor compile` writes (`{ contract_fingerprints, topology: { … } }`) work — so
`reactor-devtools <state-dir>` opens a CLI-produced state-dir directly, with no
path or schema translation.

### Get a replayable ledger

You don't need a model key or a running reactor to see the payoff. Three ways,
fastest first:

1. **Replay a bundled fixture (ships in the tarball) — no path to compute.**
   A handful of small, deterministic sample ledgers are committed to the package
   and included in the npm `files`, so they are present after a tarball install.
   Use `--example` and the package resolves them internally:

   ```bash
   reactor-devtools --example surprise-cost --describe  # the thesis fixture, any cwd
   reactor-devtools --example masked-relay --describe   # works from any cwd
   # (in this repo you can also point at the path directly:)
   reactor-devtools packages/reactor-devtools/fixtures/surprise-cost --describe
   ```

   Bundled names: `masked-relay`, `surprise-cost`, `agent-observatory`,
   `inbox-triage`, `monorepo-ci`, `research-tree`.

   When you replay a shipped sample (via `--example`), `--describe` prints a
   `(synthetic sample ledger — token counts are illustrative, not a bill)` banner,
   since the token figures in a fixture are scripted, not a real spend.

2. **Generate a fixture from source (repo checkout).** The generator lives at
   `dist/fixtures/generate.js`. Its argument is the fixture *key*, which differs
   from the on-disk directory name for the observatory — the key is
   **`observatory`** (the directory it writes is `fixtures/agent-observatory`):

   ```bash
   pnpm build
   node dist/fixtures/generate.js                       # regenerate ALL committed fixtures
   node dist/fixtures/generate.js masked-relay           # just masked-relay
   node dist/fixtures/generate.js observatory            # the agent-observatory (key = "observatory")
   node dist/fixtures/generate.js observatory /tmp/obs   # …into a custom dir
   ```

   Valid keys: `masked-relay`, `observatory`, `monorepo-ci`, `news-desk`,
   `inbox-triage`, `contract-redline`, `research-tree`.

3. **Replay your own run.** After `reactor compile` + `reactor run`, point the
   viewer at the run's state-dir: `reactor-devtools <state-dir>`.

#### Fixture coverage (what ships vs. what you generate)

**The bundled headline corpus ships in the npm tarball:** `masked-relay`,
`surprise-cost`, `agent-observatory`, `inbox-triage`, `monorepo-ci`, and
`research-tree` are each listed in the package's `files`, so they are present after
an `npm i -g` install and reachable by name from any cwd
(`reactor-devtools --example <name>` — no path). `surprise-cost` is the core
*cost-scales-with-surprise* thesis fixture. Every other named fixture
(`contract-redline`, `news-desk`, `tamper-forge`) is **repo-only**: it does not
ship in the tarball and must be generated / replayed locally from a checkout (see
step 2). An unknown / un-bundled `--example` name lists the bundled ones and exits
non-zero.

> **What `masked-relay` is, in plain terms:** a small content-pipeline scenario —
> an upstream source feeds a *masker* that redacts sensitive spans, *expander*
> nodes that enrich the surviving items, and a downstream *synthesizer* that writes
> the digest. It stands in for any "watch a feed, do expensive model work only on
> the items that actually moved, re-use the rest" demo (e.g. renewal-risk briefs,
> incident summaries, an audit digest). The node names are abstract; the *shape* is
> the post's "cost scales with surprise" story.

The remaining named fixtures (`news-desk`, `contract-redline`) are **repo-only**:
they do not ship in the tarball and must be generated locally from a checkout with
`node dist/fixtures/generate.js <key>` (see step 2). So `--example` accepts the
bundled headline corpus above; `news-desk` / `contract-redline` are a build step
away.

> **Empty (compile-only) ledger?** A state-dir that was compiled but not yet run
> has `receipts.json = []`. `--describe` treats that as a legitimate first-run
> state: it prints a short "no receipts yet" guidance and **exits 0** (it is not
> an error). A genuinely corrupt/unreadable trail exits non-zero, and a detected
> ledger tamper (a broken chain) prints `CHAIN-VERIFY FAILED` and **exits 1**.

### Machine-readable output (`--describe --json`)

`--describe` is human text; for a CI step or an agent, add `--json`:

```bash
reactor-devtools --example masked-relay --describe --json
```

It emits the **same data** the text shows as one JSON object — parse this instead
of scraping the report. Shape (top-level keys):

```jsonc
{
  "tool": "reactor-devtools",
  "stateDir": "…",
  "empty": false,                 // true on a compile-only / first-run ledger
  "synthetic": true,              // true for any shipped --example fixture
  "topology": { "present": true, "nodes": 6, "edges": 7, "acyclic": true },
  "receipts": 84,
  "dispositions": { "rendered": 41, "skipped": 31, "failed": 12 },
  "bySurpriseCause": { "input": 30, "self": 8, "external": 3 },  // frame counts
  "costRollup": {                 // the SDK's cost rollup, surfaced verbatim
    "bySurpriseCause": {
      "input":    { "receipts": 30, "fresh": 5400, "reused": 1200, "dollars": 0 },
      "self":     { "receipts": 8,  "fresh": 320,  "reused": 60,   "dollars": 0 },
      "external": { "receipts": 3,  "fresh": 180,  "reused": 0,    "dollars": 0 }
    },
    "total":      { "receipts": 41, "fresh": 5900, "reused": 1260, "dollars": 0 }
  },
  "nodes":  [ /* per-node: rendered/skipped/failed, fresh tokens, chainOk */ ],
  "frames": [ /* per-frame: node, status, wakeSource, movedFacets, fresh, … */ ],
  "chainVerify": { "ok": true, "errors": [] }  // ok:false + errors on a tamper
}
```

_(Numbers above are an illustrative shape — not masked-relay's actual counts.)_

Exit codes are **unchanged** from text mode: a clean or empty ledger exits `0`; a
detected tamper (`chainVerify.ok === false`) exits `1`. (Token figures are
illustrative for a shipped `--example` sample; `synthetic` flags that.)

`reactor-devtools --describe --json` is the cost surface **for a saved replay
ledger**; the [`reactor` CLI](../reactor-cli)'s `reactor receipts cost --json` is
the equivalent machine-readable cost surface driven from the CLI.

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
| Re-derive the ledger (= replay) | `createFileSystemReceiptLedger({ storage })` (`@openprose/reactor`) |
| Order + chain index + moved-facet diff + cost rollup | `createReplaySession({ ledger })` (`@openprose/reactor`) |
| Topology graph | `<state-dir>/compile/topology.json` (`TopologyWorldModel`) — `MountedDag` has no `.topology` in replay |
| Chain / tamper badge | `verifyReceiptChain` / `verifyReceipt` (`@openprose/reactor`), run over the **raw on-disk receipts** (original `content_hash`), so an edited field is caught — the re-stamped replay ledger would heal it. It verifies **meaning-layer chain-consistency** (each receipt's `content_hash` matches its canonical payload and links its `prev`), **not** a cryptographic signature: tamper-evident against accidental / independent edits, **not** against a forge that re-stamps the whole trail with the public `computeReceiptContentHash` (v1 has a null signer; the cryptographic byte-hash signer that closes this is **targeted for 2026 H2**, tracked as `C3`). Meaning-layer tamper-evidence, not byte-level non-repudiation. |
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
