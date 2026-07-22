---
name: change-signal
kind: responsibility
---

### Goal

For each changed PR, classify its evidence into small, typed, per-section
doc-impact signals so each downstream documentation section wakes only when its
own source was touched. This is the cheap gatekeeper of the pipeline: it does not
read the diff, draft prose, or open the repo — it maps the changed file paths (and
the title and body) to at most a one-line signal per affected doc section, or
nothing.

Read the `changes` set from your upstream (repo-changes) by reference. For each PR
record, split its `files` field on `;` to get the changed file paths, and route by
those paths (the title and body are only tie-breakers). Your input is these
upstream records — never run `git`, open a diff, or scan the filesystem.

The public docs site has five sections, each tracking one source area of the
watched repo. Route by changed path:

- `packages/reactor-cli/**` → the `cli` section.
- `packages/reactor/**` that changes the public API surface (the package exports,
  the front door, public type signatures) → the `sdk` section.
- `packages/reactor/**` that changes harness behavior or concepts (compile, the
  world-model, fingerprints, the reconciler, receipts, continuity, ingestion) →
  the `reactor` section.
- `packages/reactor-devtools/**` → the `reactor-devtools` section.
- `skills/open-prose/**` or `references/*.md` → the `openprose` section.

A single PR may touch several sections (emit a signal for each) or none (emit
nothing). Changes confined to tests, fixtures, CI, build config, or internal
refactors with no doc-facing surface emit no signal at all.

### Requires

- the changes facet of repo-changes (each PR's change receipt: number, title,
  body, the delimited changed-file-path list, and the diffstat)

### Maintains

A set of per-PR doc-impact signals, split into five independently-subscribable
facets so a PR that touches only one source area moves only that one facet. A
facet is absent for a PR when that PR touches no source for that section, so an
unrelated PR never moves an unrelated section. Material per signal: its PR number
and a single short line naming the doc-impact (what changed and which section is
now at risk of being stale). The fetch time and the diffstat byte counts are
immaterial and are excluded from the fingerprint.

Postconditions: every emitted signal carries a PR number; a signal is emitted only
when the PR's changed paths actually touch that section's source; a PR whose
changes are purely test/CI/build emits no signals at all.

#### cli-signal
Per PR, a one-line doc-impact for the `cli` section, when the PR touched
`packages/reactor-cli/**`. Absent otherwise. Subscribed to by cli-docs.

#### sdk-signal
Per PR, a one-line doc-impact for the `sdk` section, when the PR changed the
public API surface of `packages/reactor/**` (exports, front door, public
signatures). Absent otherwise. Subscribed to by sdk-docs.

#### reactor-signal
Per PR, a one-line doc-impact for the `reactor` section, when the PR changed
harness behavior or concepts in `packages/reactor/**` (compile, world-model,
fingerprints, reconciler, receipts, continuity, ingestion). Absent otherwise.
Subscribed to by reactor-docs.

#### devtools-signal
Per PR, a one-line doc-impact for the `reactor-devtools` section, when the PR
touched `packages/reactor-devtools/**`. Absent otherwise. Subscribed to by
devtools-docs.

#### openprose-signal
Per PR, a one-line doc-impact for the `openprose` section, when the PR touched
`skills/open-prose/**` or `references/*.md`. Absent otherwise. Subscribed to by
openprose-docs.

### Continuity

- input-driven: re-classify a PR when its fingerprint moves in the gateway set. A
  PR whose fingerprint did not move is skipped at zero cost.

### Invariants

- This render is a bounded transform over the change receipt already carried in
  the wake evidence. Read ONLY that inline evidence (the changed-file-path list,
  the title, the body, the diffstat) and this node's prior world-model. Never run
  git, open the diff, read the repository or node_modules, scan the filesystem, or
  run shell commands. Complete in a few steps.
- Classify into the five fixed section shapes only; emit at most one short line per
  facet per PR, and emit nothing for a section the PR's paths do not touch. Do not
  draft documentation, do not summarize the diff.
- The only writable surface is this node's published world-model.
