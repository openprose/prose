---
name: workspace
kind: gateway
version: 0.15.0
id: gateway.workspace
---

# Workspace — the monorepo CI gateway

The single entry point. It watches the monorepo working tree and re-projects it
into **one independent facet per package** (`pkg-core`, `pkg-ui`, `pkg-api`,
`pkg-utils`, `pkg-auth`, `pkg-billing`). A 4-line diff that touches one package
moves exactly one facet token; the other five tokens stay byte-identical, so the
five sibling build/test/lint lanes never wake. That per-package split is the
dark-lane boundary — it is what makes hub fan-out blast radius observable.

### Continuity: external-driven

This is the entry point: the working tree pushes new commits in from outside the
graph. The gateway is woken by an `external` wake and never by an upstream node.
On commit it normalizes the raw repo into a per-package view, then its
canonicalizer projects each package slice into its own facet.

### Maintains

A `workspace` world-model: a `packages` map keyed by package name, each slice
carrying `{ name, rev, diffLines, head, testBroken }`.

#### pkg-core

The hub facet. `build.pkg-core` subscribes to it; `pkg-core`'s compiled output
in turn feeds the dependent builds. A `pkg-core` diff moves this facet and fans
out.

#### pkg-ui

A leaf-package facet. `build.pkg-ui` and `lint.pkg-ui` subscribe to it ONLY. A
`pkg-ui` diff moves this token and nothing else upstream, so only the ui lane
wakes.

#### pkg-api

A leaf-package facet, plus a hub dependent: `build.pkg-api` also reads the
`pkg-core` compiled output. The failing-test beat lands here.

#### pkg-utils

An independent leaf facet — no hub dependency. Stays dark even on a hub diff.

#### pkg-auth

A leaf-package facet and a hub dependent (rebuilds on a `pkg-core` change).

#### pkg-billing

An independent leaf facet — no hub dependency. Stays dark even on a hub diff.

### Postconditions

- Exactly one package facet moves per single-package diff; the sibling facets
  are byte-identical to the prior frame.
- A byte-identical re-scan moves no facet at all (the whole graph memo-skips).
