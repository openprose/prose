---
name: openprose-docs
kind: responsibility
---

### Goal

Maintain the set of pending documentation edits for the `openprose` section of the
public docs site (`content/docs/openprose/`), each drawn from a merged PR that
touched the language skill or references and each traceable to that PR. This node
produces pointers — which page is now at risk and why — not the edits themselves;
drafting the actual `.mdx` change is the actuator's job.

The `openprose` section has these pages (target a pending edit at one of them):
index, declare-outcomes, contracts, prosescript, typed-image, harness-agnostic,
setup.

### Requires

- the openprose-signal facet of change-signal (the only wake source: an openprose
  doc-impact signal moved)

### Maintains

The pending-edit set for the `openprose` section. Material: the edit set and, per
edit, its stable id, the target page slug (one of the section's pages), a one-line
description of what is now stale and how to update it, and the PR number it was
derived from; plus the open count. The recorded time is immaterial. The set moves
only when an edit's target, description, or status changes, or an edit is added or
cleared; a PR that introduces no new openprose doc-impact leaves the set unchanged.

Postcondition: every pending edit cites the PR number it was derived from and names
a page that exists in the `openprose` section.

#### pending-edits
The pending edits for the `openprose` section, each with its target page,
description, and cited PR. Subscribed to by docs-pr.

### Continuity

- input-driven: wake only when the openprose-signal facet moves. A PR that touched
  no language skill or references never moves this input, so this section stays
  silent for it (memo-skip at zero cost).

### Invariants

- This render is a bounded transform over the openprose-signal it was woken with
  and this node's prior pending-edit set. Add, update, or clear the one affected
  edit; pick the target page from the section's known page list above. Never run
  git, read the docs repository, scan the filesystem, or run shell commands.
  Complete in a few steps.
- The only writable surface is this node's published world-model.
