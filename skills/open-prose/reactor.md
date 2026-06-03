# Reactor CLI

The **Reactor harness** is the deterministic runtime that *serves* OpenProse
responsibilities over time. This doc is loaded when the user types
`prose react …`, or when they want to stand up / run a Reactor for a standing
goal. It teaches the `reactor` binary, the `reactor.yml` it needs, and the
`prose react` playbook.

Read the authoring rules in `concepts/responsibility.md`, `concepts/reactor.md`,
`responsibility-runtime.md`, and `contract-markdown.md` for *what to write*; this
doc covers *how to install, configure, run, and inspect* the harness that runs it.

## The one thing that is different from `prose run`

Everywhere else, the rule is: **embody the OpenProse VM yourself; never shell out
to a `prose` binary** (a `prose run` inside a wrapper host would recursively call
the wrapper). The `reactor` binary is the **deliberate exception**:

> `reactor` is a genuine, deterministic host — a dumb reconciler that compares
> fingerprints and schedules bounded renders. It never calls an agent wrapper.
> So you **do** shell out to it. You author the `*.prose.md` contracts (the
> intelligence); the `reactor` binary runs the reconciler (the determinism).

This is the compile/run split made literal: the model authors, deterministic code
runs. `prose react` is the agent-session command that produces a real, runnable
Reactor project and then drives — or hands the user — the `reactor` binary.

## Packages (live on npm)

| Package | Binary | Role |
|---------|--------|------|
| `@openprose/reactor` | — | Headless reconciler SDK (the engine; a peer dep of the CLI) |
| `@openprose/reactor-cli` | `reactor` | The deterministic host/driver |
| `@openprose/reactor-devtools` | `reactor-devtools` | Keyless offline receipt-ledger replay |

Install globally (SDK + CLI + devtools, plus the two live-render peers):

```sh
npm i -g @openprose/reactor @openprose/reactor-cli @openprose/reactor-devtools
npm i -g @openai/agents zod          # peers needed only by the live render
```

Requires **Node ≥20**. Global `-g` can collide with other tools' binaries and is
`EACCES`-prone on Linux/WSL — if the global install fails, fall back to a user
prefix / nvm (`npm config set prefix ~/.npm-global`) or a project-local install
called through `npx reactor …`. `reactor --version` prints the CLI version, not
the SDK version — that is expected, not a mismatch.

## Keyless vs. live

The boundary is load-bearing — most of the harness is usable with **no key**:

| Need a model key (`OPENROUTER_API_KEY` + `@openai/agents` + `zod`) | Keyless / offline |
|---|---|
| `compile`, `run`, `serve`, `trigger` | `init`, `doctor`, `compile --check`, `status`, `topology`, `inspect`, `logs`, `trace`, `receipts`, and the whole `reactor-devtools` replay |

So the agent can scaffold, validate, and inspect a project with zero spend; only
freezing the IR (`compile`) and running renders (`run`/`serve`) cost tokens.

## The lifecycle: `compile → run → serve`

- **`compile`** runs the *intelligent* compile sessions (Forme topology, per-node
  canonicalizer, postconditions) and freezes them into a content-addressed IR
  cache under `<state-dir>/compile/`. The cache key is `(contract-set fingerprint,
  SDK version, model id)` — cost is never part of cache identity, so an unchanged
  contract set re-compiles at zero session cost. `compile --check` exits non-zero
  on a stale cache (CI-wireable, keyless).
- **`run`** ensures the IR is fresh, boots the reactor, drains to quiescence,
  prints per-node dispositions + cost, and exits. One-shot. (Best for graphs whose
  connectors emit on their own; a `static` gateway is driven by `serve`.)
- **`serve`** boots the durable host (filesystem receipts + world-models), runs
  the continuity driver loop, and exposes an HTTP surface. Stays up until
  `SIGINT`/`SIGTERM`, then drains in-flight work.

## The `prose react "<use case>"` playbook

