# Reactor CLI telemetry

`@openprose/reactor-cli` collects **anonymous, opt-out, content-free** usage
telemetry so we can see how many people use Reactor and for what. This document is
the published, exact schema: every event, every property, every way to turn it
off, and a transparency note on what we deliberately never collect.

The short version:

- **Anonymous.** The only identifier is a random per-machine UUID. No account, no
  user, no email, no IP-derived geo.
- **CLI-only.** Telemetry lives entirely in `@openprose/reactor-cli`. The SDK,
  `@openprose/reactor`, emits **zero** network traffic — a library that phones home
  from inside someone else's stack is a trust violation, so it never does.
- **Content-free.** We collect the *shape* of usage, never the *content*. No prose,
  markdown, prompt text, file paths, project or directory names, facet or node
  names, API keys, model input/output, or precise geo — ever. See
  [What we never collect](#what-we-never-collect).
- **Opt-out, honored permanently.** `DO_NOT_TRACK=1`, `REACTOR_TELEMETRY=0`, or
  `reactor telemetry disable` each turn it off for good. It is **off by default in
  CI and any non-interactive (non-TTY) run.**
- **Fire-and-forget.** A short, bounded `fetch` POST that never blocks, slows, or
  errors a command — even if the endpoint is slow or down.
- **Inspectable.** `reactor telemetry --dump` prints the exact JSON that would be
  sent.

## What is sent (the wire shape)

Telemetry is a Segment-style `track` batch POSTed to the analytics endpoint:

```
POST <endpoint>
content-type: application/json

{
  "batch": [
    {
      "type": "track",
      "anonymousId": "<random per-machine UUID>",
      "event": "reactor.<name>",
      "properties": { /* all Reactor data lives here — see below */ },
      "context": { "library": "@openprose/reactor-cli" },
      "timestamp": "2026-06-02T18:00:00.000Z"
    }
  ]
}
```

A batch carries 1–100 events. Each event's `timestamp` is an ISO-8601 string
stamped when the event is enqueued.

> **`context` is a closed whitelist.** The server validates `context` and rejects
> any key other than `utm`, `page`, `device`, `ip`, `library`. Reactor sends
> **only** `context.library = "@openprose/reactor-cli"`. **All** Reactor-specific
> data rides in the free-form `properties` object — never in `context`.

### `anonymousId`

A random `crypto.randomUUID()` minted once per machine and stored in
`~/.reactor/config.json` as `installId`. It correlates one machine's events
without identifying a user, project, or path. It is not derived from anything —
not the hostname, not the MAC, not the home directory.

## Events

Every event name is prefixed `reactor.`.

| Event | Fired from | When |
| --- | --- | --- |
| `reactor.first_run` | `doctor` | Once per machine, alongside the first-run disclosure. |
| `reactor.compile` | `compile` | After a compile (success / cache hit / failure). |
| `reactor.run` | `run` | After a run completes. |
| `reactor.serve` | `serve` | At boot, and once on the first poll cycle (sampled). |
| `reactor.trigger` | `trigger` | After a trigger completes. |
| `reactor.init` | `init` | After scaffolding a project. |
| `reactor.doctor` | `doctor` | After the health check. |
| `reactor.observe` | `status`, `topology`, `inspect`, `logs`, `trace`, `receipts` | After a read-only observability command (collapsed; carries a `sub`). |
| `reactor.error` | any of the above | Alongside a failing command, carrying a coarse error category only. |

### Shared properties (on every event)

| Property | Type | Example | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | number | `1` | Property-schema version; bumped only on a breaking shape change. |
| `cliVersion` | string | `"0.2.0"` | `@openprose/reactor-cli` version. |
| `reactorVersion` | string | `"0.2.0"` \| `"unknown"` | Resolved `@openprose/reactor` SDK version. |
| `nodeVersion` | string | `"v20.11.0"` | `process.version`. |
| `os` | string | `"darwin"` | `process.platform` — a coarse OS family, never a hostname. |
| `arch` | string | `"arm64"` | `process.arch`. |
| `ci` | boolean | `false` | Coarse CI/automation detection. |
| `command` | string | `"run"` | The command name — never an argument value. |
| `outcome` | enum | `"success"` | One of `success` \| `failure` \| `cache_hit`. |
| `durationBucket` | enum | `"1-5s"` | Bucketed wall-clock duration (see [buckets](#buckets)). |

### Per-event extra properties

All extras are **bucketed or categorical**. Raw counts, durations, names, paths,
messages, and provider keys never appear.

#### `reactor.compile`, `reactor.run`, `reactor.trigger` (graph shape)

| Property | Type | Example | Notes |
| --- | --- | --- | --- |
| `nodesBucket` | enum | `"6-20"` | Bucketed node count. |
| `edgesBucket` | enum | `"1-5"` | Bucketed edge count. |
| `cost.freshBucket` | enum | `"1-5"` | Bucketed fresh-cost token total. |
| `cost.reusedBucket` | enum | `"21+"` | Bucketed reused-cost token total. |
| `providerClass` | string | `"anthropic"` | Coarse provider **class**, never a key/URL/model id (see [provider class](#provider-class)). |
| `dispositions` | object | `{ "rendered": "1-5", "skipped": "21+" }` | Bucketed counts keyed by disposition kind (`rendered` \| `skipped` \| `failed` \| `coalesced`) — never node identities. Present on `run`. |

#### `reactor.observe`

| Property | Type | Example | Notes |
| --- | --- | --- | --- |
| `sub` | enum | `"status"` | Which read-only command ran: `status` \| `topology` \| `inspect` \| `logs` \| `trace` \| `receipts`. |

#### `reactor.serve`

| Property | Type | Example | Notes |
| --- | --- | --- | --- |
| `pollIntervalBucket` | enum | `"30s+"` | Bucketed poll cadence. |
| `concurrencyBucket` | enum | `"1-5"` | Bucketed worker-pool bound. |

A long-running daemon fires `reactor.serve` once at boot and once on the **first**
poll cycle (sampled), so it can never flood the backend.

#### `reactor.error`

| Property | Type | Example | Notes |
| --- | --- | --- | --- |
| `errorCategory` | enum | `"provider"` | Coarse category only: `provider` \| `config` \| `io` \| `chain_verify` \| `unknown`. **Never** the message, stack, or any operand. |

### Buckets

Raw counts and durations are weakly identifying side channels, so they are never
emitted raw — they pass through a bucketer first.

| Bucketer | Bands |
| --- | --- |
| Count (`nodesBucket`, `edgesBucket`, cost, dispositions, `concurrencyBucket`) | `0`, `1-5`, `6-20`, `21+` |
| Duration (`durationBucket`, `pollIntervalBucket`) | `<1s`, `1-5s`, `5-30s`, `30s+` |

### Provider class

A free-form provider/adapter identifier is collapsed to a fixed **class** label —
never a key, token, base URL, or model id. Recognized classes: `openrouter`,
`openai`, `anthropic`, `google`, `azure`, `bedrock`, `local`. Anything
unrecognized collapses to `other`; an absent provider is `none`.

## Turning it off (the full opt-out matrix)

Telemetry is **disabled** if **any** of the following hold. Each is permanent on
its own; you do not need to combine them.

| # | Condition | How |
| --- | --- | --- |
| 1 | `DO_NOT_TRACK` is truthy | `export DO_NOT_TRACK=1` (the [consoledonottrack.com](https://consoledonottrack.com) convention). Any value that is not unset / empty / `0` / `false`. |
| 2 | Reactor env opt-out | `export REACTOR_TELEMETRY=0`, or set `REACTOR_TELEMETRY_DISABLED` to anything. |
| 3 | Offline mode | `REACTOR_OFFLINE=1` (offline implies zero egress). |
| 4 | CI | `CI` is truthy, or a known CI marker is set (`GITHUB_ACTIONS`, `GITLAB_CI`, `CIRCLECI`, `BUILDKITE`, `TF_BUILD`, `JENKINS_URL`, `TEAMCITY_VERSION`). |
| 5 | Non-interactive | stdout is **not a TTY** (piped/redirected/automated runs are not tracked). |
| 6 | Project config | `reactor.yml` → `telemetry.enabled: false`. |
| 7 | Machine config | `~/.reactor/config.json` → `telemetryEnabled: false` (written by `reactor telemetry disable`). |

If none of the above hold, telemetry is **enabled** by default — but the
disclosure (below) always runs first.

### First-run disclosure

The first time you run `reactor doctor` on a machine, a short notice prints to
**stdout** — what is collected, that it is anonymous, the one-liner to turn it
off, and a pointer to this file. It shows once per machine (tracked by
`noticeShownVersion` in `~/.reactor/config.json`) and may re-show on a notable
version upgrade. There is no banner at CLI entry and nothing on stderr.

## The `reactor telemetry` command

```sh
reactor telemetry [status|enable|disable] [--dump] [--json]
```

| Invocation | Effect |
| --- | --- |
| `reactor telemetry` / `reactor telemetry status` | Reports whether telemetry is currently enabled, the gate reason when disabled, the resolved endpoint, and the anonymous install id (creating no state). |
| `reactor telemetry enable` | Clears the machine-level opt-out (`telemetryEnabled: true`). Still honors `DO_NOT_TRACK` / `REACTOR_TELEMETRY=0` / CI / non-TTY / project config. |
| `reactor telemetry disable` | Writes `telemetryEnabled: false` to `~/.reactor/config.json` — permanent, machine-level. |
| `reactor telemetry --dump` | Prints the **exact** JSON (endpoint + Segment batch) that a representative event would send, then exits. It only prints — it never opens a socket. |

`--json` makes `status`, `enable`, and `disable` emit machine-readable output.

### `--dump` example

```sh
$ reactor telemetry --dump
{
  "endpoint": "https://api.openprose.ai/analytics",
  "batch": [
    {
      "type": "track",
      "anonymousId": "3f8c1e0a-...",
      "event": "reactor.doctor",
      "properties": {
        "schemaVersion": 1,
        "cliVersion": "0.2.0",
        "reactorVersion": "0.2.0",
        "nodeVersion": "v20.11.0",
        "os": "darwin",
        "arch": "arm64",
        "ci": false,
        "command": "doctor",
        "outcome": "success",
        "durationBucket": "<1s"
      },
      "context": { "library": "@openprose/reactor-cli" },
      "timestamp": "2026-06-02T18:00:00.000Z"
    }
  ]
}
```

## Endpoints

| Build | Endpoint |
| --- | --- |
| npm-published (default) | `https://api.openprose.ai/analytics` (PROD) |
| Local / dev | `https://api.dev.openprose.ai/analytics` (DEV) |

The published default is **PROD**. Local and dev runs reach DEV because the
monorepo's dev/test tooling exports `REACTOR_TELEMETRY_ENDPOINT`. Self-hosters can
override the endpoint two ways (the project setting wins):

```sh
export REACTOR_TELEMETRY_ENDPOINT=https://analytics.example.com/analytics
```

```yaml
# reactor.yml
telemetry:
  endpoint: https://analytics.example.com/analytics
```

## Transport guarantees

- A bespoke `fetch` client — **zero new runtime dependencies** (Node ≥ 20 ships a
  global `fetch`).
- `event()` only enqueues; it never blocks and never throws.
- `flush()` POSTs under a hard `AbortSignal.timeout(~2000ms)` and swallows every
  transport error, so a slow or unreachable endpoint can never delay, reject, or
  perturb the CLI. The exit path also bounds the flush with its own ceiling.
- When telemetry is disabled, the sink is a true no-op: no install id is created,
  no endpoint is resolved, and no network is touched.

## What we never collect

The trust invariant: we emit the *shape* of usage, never the *content*. The
following are **forbidden in every field, with no exceptions**:

- World-model content, the markdown, prompt text, or any model input/output
- File paths, project or directory names
- Exact facet or node names
- API keys, tokens, base URLs, or model ids (only a coarse provider **class**)
- Error messages or stacks (only a coarse error **category**)
- Raw counts or durations (only buckets)
- IP-derived or precise geo

Bucketers, the provider-class map, and the fixed error-category vocabulary exist
precisely so a caller can never accidentally smuggle a raw value through.

## For analysts: isolating this event class

Reactor CLI telemetry is uniquely identified two ways (belt and braces): the
indexed event-name prefix, plus the whitelisted `library` discriminator.

```sql
SELECT *
FROM analytics_events
WHERE event_name LIKE 'reactor.%'                       -- indexed; primary filter
  AND context->>'library' = '@openprose/reactor-cli';   -- belt + braces
```

The collection code is open source in this package under `src/telemetry/`.
