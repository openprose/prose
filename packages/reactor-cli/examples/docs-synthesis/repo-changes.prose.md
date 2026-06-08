---
name: repo-changes
kind: gateway
---

### Goal

Fold the merged-PR records staged in this node's upstream inbox into a
materialized set of changed PRs that responsibilities can subscribe to.

Your ONLY input is your upstream ingress, which publishes a single file
`inbox.json`: a JSON array of merged-PR records. Each record has `number`,
`title`, `body`, `files` (a semicolon-delimited list of changed file paths),
`diffstat`, and `merge_sha`. Read `inbox.json` from your upstream by reference
(use your upstream-list / upstream-read tools — the ingress is your upstream
producer even though it carries no `### Requires` line), and add or update each
record in the `changes` set, keyed by PR number, carrying its number, title, body,
files, and diffstat forward as the change receipt. There is NO git repository, no
source tree, and no working-directory file to inspect — `inbox.json` is the only
source of truth.

### Maintains

The set of changed PRs, folded from the external arrivals staged at the edge.
Material: the changed-PR set (unordered, keyed by PR number) and, for each PR, its
number and its change fingerprint. The scan time is immaterial and is excluded
from the fingerprint, so a re-poll that finds the same merged PR produces an
identical world-model fingerprint and the reconciler skips before any downstream
render runs.

#### changes
The changed-PR set. Each PR is individually addressable by its number, so a
downstream node that subscribes to this set wakes when any PR's fingerprint moves.
Material per PR: the PR number, the change fingerprint, the title, the body, the
delimited changed-file-path list, and the diffstat — the inline evidence the
classifier needs and nothing more.

### Continuity

- external-driven: wake when a merged PR arrives at the gateway. A re-poll that
  finds no moved fingerprint stages nothing and wakes nothing.

### Invariants

- This render is a bounded fold over `inbox.json` from your upstream and this
  node's prior world-model. Read `inbox.json`, fold each PR record into `changes`,
  and finish in a few steps.
- Do NOT run `git`, `ls`, `find`, `grep`, or any shell command to discover
  changes, and do NOT scan the filesystem or the working directory: there is no
  repository here. The staged `inbox.json` from your upstream is the only input.
- The only writable surface is this gateway's published world-model.
