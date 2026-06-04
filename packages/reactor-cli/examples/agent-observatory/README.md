# agent-observatory example

Claude Code conversations piped into domain world-state. This is the Observatory
expanded into a **cost-tiered pipeline**: a cheap classifier turns each changed
session into small per-domain *signals*, four first-class domain truths each
subscribe to the one signal they care about, and the dashboard is one late
artifact that composes them. See `PIPELINE-DESIGN.md` for the why.

```
claude-sessions (gateway, your machine)     ~free: fold changed-file deltas
        |
   session-signal  (cheap classifier: reads ONLY the inline tail)
        |  emits per-domain facets:
        ├─ #decision-signal ─► decisions-log
        ├─ #bug-signal ──────► eng-backlog
        ├─ #use-case-signal ─► use-case-guide
        └─ #attention-signal ► attention-queue
                                   |
                               dashboard  (one Markdown index, coalesced)
```

The point is cost control by design: each domain subscribes to its **own** signal
facet, so a pure decision chat moves `#decision-signal` only — decisions-log and
attention-queue render, eng-backlog and use-case-guide **memo-skip at zero cost**.
A bug-repro chat is the mirror. Most agent sessions carry no new signal at all and
cost nothing past the cheap classify. The dashboard renders once per burst.

Cost levers (all in the contracts): granular per-domain facets; stable
materiality (volatile fields dropped, so an unchanged session never propagates);
`### Continuity` declares the wake source semantically (no hand-coded cron); and
each render's `### Invariants` lock it to its inline input (never scan the
filesystem) so a render is a small bounded transform, not an open-ended agent
loop. One cheap global model is adequate because every render is small; true
per-node model tiering (a Haiku for the classifier) is tracked as `RB-NodeModel`.

## Inspect (keyless, read-only)

These read what is already on disk and need no model key: `doctor`,
`compile --check`, `status`, `topology`, `receipts list|cost`, `inspect`, `logs`.

Actually running the reactor (the compile sessions and the renders) needs a model
key. `REACTOR_OFFLINE=1` forces the provider closed; it is **not** a keyless run
at the CLI — `reactor run --offline` just writes a `failed` receipt, because the
hermetic fake render is a programmatic SDK test seam, not a CLI mode. So compile
and run/serve with a real key; the read-only commands above stay keyless.

## Run it (needs OPENROUTER_API_KEY)

Feed the gateway one of two ways: the built-in `static` connector (fixture
session deltas, no network — a deterministic demo) or `connectors.cjs` (a real
scan of `~/.claude/projects`). `serve` polls the connector and stages arrivals; a
one-shot `run` only drains what is already staged, so use `serve` (or `trigger`)
to bring the sessions in.

```sh
export OPENROUTER_API_KEY=sk-or-...
CLI="node /Users/sl/code/openprose/platform/external/prose/packages/reactor-cli/dist/cli.js"

$CLI compile --project .            # compile the topology + canonicalizers to the IR cache
$CLI topology --project .           # claude-sessions -> session-signal -> 4 truths -> dashboard
$CLI serve --project .              # polls the static connector, stages the fixtures,
                                    # classifies + renders each touched domain; ctrl-c once quiescent

# inspect what happened:
$CLI status --project .             # dispositions + cost
$CLI receipts list --project .      # which domains rendered vs memo-skipped
$CLI receipts cost --project .      # cost rolled up by surprise cause
```

### Scan your real sessions

The real scanner ships as `connectors.cjs.example` (opt-in, so the static
fixtures are the default deterministic demo). To enable it:

```sh
cp connectors.cjs.example connectors.cjs   # keyed `claude`, matching source_id
```

It scans `~/.claude/projects/**/*.jsonl`, fingerprints each by `mtime:size`, and
emits only changed sessions with a short tail snippet — never full transcripts. A
present `connectors.cjs` takes precedence over the static connector. Point `serve`
at it the same way; each changed session wakes only the domains it touches. (Note:
a full real scan is unbounded — it sees every project — so prefer the fixtures or
a capped scan for a cheap run.)

The dashboard writes a Markdown index of the four domain truths. It redacts raw
transcript text: it shows derived decisions, backlog items, patterns, and
attention reasons, plus at most the short tail snippets, never full conversation
content or secrets.

## Validate without a live run: the eval harness

The repeatable, **keyless** validation is the reactor eval harness
(`tools/eval-harness/`), not an ad-hoc live run. It turns a committed example run
(a `replay/` state-dir: receipts + world-models + topology) into a normalized
trajectory, applies a deterministic checker (no model — proves the selective-wake
/ cost-scales-with-surprise property: a decision chat renders decisions + attention
and **skips** backlog + use-case), and — only when an OpenRouter key is resolvable
and `REACTOR_OFFLINE` is unset — runs a 5-judge LLM panel that grades the produced
artifacts against this example's `### Maintains` postconditions.

```sh
# deterministic, offline, zero spend:
REACTOR_OFFLINE=1 node ../../../../tools/eval-harness/cli.mjs \
  --example agent-observatory=./replay --scenarios cold_start,no_change_replay

# add the LLM judge panel (needs key budget; off by default):
node ../../../../tools/eval-harness/cli.mjs --example agent-observatory=./replay
```

The `replay/` is produced once from a `serve`/`run` of this project (needs a key);
thereafter the harness replays + judges it with no re-run.
