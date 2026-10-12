# docs-synthesis — Cost & Context Discipline, applied

_Why this example is shaped the way it is. It is the worked example of the
**Cost and Context Discipline** authoring guidance
(`skills/open-prose/guidance/authoring.md`): a continuous, fan-out, high-event-
volume Reactor pipeline — the PR→docs shape that guidance was written for._

---

## The job

Watch a code repo's merged PRs and keep a separate docs site current. The naive
version is one render per PR: "here is a merged PR, read the repo and the docs, and
update whatever is now stale." That render re-derives every downstream truth on
each event, wanders two repositories to do it, and runs on every PR whether or not
it touches anything documented. Cost scales with the *clock*, not with surprise —
and most PRs (tests, CI, refactors) document nothing.

This example is the disciplined version. Every rule below maps to a bullet in the
authoring guidance.

---

## Tier the work; let a cheap gatekeeper filter surprise

`change-signal` is a narrow **classifier**, not a summarizer. It reads only a
merged PR's changed-file-path list (plus title and body) and maps paths to doc
sections, emitting at most a one-line typed signal per affected section — split into
five independently-subscribable facets:

```
 repo-changes (gateway)   ~free: fold the staged PR delta; no model, no git
   |  #changes
   v
 change-signal (classifier)   CHEAP: inline paths -> per-section signals
   |  #cli-signal  #sdk-signal  #reactor-signal  #devtools-signal  #openprose-signal
   v       \           \              \                 \                 \
 cli-docs  sdk-docs  reactor-docs  devtools-docs  openprose-docs   each: pending edits
   \________ \___________ \______________ \_______________/
                          |
                       docs-pr   RARE: coalesced; opens one PR; reads only the pages it edits
```

A PR touching only `packages/reactor-cli/**` moves `#cli-signal` only. `cli-docs`
renders; the other four sections **memo-skip at zero cost** because their signal
facet never moved. A test-only PR moves nothing downstream at all. This is the
`guard` pattern made structural: expensive synthesis runs only on real change.

## Bound each narrow render to its inline input

The classifier and the five accumulators read ONLY the staged PR evidence and their
own prior world-model. Their `### Invariants` forbid running git, opening the diff,
or reading either repository. They emit **pointers** — "section `cli`, page
`telemetry`, stale re: PR #101" — not diffs. `max_turns` caps turns, not context
size; it is the *unscoped task* that explodes cost, so the task is scoped ("classify
into these five shapes," "append one pending edit") and the inputs are bounded. Each
accumulator even carries its section's fixed page list in-contract, so it names a
real target page without reading the docs repo.

## Concentrate the expensive, effectful work in the rare terminal node

`docs-pr` is the one render whose *job* is to act — and the guidance is explicit
that the discipline does not override the principle that a render which must explore
(or here, act) should do so. So `docs-pr` MAY read the specific `.mdx` pages its
pending edits name and the cited PRs' actual changes, draft the edits, and open one
PR. It is still bounded (only the named pages and cited PRs, never a repo crawl),
and it fires only when a pending-edit facet actually moved — so its cost is paid
only on genuine doc work, not on every PR. This is "keep the high-volume renders
small enough for a cheap model; reserve the heavier work for the rare node."

## Validate the cost-shape; do not assume it

The committed `replay/` plus the eval harness prove the property rather than
asserting it. The deterministic tier (offline, zero spend) checks selective wake: a
CLI-only PR renders `change-signal` + `cli-docs` and **skips**
sdk/reactor/devtools/openprose; a test-only PR renders nothing downstream. The
opt-in judge tier grades the produced pending edits and proposed PR against each
node's `### Maintains` postconditions (every edit cites a PR and names a real page;
the branch name is a deterministic function of the cited PR numbers).

---

## The model-tiering reality (the same honest gap)

`### Runtime: model` is valid OpenProse, so "a cheap model for the classifier, a
stronger model for the actuator that drafts prose" is *authorable*. But the shipped
CLI wires a single global `render_model` for every node and does not read per-node
`### Runtime` model — tracked as `RB-NodeModel`. So today: one cheap global model
(adequate for the upstream transforms), the actuator runs on it too, and a human
reviews the opened PR. When `RB-NodeModel` lands, the actuator is the obvious node
to point at a stronger model.

---

## What this example is NOT

It is not a generic "summarize the repo" agent. It does not re-derive the docs from
scratch on each PR, it does not scan two repositories per event, and it does not run
expensive work on PRs that document nothing. The whole point is that cost tracks
surprise: a quiet stream of test/CI/refactor PRs costs ~nothing past the cheap
classify, and a PR that genuinely changes a documented surface produces exactly one
reviewed docs PR.
