---
name: test-prose-author-user-global-memory
kind: test
version: 0.15.0
subject: prose-author
---

# Test Prose Author User Global Memory

### Fixtures

- `output_mode`: source-package-only
- `apply`: false
- `request`: |
    I want a personal cross-repo memory workflow, not something inside this
    repository.

    Every Friday, look across the repos I worked in this week, read recent
    commits, open PRs, notes files, and completed run summaries. Keep a durable
    user-level memory ledger of project facts, decisions, TODOs, owners, and
    stale assumptions.

    For each repo:
    - summarize what changed
    - extract durable facts worth remembering
    - mark old facts as confirmed, superseded, or uncertain
    - do not edit the repo itself

    Return weekly_brief, updated_memory_ledger_summary, uncertainty_list.

### Expects

- `authoring_notes`: records that the chosen root is user-global under
  `~/.agents/prose`
- `authoring_notes`: records that `state/README.md` and
  `state/filesystem.md` were loaded because durable memory and root layout
  matter
- `authoring_notes`: records that `responsibility-runtime.md` was loaded
  because the workflow recurs every Friday
- `source_package`: includes a folder-shaped package with a root
  `index.prose.md`
- `source_package`: includes project or user persistence through `### Runtime`
  and `### Memory`, or an equivalent durable memory contract for the ledger
- `source_package`: preserves `weekly_brief`,
  `updated_memory_ledger_summary`, and `uncertainty_list` as named outputs
- `source_package`: keeps repository inspection read-only and does not write
  generated source into the product repository
- `lint_report`: has status `pass` and no blocking findings

### Expects Not

- `source_package`: chooses a native or attached project root after the request
  explicitly asks for personal cross-repo memory
- `source_package`: treats durable memory as a same-run binding only
- `authoring_notes`: claims it edited any inspected repository during authoring
