---
kind: responsibility
id: build.pkg-core
---

# Package build — compile one package

There are six build responsibilities, one per package; this contract describes
their shared shape (the `pkg-core` build is the hub variant). A build subscribes
to **only its own package facet** off the workspace gateway, so a diff to a
sibling package never wakes it. `build.pkg-core` is the **hub**: it additionally
exposes a `core-dist` compiled-output facet, and the three dependent builds
(`build.pkg-ui`, `build.pkg-api`, `build.pkg-auth`) subscribe to it. That single
real dependency edge is what turns a `pkg-core` diff into a fan-out.

### Requires

#### pkg-core

The build reads its own package slice off the workspace gateway's matching
package facet (`pkg-ui` for `build.pkg-ui`, and so on). It recompiles only when
that slice's fingerprint moves.

#### core-dist

The hub-dependent builds (`build.pkg-ui`, `build.pkg-api`, `build.pkg-auth`)
ALSO require the `core-dist` facet that `build.pkg-core` exposes — the compiled
hub output. `build.pkg-utils` and `build.pkg-billing` declare no such
requirement; they are independent leaves.

### Maintains

A build world-model: `{ pkg, built, rev, head, compiledLines, coreRev,
testStatus }`. The hub build also publishes a `dist` summary; the `core-dist`
facet is the fingerprint of ONLY that `dist` summary, so a no-op hub re-render
(memo skip) never wakes the fan-out.

The build records the **expected** CI test status (`GREEN` / `RED`) for this
package's job. The merge gate reads this recorded status rather than the test
node's stale published truth, so a tick whose test render fails is still seen by
the gate as a non-passing job.

### Continuity: input-driven

Woken only by an `input` wake from a producer whose facet it subscribes to.
Fresh token cost scales with the lines of source this build had to recompile;
nothing changed means a `skipped` receipt at zero fresh.

### Postconditions

- A single-package leaf diff rebuilds ONLY that package (`build.pkg-ui` alone);
  the other five builds stay skipped.
- A hub (`pkg-core`) diff rebuilds core plus its three dependents
  (`build.pkg-ui`, `build.pkg-api`, `build.pkg-auth`) and no more — `pkg-utils`
  and `pkg-billing` stay dark.