A single command from an English use case to a running, inspectable Reactor.
**Default behavior prints the commands for the user to run.** With a **`--start`**
flag, the agent drives the live lifecycle itself (it's deterministic and safe).
The keyless steps (`doctor`, `compile --check`, the observability commands,
devtools `--describe`) the agent may always run directly to validate its output.

1. **Recognize & scope.** Confirm the use case is a *state to maintain* (good
   Reactor fit), not a one-shot. If it's a one-shot deliverable or pure batch
   transform, decline and suggest `prose run` or a plain prompt. Restate the
   maintained truth in one sentence — that sentence becomes the `### Goal`.

2. **Pick a home.** Poke around the likely OpenProse roots first to reuse an
   existing pattern (see *Placement* below). If you find an existing
   `*.prose.md` + `reactor.yml` project, specialize within it. If not, ask the
   user — concisely and colloquially — where it should live, leaning on what the
   surrounding directories reveal.

3. **Ensure the harness.** Global-install the packages (above) and run
   `reactor doctor` (keyless) to verify node / SDK / key / deps / state-dir / IR.

4. **Author the contracts.** Per `concepts/responsibility.md` +
   `contract-markdown.md`: a `kind: responsibility` with a faceted `### Maintains`
   (material/immaterial split), `### Goal`, `### Requires`, `### Continuity`,
   `### Invariants`; a `kind: gateway` for ingress; optional `kind: function`
   helpers for expensive sub-steps. Apply the anti-pattern checklist: no
   "loop until done", no volatile fields in `### Maintains`, declare `valid_until`
   in `### Continuity`, facet the truth so an unrelated change wakes nobody.

5. **Author `reactor.yml`.** State dir, model block, sandbox, and the gateway
   connector (see *Configuration* below). **Ask the user for provider/model** here
   rather than silently defaulting (suggest OpenRouter; note the caveat).

6. **Compile.** Always run `reactor compile --check` (keyless) to validate. The
   live `reactor compile` (freezes the IR) runs **only under `--start`**;
   otherwise print the command.

7. **Serve & show.** `reactor serve --http <port>` (durable) or `reactor run`
   (one-shot); drive the gateway via seeded `static` items or
   `POST /trigger/<node>`. Then surface `reactor topology` + `reactor status` +
   `reactor receipts cost`, and `reactor-devtools <state-dir>` (keyless replay) so
   the user *sees* cost scaling with surprise. End with the handful of commands
   they'll re-run. Under `--start`, run the keyless inspection and show the real
   output; otherwise print the commands.

### Placement (where the project lives)

Reuse the skill's OpenProse Root scopes — scan them in order for an existing
`*.prose.md` + `reactor.yml` before asking:

| Scope | Root | Colloquial framing for the prompt |
|-------|------|-----------------------------------|
| Native repository | repository root | "a new prose-native repo (its own dir)" |
| Attached repository | `repo/.agents/prose` | "inside this repo (`.agents/prose`)" |
| User-global | `~/.agents/prose` | "globally, for any project (`~/.agents/prose`)" |

If a project already exists in one of these, specialize it. If none does, ask
once, concisely, offering those three — and let the surrounding directories bias
your recommendation (e.g. inside a git repo → lean "inside this repo").

## Configuration — `reactor.yml`

`reactor init [dir]` writes a fully-commented `reactor.yml`. The schema:

```yaml
state:
  dir: ./.reactor              # durable state (receipts, world-models, IR cache)

model:
  provider: openrouter         # ask the user — see note below
  render_model: google/gemini-3.5-flash
  compile_model: google/gemini-3.5-flash
  temperature: 0
  max_turns: 200

sandbox:
  mode: none                   # none (default, bounded shell) | docker (network-disabled container)
  shell_timeout_ms: 300000

gateways:                      # external-driven entry points
  - node: inbox                # must match a kind: gateway contract's name
    source_id: inbox
    connector:
      type: static             # static | http | file (or a connectors.{cjs,js} plugin)
      id_field: id
      items: [{ id: item-1, body: "the first item" }]

reactors: []                   # optional: a multi-reactor host
```

Global flags `--state-dir`, `--project`, `--json`, `--offline` override the file
on every command.

**Provider/model — ask, don't assume.** The scaffold default is OpenRouter +
`google/gemini-3.5-flash`. When generating `reactor.yml`, ask the user which
provider/model to use; suggest **OpenRouter** as the safe default and note that
Anthropic's direct endpoints have rejected the agents-SDK structured-output shape
that compile/render relies on — so OpenRouter (or OpenAI direct) is the reliable
substrate today.

### Connectors + gateways

A **gateway** is an external-driven entry point; a **connector** is `fetch`
(source I/O) + `extract` (payload → arrivals keyed by `id_field`) + `stage`
(write the arrival into the gateway's truth before the wake). Built-ins:

- **`static`** — a fixed `items` list. Best for `init` / demos / tests; drive it
  with `serve` (it ingests the seeded items), not `run`.
- **`http`** — `GET <url>` (substitutes `{cursor}`); a JSON array becomes arrivals.
- **`file`** — watch a `dir` of `.json` files.

A project may also ship a `connectors.cjs`/`connectors.js` plugin exporting
`{ connectors: { [source_id]: { fetch, extract? } } }`. Idempotency is durable: a
per-source cursor dedups arrivals, so a restart never re-ingests the backlog.

### Sandbox

`sandbox.mode: none` (default) runs renders in the SDK's cwd-scoped,
time-bounded shell (`shell_timeout_ms`, default 300 s). `mode: docker` runs each
render command in a throwaway, `--network=none` container bind-mounting only the
workspace; if Docker is absent it degrades to the bounded shell with a surfaced
note (never crashes). `reactor doctor` reports Docker availability under
`mode: docker`.

## Driving & inspecting

`reactor serve --http <port>` exposes (binds `127.0.0.1` by default):

| Route | Returns |
|-------|---------|
| `GET /health` | Liveness — `200 {"status":"ok"}` once up |
| `GET /status` | Standing compile cost + live run cost + per-node dispositions |
| `GET /cost` | Cost rollup by `surprise_cause` |
| `POST /trigger/<node>` | Wake `<node>` with an optional JSON body as an external arrival; returns the disposition |

> **⚠ No auth in v1.** `POST /trigger/<node>` is unauthenticated and can cause
> model spend. The default `127.0.0.1` bind is loopback-only; expose it
> (`--host 0.0.0.0`) only behind a proxy that adds auth + rate-limiting. Treat
> the bare HTTP surface as a single-operator, trusted-network interface.

`serve` flags: `--poll-interval <ms>` (continuity cadence ceiling, default
60000), `--concurrency <n>` (across-reactor pool; within-reactor drains stay
serial), `--http <port>`, `--host <addr>`.

Keyless observability commands (read-only over the state-dir):

| Command | Shows |
|---------|-------|
| `reactor topology` | The DAG Forme wired from the contracts |
| `reactor status` | Standing + run cost and per-node dispositions |
| `reactor inspect <node>` | One node's world-model + latest receipt |
| `reactor trace [node]` | The receipt trail (per node, or all) |
| `reactor logs` | Run logs |
| `reactor receipts [list\|verify\|cost]` | List / chain-verify / cost-by-surprise the ledger |
| `reactor-devtools <state-dir>` | Browser replay viewer; `--describe` for a headless text summary |

The keyless replay is the payoff to show the user: it renders dispositions and
**cost-by-surprise** from the receipt ledger with no key and no model call.

## When NOT to reach for a Reactor

Steer away (suggest `prose run` or a plain prompt) when the goal is a one-shot
deliverable, a pure batch transform, a low-stakes throwaway, a deterministic job
needing no judgment, or any workflow where durable receipts and standing state
add more friction than value. Reactor earns its keep when there is a **state to
maintain**, events arrive over time, freshness/cost/risk gate whether to act, and
an audit trail matters.
