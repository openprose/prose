# docs-synthesis example

Merged PRs in the prose monorepo piped into a docs-update pull request. A cheap
classifier turns each merged PR into small per-section *signals*, five first-class
section truths each subscribe to the one signal they care about and accumulate
pending edits, and a terminal actuator composes them into one PR against
`openprose/docs`. See `PIPELINE-DESIGN.md` for the why.

```
repo-changes (gateway)     ~free: fold merged-PR deltas (paths + diffstat, no diff)
        |
   change-signal  (cheap classifier: reads ONLY the inline changed-path list)
        |  emits per-section facets:
        ├─ #cli-signal ───────► cli-docs
        ├─ #sdk-signal ───────► sdk-docs
        ├─ #reactor-signal ───► reactor-docs
        ├─ #devtools-signal ──► devtools-docs
        └─ #openprose-signal ─► openprose-docs
                                   |  each: pending edits (page + why + cited PR)
                               docs-pr  (one coalesced PR against openprose/docs)
```

The point is cost control by design: each section subscribes to its **own** signal
facet, so a PR that only touched `packages/reactor-cli/**` moves `#cli-signal`
only — cli-docs renders, the other four sections **memo-skip at zero cost**. A PR
that touched no doc-facing source (tests, CI, an internal refactor) emits no signal
at all and costs nothing past the cheap classify. The actuator wakes once per burst
and opens a single PR.

The five public-docs sections each track one source area of the watched repo:

| signal facet | docs section (`content/docs/`) | source it tracks |
|---|---|---|
| `#cli-signal` | `cli/` | `packages/reactor-cli/**` |
| `#sdk-signal` | `sdk/` | `packages/reactor/**` public API surface |
| `#reactor-signal` | `reactor/` | `packages/reactor/**` harness behavior + concepts |
| `#devtools-signal` | `reactor-devtools/` | `packages/reactor-devtools/**` |
| `#openprose-signal` | `openprose/` | `skills/open-prose/**`, `references/*.md` |

Cost levers (all in the contracts): granular per-section facets; stable materiality
(volatile fields like scan time dropped, so a re-seen PR never propagates); `###
Continuity` declares the wake source semantically (no hand-coded cron); and each
upstream render's `### Invariants` lock it to its inline input (never run git, never
read the repo) so it is a small bounded transform, not an open-ended agent loop. The
one render whose job IS to act — `docs-pr` — is allowed to read the specific pages
it edits and the cited PRs, still bounded, never a repo crawl. One cheap global
model is adequate for the upstream transforms; true per-node model tiering (a
stronger model for the actuator) is tracked as `RB-NodeModel`.

## Inspect (keyless, read-only)

These read what is already on disk and need no model key: `doctor`,
`compile --check`, `status`, `topology`, `receipts list|cost`, `inspect`, `logs`.

Actually running the reactor (the compile sessions and the renders) needs a model
key. `REACTOR_OFFLINE=1` forces the provider closed; it is **not** a keyless run at
the CLI — `reactor run --offline` just writes a `failed` receipt, because the
hermetic fake render is a programmatic SDK test seam, not a CLI mode. So compile and
run/serve with a real key; the read-only commands above stay keyless.

## Run it (needs OPENROUTER_API_KEY)

Feed the gateway one of two ways: the built-in `static` connector (fixture PR
deltas, no network — a deterministic demo) or `connectors.cjs` (a real scan of
`git log`). `serve` polls the connector and stages arrivals; a one-shot `run` only
drains what is already staged, so use `serve` (or `trigger`) to bring the PRs in.

```sh
export OPENROUTER_API_KEY=sk-or-...
CLI="node /Users/sl/code/openprose/platform/external/prose/packages/reactor-cli/dist/cli.js"

$CLI compile --project .            # compile the topology + canonicalizers to the IR cache
$CLI topology --project .           # repo-changes -> change-signal -> 5 truths -> docs-pr
$CLI serve --project .              # polls the static connector, stages the fixtures,
                                    # classifies + renders each touched section; ctrl-c once quiescent

# inspect what happened:
$CLI status --project .             # dispositions + cost
$CLI receipts list --project .      # which sections rendered vs memo-skipped
$CLI receipts cost --project .      # cost rolled up by surprise cause
```

With the four shipped fixtures you should see: PR #101 (CLI-only) renders
`change-signal` + `cli-docs`; PR #102 (CLI+SDK) renders `cli-docs` + `sdk-docs`; PR
#103 (openprose) renders `openprose-docs`; PR #104 (test-only) renders the classifier
and then nothing — every section memo-skips. `docs-pr` coalesces the burst into one
proposed PR.

### Scan your real merges

The real scanner ships as `connectors.cjs.example` (opt-in, so the static fixtures
are the default deterministic demo). To enable it:

```sh
cp connectors.cjs.example connectors.cjs            # keyed `github`, matching source_id
export DOCS_SYNTH_REPO=/path/to/the/prose/repo      # defaults to this repo's git toplevel
```

It runs `git log --first-parent` on the watched repo since a persisted cursor,
extracts the PR number from each merge subject/body, and emits one arrival per
merged PR with the changed-file-path list and diffstat — never the full diff. A
present `connectors.cjs` takes precedence over the static connector. Point `serve`
at it the same way; each merged PR wakes only the sections it touches.

### The opened PR (the actuator)

`docs-pr` is the one node with an external effect. Live, it drafts the `.mdx`
changes for the pages its pending edits name, writes them to a branch on a local
clone of `openprose/docs` (the path in `DOCS_SYNTH_DOCS_REPO`), and opens one PR
(via `git` + `gh`) listing the source PRs it addresses. The branch name is derived
from the cited PR numbers, so a re-run
updates the same branch instead of opening duplicates. It never pushes to the docs
default branch and never touches the watched code repo. Under `REACTOR_OFFLINE` —
or with `DOCS_SYNTH_DRY_RUN=1` — it runs dry: it writes the proposed unified diff
into its world-model instead of touching git/`gh`/network. The committed `replay/`
is produced by a keyed run with `DOCS_SYNTH_DRY_RUN=1`, so the renders are real but
no live PR is opened.

## Validate without a live run: the eval harness

The repeatable, **keyless** validation is the reactor eval harness
(`tools/eval-harness/`), not an ad-hoc live run. It turns a committed example run (a
`replay/` state-dir: receipts + world-models + topology) into a normalized
trajectory, applies a deterministic checker (no model — proves the selective-wake /
cost-scales-with-surprise property: a CLI-only PR renders cli-docs and **skips**
sdk/reactor/devtools/openprose; a test-only PR renders nothing downstream), and —
only when an OpenRouter key is resolvable and `REACTOR_OFFLINE` is unset — runs a
judge panel that grades the produced pending edits and proposed PR against this
example's `### Maintains` postconditions (every pending edit cites a PR and names a
real page; the branch name is a deterministic function of the cited PRs).

```sh
# deterministic, offline, zero spend:
REACTOR_OFFLINE=1 node ../../../../tools/eval-harness/cli.mjs \
  --example docs-synthesis=./replay --scenarios cold_start,no_change_replay

# add the LLM judge panel (needs key budget; off by default):
node ../../../../tools/eval-harness/cli.mjs --example docs-synthesis=./replay
```

The `replay/` is produced once from a `serve`/`run` of this project (needs a key);
thereafter the harness replays + judges it with no re-run.
