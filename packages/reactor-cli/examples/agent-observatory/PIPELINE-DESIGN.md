# Agent Observatory — Efficient Tiered Pipeline (redesign)

_A redesign of the agent-observatory example so its cost actually scales with
surprise, grounded in `spec/00-Tenets.md`, `02-ReactorHarness.md`, and
`03-ReactorPattern.md` (re-read 2026-06-03). This is a design for review, not the
build._

---

## Why the first build was expensive

The first live run cost ~35M tokens for one cascade and failed 4 of 7 nodes. Two
distinct causes, both addressable by authoring, per `03-ReactorPattern.md`:

1. **Every domain synthesized expensively, every time.** `session-summary`
   produced one big truth that all four domains subscribed to, so any session
   woke all four. That is the anti-pattern Rule 5 names: a `### Maintains` whose
   consumers want *selectors* but get one atomic truth.
2. **Renders pulled enormous context.** `session-summary` alone burned ~3.9M
   *fresh* tokens. `max_turns` caps the number of turns, not the context size per
   turn — and with `sandbox: none` the render wandered the monorepo. The task
   ("summarize everything") was open-ended, so the agent explored (Tenet 2: the
   model is a bounded agent that *explores*; the fix is to make the task small,
   not to forbid exploration).

The redesign attacks both: **filter surprise at cheap stages so most renders
never run, and make every render that does run a tiny, inline, single-purpose
transform.**

---

## The principle (Rule 5, made literal)

> Write `### Maintains` so "did anything material change?" is cheaply decidable,
> facet it so an unrelated change wakes nobody, and keep each render's task small
> enough that it does not need to explore.

A tiered cascade where **each cheap stage gates the next**: a stage only emits a
moved fingerprint when something material actually changed, so the expensive
stages downstream stay asleep. Cost is paid where surprise is, and nowhere else.

---

## The tiered cascade

```
 PHASE 0  session-deltas        gateway     ~free (fold of staged file deltas)
   |        scan changed *.jsonl, fingerprint by mtime:size; emit only changed
   |        sessions. Most polls: no change -> nothing wakes.
   v
 PHASE 1  session-signal        responsibility   CHEAP (small model, inline tail)
   |        classify ONLY the tail snippet into a small typed signal, faceted by
   |        domain. A pure-bug chat moves #bug-signal only; #decision-signal etc.
   |        stay unchanged -> those domains memo-skip at zero cost.
   |        facets:  #decision-signal  #bug-signal  #use-case-signal  #attention-signal
   v          \            \              \                \
 PHASE 2   decisions-log   eng-backlog   use-case-guide   attention-queue
   |        each subscribes to ITS ONE facet; wakes only when that facet moves;
   |        appends/dedups into a small bounded truth. (small model)
   v          \            \              \                /
 PHASE 3  dashboard         responsibility   RARE (coalesced, composes structured facets)
            wakes once per burst when a domain truth moved; renders the index
            FROM the structured truths (never re-reads transcripts).
```

### Per-node sketch

| Node | kind | Requires | Maintains (facets) | Continuity | Why it stays cheap |
|---|---|---|---|---|---|
| `session-deltas` | gateway | — (external ingress) | `#sessions` (id + `mtime:size` fingerprint only) | external-driven; declared scan cadence | a fold of staged deltas; no model exploration; unchanged files emit nothing |
| `session-signal` | responsibility | `#sessions` | `#decision-signal` / `#bug-signal` / `#use-case-signal` / `#attention-signal` — each a small typed record (or absent) | input-driven (per session) | reads ONLY the inline tail; classifies into a fixed shape; stable fingerprint per facet so unchanged content never propagates |
| `decisions-log` | responsibility | `#decision-signal` | `#open-decisions` / `#decision-history` | input-driven | wakes only on a decision signal; appends a bounded entry |
| `eng-backlog` | responsibility | `#bug-signal` | `#open-items` / `#by-project-counts` | input-driven | wakes only on a bug signal |
| `use-case-guide` | responsibility | `#use-case-signal` | `#active-patterns` | input-driven | wakes only on a use-case signal |
| `attention-queue` | responsibility | `#attention-signal` (+ `#open-decisions`) | `#needs-user` / `#decision-blocked` | input-driven | wakes only on attention/decision moves |
| `dashboard` | responsibility | the 4 domain facets | a Markdown index (fingerprint = file hash + input tuple) | input-driven, coalesced | composes structured facets; renders prose FROM the truth, never re-reads sessions |

**The key structural change vs the first build:** `session-signal` replaces the
monolithic `session-summary`. It is a *classifier*, not a *summarizer* — it emits
small per-domain signal facets, so the fan-out is selective and most domains
memo-skip on most sessions.

---

## How each cost lever maps to the spec (and your asks)

