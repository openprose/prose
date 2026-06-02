---
name: planning-corpus
kind: gateway
---

# Planning Corpus

> The single ingress for a large implementation effort. It is the system's only
> entry point: it has no `### Requires` (its input arrives from outside the
> graph), it `### Maintains` the latest incoming planning truth, and its
> `### Continuity` is **external-driven**, which is how Forme finds it as the DAG
> entry. A file watcher, a scheduled scan, or a manual kick all translate into a
> single external wake at the system's edge.

### Continuity

external-driven

A planning-doc change, a repo snapshot, or an operator config edit translates into
a *receipt* at the system's edge — one wake event type, external source. The
gateway re-projects that trigger into three INDEPENDENT feed facets so a
docs-only edit never perturbs the repo or config lanes downstream.

### Schedule

- A scheduled scan of the planning corpus + target repo snapshot (the self-kick
  that ensures a pass happens even when no watcher fires).

### Receives

- path + content_fingerprint + changed_sections for each planning document
- repo_root, branch, git_sha, package_manager, test_commands, relevant_file_index
- enabled_lanes, budget, command_allowlist, commit_policy, forbidden_operations

### Maintains

The latest incoming planning truth, as three independently-fingerprinted feeds the
`implementation-corpus` responsibility subscribes to:

- `docs`: the planning documents in the run, each carrying its requested work
  items (by lane).
- `repo`: the target repo snapshot — branch, sha, and the shared shape the
  foundation owns.
- `config`: the run config — enabled lanes and the forbidden-operation policy.

**Canonicalization spec**: each feed slice is fingerprinted on its own. A
docs-only edit moves ONLY the `docs` facet; the `repo` and `config` facets stay
byte-identical, so a re-POST that changed nothing does not move the fingerprint.
This is the root of the dark-lane: surprise is feed-local from the very edge.

### Facets

Named parts of this truth — each is a fingerprint unit and a subscription symbol.

#### docs

The planning documents and their requested work items. Material: the doc ids and
their item lists; immaterial: transport request-ids and re-POST timestamps.

#### repo

The target repo snapshot. Material: branch, sha, and the shared shape; immaterial:
the scan timestamp.

#### config

The run config. Material: enabled lanes and forbidden paths.
