# @openprose/reactor-cli

The deterministic command-line driver for the [`@openprose/reactor`](https://www.npmjs.com/package/@openprose/reactor)
SDK. It **configures** the SDK — it never re-implements the reconciler and never
parses `.prose` itself. Compile freezes intelligence (model sessions) into
deterministic, content-addressed artifacts; run/serve execute those frozen
artifacts with a dumb reconciler.

```sh
npm install -g @openprose/reactor-cli
# or, per-project:
npm install --save-dev @openprose/reactor-cli @openprose/reactor @openai/agents zod
```

The command is `reactor`.

## Quickstart

```sh
reactor init my-project        # scaffold a gateway + responsibility + reactor.yml
cd my-project
reactor doctor                 # check node, SDK, key/deps, sandbox, state-dir, IR
reactor compile                # run the compile sessions -> content-addressed IR cache
reactor run                    # boot, drain to quiescence, print dispositions + cost
reactor serve --http 8080      # boot the durable host + continuity loop + HTTP surface
```

`compile`/`run`/`serve` reach the model surface and need a live key
(`OPENROUTER_API_KEY`) plus the optional peer deps (`@openai/agents`, `zod`).
Every other command — `doctor`, `init`, and all of the observability commands —
runs **fully offline**, with no key and with the model deps absent.

## The reference client: compile → run → serve

The CLI is the reference client for the SDK's three-phase lifecycle:

1. **`compile`** runs the *intelligent* compile sessions (Forme topology,
   per-node canonicalizer, postconditions) and freezes them into a
   **content-addressed IR cache** under `<state-dir>/compile/`. The cache KEY is
   `(contract-set fingerprint, SDK version, model id)` — **cost is never part of
   cache identity**. An unchanged contract set re-`compile`s at **zero session
   cost** (a cache hit); `--check` exits non-zero when the cache is stale (wire it
   into CI). The IR persists a *serializable spec*, so a fresh process re-lowers
   each node's canonicalizer with the keyless `compileNode(spec)` — **no model, no
   network** — to mount it.

2. **`run`** ensures the IR is fresh (compiles if stale), boots the reactor,
   drains to quiescence, prints per-node dispositions + cost, and exits. One-shot.

3. **`serve`** boots the *durable* host (filesystem receipts + world-models),
   runs the continuity driver loop, and exposes an HTTP surface. It stays up until
   `SIGINT`/`SIGTERM`, then drains in-flight work and exits.

### Cost scales with surprise

Every receipt carries a `surprise_cause`. A node that re-wakes but whose inputs
did not move **memo-skips** at zero render cost; a node renders (and spends
tokens) only when its `(contract_fp, input_fps)` memo key actually moves. So the
standing cost of a quiet system trends to zero, and a cost spike is always a real
change propagating — `reactor receipts cost` and `reactor status` roll cost up by
`surprise_cause` so you can see exactly *what surprised the system*.

## Configuration — `reactor.yml`

`reactor init` writes a fully-commented `reactor.yml`. The schema:

```yaml
state:
  dir: ./.reactor              # durable state (receipts, world-models, IR cache)

model:
  provider: openrouter
  render_model: google/gemini-3.5-flash
  compile_model: google/gemini-3.5-flash
  temperature: 0
  max_turns: 200

sandbox:
  mode: none                   # none (default) | docker
  shell_timeout_ms: 300000

gateways:                      # external-driven entry points
  - node: inbox
    source_id: inbox
    connector:
      type: static             # static | http | file (or a connectors.{cjs,js} plugin)
      id_field: id
      items: [{ id: item-1, body: "the first item" }]

reactors: []                   # optional: a multi-reactor host (see below)
```

Global flags `--state-dir`, `--project`, `--json`, `--offline` override the file
on every command.

### Sandbox

The `sandbox` block is the render **threat-model** knob:

- **`mode: none`** (the locked default) — renders run in the SDK's cwd-scoped,
  time/output-bounded shell (`shell_timeout_ms` tunes the bound; default 300 s).
  The trusted posture.
- **`mode: docker`** — each render command runs inside a throwaway, **network-
  disabled** container (`docker run --rm --network=none -v <ws>:<ws> -w <ws>
  <image> ...`), bind-mounting only the workspace. If Docker is **absent**, the
  run **degrades** to the bounded shell with a surfaced note (it never crashes).
  `reactor doctor` reports Docker availability when `mode: docker`.

## Connectors + gateways

A **gateway** is an external-driven entry point. A **connector** is three pieces:
`fetch` (source I/O) + `extract` (payload → arrivals keyed by `id_field`) +
`stage` (write the arrival into the gateway's truth *before* the wake). Built-ins
by `type`:

- **`static`** — a fixed `items` list (great for `init`/examples/tests).
- **`http`** — `GET <url>` (substitutes `{cursor}`), JSON array → arrivals.
- **`file`** — watch a `dir` of `.json` files.

A project may also ship a `connectors.cjs`/`connectors.js` plugin exporting
`{ connectors: { [source_id]: { fetch, extract? } } }`. Idempotency is durable: a
per-source cursor dedups arrivals, so a restart never re-ingests the backlog.

## Multi-reactor host + `--concurrency`

A `reactors:` list in `reactor.yml` hosts **N isolated reactors** (each its own
state-dir, substrate, schedule, cursors). The HTTP surface namespaces each under
`/<name>/...` (the prefix is omitted for a single-reactor host).

`--concurrency N` is an **across-reactor** worker-pool bound: independent reactors
render in parallel up to `N`. **Within** a single reactor, drains stay strictly
serial — at most one drain in flight per reactor, behind a per-reactor
serialization queue (the SDK's single-flight atomicity requires this).

> **Within-reactor parallelism is a future enhancement.** The current SDK has no
> `maxConcurrency` option, so `--concurrency` parallelizes *reactors*, not nodes
> within a reactor. See the Change-B deferral note in the implementation plan.

## Command reference

Run `reactor <command> --help` for the full options of any command.

| Command | Live? | What it does |
| --- | --- | --- |
| `reactor init [dir]` | offline | Scaffold a minimal project (gateway + responsibility + `reactor.yml` + `.gitignore`). |
| `reactor doctor [--live]` | offline (`--live` probes) | Report node/SDK/key/deps/offline/sandbox/state-dir/IR health. `--live` runs one smoke render. |
| `reactor compile [--force] [--check]` | live (cache hit/`--check` offline) | Run compile sessions → IR cache. `--check` exits non-zero when stale. |
| `reactor run` | live | Ensure IR fresh, boot, drain to quiescence, report + exit. |
| `reactor serve [--http <port>] [--concurrency <n>] [--poll-interval <ms>]` | live | Boot the durable host + continuity loop + HTTP surface. |
| `reactor trigger <node> [--data <json>|@file]` | live | Trigger a node with an external wake (one-shot mount, or POST to a daemon). |
| `reactor status` | offline | Standing compile cost beside live run cost + dispositions. |
| `reactor topology` | offline | Print the compiled DAG: nodes (+ wake source) and resolved edges. |
| `reactor inspect <node> [--strict]` | offline | A node's topology position, fingerprints, last receipt, chain. |
| `reactor logs [--node <node>]` | offline | The receipt stream (optionally filtered to one node). |
| `reactor trace [<node>]` | offline | Each node's receipt chain: wake → disposition. |
| `reactor receipts [list\|verify\|cost] [--node <node>]` | offline | Audit the receipt trail (`verify` is non-zero on a broken chain). |

### Documented exit codes

The CLI uses stable, documented exit codes so it composes in CI/scripts:

| Code | Meaning |
| --- | --- |
| `0` | Success / healthy. |
| `1` | A reported failure with an actionable message: stale cache (`compile --check`), a broken receipt chain (`receipts verify`, `inspect --strict`), no contracts found, a bad config, an unhealthy environment (`doctor`), a missing live key/dep (`--live`), or a connector/render error. |
| `2` | A usage error (unknown command/flag — emitted by the arg parser). |

Failure modes carry actionable messages, e.g. a missing live key → "set
`OPENROUTER_API_KEY`"; `mode: docker` with no daemon → "install/start Docker, or
renders fall back to the bounded shell"; a stale cache → "run `reactor compile`".

## Examples

The [`examples/`](./examples) directory runs end-to-end from a fresh checkout:

- [`examples/quickstart`](./examples/quickstart) — the scaffold `reactor init`
  produces: a gateway + a responsibility, compiled → run.
- [`examples/gateway-connector`](./examples/gateway-connector) — a gateway wired
  to a `static` connector, showing the fetch → extract → stage → wake ingress.

Each example's `README.md` lists the exact commands.

## Offline boundary

The default import surface and every model-free command are **keyless**: requiring
the CLI entrypoint loads neither `@openai/agents` nor `zod`. `compile`, `run`,
`serve`, `trigger`, and the connector/render paths reach the model surface only via
dynamic `import()` inside the handler — so `doctor`, `init`, and the whole
observability suite work with the model deps absent.