| Lever (your words) | Mechanism (spec) | Where it lives |
|---|---|---|
| "more granular world state" | facets: `####` parts; a consumer subscribing to one facet is not woken by another (Rule 5.2; Harness §quiescence-3) | per-domain signal facets on `session-signal` |
| "bubble them up gradually / consolidate first" | tiered cascade + coalescing (one dashboard render per burst, not per upstream) | phases 1→2→3 |
| "haikus to gatekeep changes" | small model for the high-volume classify; `### Runtime: model` declares it (see gap below) | `session-signal` (+ accumulators) |
| "control the cron/frequency/event-source ... in the markdown, semantically" | `### Continuity` declares the wake source (external scan / input / `valid_until`), never a hand-coded cron (Rule 2; anti-pattern "hand-coding a cadence") | every node's `### Continuity` |
| "control spend by designing the pipeline" | stable materiality → memo-skip *before* any render (Rule 5.1); the dumb reconciler skips at zero cost | every `### Maintains` drops volatile fields (scan time, mtime) |
| (the context blow-up) | tiny inline task + `### Invariants` forbids wandering; `guard` before any richer step (Rule 4/5, guard pattern) | `session-signal` reads only the inline tail |

The single biggest win is structural, not model choice: **with stable
fingerprints + per-domain facets, the reconciler skips most renders before they
run.** A quiet day of agent sessions that carry no new decision/bug/use-case
costs ~zero. {>>This is the cost-scales-with-surprise property the first build threw away by waking all four domains every time.<<}{id="c1" by="AI" at="2026-06-03T00:00:00.000Z"}

---

## The model-tiering reality (an honest gap)

`### Runtime: model` is valid OpenProse (`01-Language.md` line 401; `spawn_session`
takes an optional model), so "Haiku for the classifier, a stronger model for the
dashboard" is *authorable*. **But the shipped CLI wires a single global
`render_model` for every node** (`reactor-cli/dist/run/host.js`:
`renderModel: config.model.render_model`); it does not read per-node `### Runtime`
model. So today, three options:

1. **One cheap model globally (recommended).** Because the redesign makes *every*
   render a small typed transform (classify, append, compose), a Haiku-class
   model is adequate for all of them. Set `render_model` to a cheap model; rely on
   facets + materiality for the structural savings. Simplest, ships today.
2. **Multi-reactor split.** `reactors:` can host N reactors each with its own
   model — but reactors are isolated (separate state-dirs), so a cross-reactor
   subscription is not a clean DAG edge. Rejected: it breaks composition.
3. **Add per-node model to the CLI.** A small SDK/CLI seam to read `### Runtime`
   model into the render context (the SDK already accepts a per-render `model`:
   `agent-render/index.js` uses `model ?? DEFAULT_RENDER_MODEL`). The right
   end-state; a real change to the harness, not this example.

{>>Recommend option 1 for the rebuild (cheap global model + the structural levers), and file option 3 as a harness improvement so true per-node tiering lands later. Agree?<<}{id="c2" by="AI" at="2026-06-03T00:00:00.000Z"}

---

## The context-bloat fix (so a render cannot cost millions)

Per Tenet 2 the render explores by design; we make exploration unnecessary:

- **Pass the evidence inline and small.** `session-signal` gets the tail snippet
  in the wake evidence; it never opens the `.jsonl` or the repo.
- **`### Invariants` forbids wandering.** "The only readable input is the staged
  signal/evidence and the prior world-model; never scan the filesystem, the repo,
  or `node_modules`." (the actuation/observation boundary, Rule 4)
- **Single-purpose task.** Classify into a fixed shape, or append one bounded
  entry — not "summarize everything."
- **Keep `max_turns` low** as the backstop, but the real fix is task size.

{>>Open question: how strictly does the shipped agent-render honor an `### Invariants` "do not read the filesystem" directive vs the SKILL's default tool grant? If weak, we may also want sandbox guidance (docker/unix-local) — but that is harness-side. Worth a small probe before the full rebuild.<<}{id="c3" by="AI" at="2026-06-03T00:00:00.000Z"}

---

## What I'd build next (for your approval)

1. Rebuild the example as this tiered cascade: `session-deltas` → `session-signal`
   (faceted classifier) → 4 domain accumulators → `dashboard`. Set `render_model`
   to a cheap model; `### Invariants` lock each render to its inline input.
2. Keep the static fixtures (inline-flow, flat) for a deterministic cheap run,
   scanner opt-in (`connectors.cjs.example`).
3. A cheap validation run via `serve`/`run`, expecting: a decision chat wakes
   `decisions-log` + `attention-queue` and **memo-skips** `eng-backlog` /
   `use-case-guide`; a bug chat the mirror — at a fraction of the prior cost.
4. The matching animated diagram is already shipped (`D00cConversationFanout`);
   update it if the facet/phase names change.

### Decisions for you

{>>(a) Rebuild the existing agent-observatory in place, or build a sibling `agent-observatory-tiered` and keep the current one as the "naive" contrast? A contrast pair is a great teaching artifact (and a benchmark baseline), but two examples to maintain.<<}{id="c4" by="AI" at="2026-06-03T00:00:00.000Z"}

{>>(b) After rebuild, do you want another live run (real tokens, but should be far cheaper now), or land it compile-verified + structurally-reasoned and defer the live run?<<}{id="c5" by="AI" at="2026-06-03T00:00:00.000Z"}

{>>(c) Should I also draft the harness change for per-node `### Runtime` model (option 3) as a separate proposal, since it is the real enabler of "haikus to gatekeep"?<<}{id="c6" by="AI" at="2026-06-03T00:00:00.000Z"}
