---
name: repo-changes
kind: gateway
---

### Goal

Accept merged-PR deltas arriving from the edge and expose them as a materialized
set of changed PRs that responsibilities can subscribe to. A delta carries only a
PR's identity and a change receipt: its number, title, body, the set of changed
file paths (as a delimited list), and a one-line diffstat. It never carries the
full diff.

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

- This render is a bounded fold. Take exactly the arrivals already staged at the
  edge and add or update their entries in the changed-PR set. Complete in a few
  steps.
- The only readable input is the staged arrivals and this node's prior
  world-model. Never run git, scan the filesystem, open the repository or
  node_modules, or run shell commands to look for changes: the staged arrivals are
  the only input.
- The only writable surface is this gateway's published world-model.
