# monorepo-ci

**Standing goal:** keep a monorepo's merge gate honest: re-run only the CI work
a diff actually invalidates, and block the merge the moment a test regresses.

**One-line scenario:** Your CI re-ran 200 checks. The reconciler re-ran 3, the
ones your 4-line diff actually touched; and when a `pkg-api` test throws, the merge
gate goes BLOCKED while the rest of the graph stays cached.

This is the **largest** example in the library (22 nodes / 48 edges) and the one
that teaches **memoization + hub fan-out blast radius**: a single `pkg-core` hub
edit fans out to its dependents, while a leaf edit lights only one lane.
`src/` ships the 4 authored contracts and mounts 4 nodes on its own; the
22-node / 48-edge topology is what the reference harness's per-entity expansion
produces from them (see the Harnesses section of the repository README).

## The DAG

```
                          (working tree, external)
                                   │
                          ┌────────▼────────┐
                          │ gateway.workspace│  one facet per package
                          └─┬─┬─┬─┬─┬─┬──────┘
        pkg-core │ pkg-ui │ pkg-api │ pkg-utils │ pkg-auth │ pkg-billing
                 ▼        ▼         ▼          ▼          ▼          ▼
              build.* (6)   ── lint.* (6) subscribe to the same package facets
                 │  └─ core-dist facet ─► build.pkg-ui / build.pkg-api / build.pkg-auth   (THE HUB EDGE)
                 ▼
              test.* (6)
                 │
   all builds ──►  check.typecheck     check.review  ◄── all builds
                 │                         │
                 └──────────┬──────────────┘
            all tests + all lints + review + typecheck
                           ▼
                      gate.merge   →  GREEN | BLOCKED
```

`pkg-core` is the **hub**: `build.pkg-ui`, `build.pkg-api`, and `build.pkg-auth`
each subscribe to its `core-dist` compiled-output facet. `pkg-utils` and
`pkg-billing` are independent leaves and stay dark even on a hub diff.

## What it teaches

- **Memoization.** A byte-identical re-scan memo-skips the whole graph; fresh
  cost is flat at zero.
- **Leaf blast radius.** A 4-line `pkg-ui` diff moves only the `pkg-ui` facet, so
  only `build.pkg-ui` → `test.pkg-ui` (+ `lint.pkg-ui`, typecheck, review, merge)
  wake. The other five packages' build/test/lint lanes stay dark.
- **Hub fan-out blast radius.** A `pkg-core` diff moves the `core-dist` facet and
  rebuilds core + ui + api + auth (+ their tests): a visibly wider lane, still
  far short of "rebuild everything" (`pkg-utils` + `pkg-billing` stay dark).
- **Failure drives BLOCKED.** A `pkg-api` test render throws → a `failed` receipt
  (zero fresh, no published truth, wakes nothing) → the merge gate reads the
  build's recorded `RED` status and renders `merge: BLOCKED`. The fix lands and
  the gate returns to `GREEN`.

## Conformance expectations

A conforming harness proves zero-fresh quiet scans, leaf-lane isolation, bounded
hub fan-out, failed-test containment, merge-gate BLOCKED and recovery states,
receipt-chain verification, and byte-identical replay.

## Replay it keyless (no model key)

A run leaves a frozen, chain-verifiable state on disk. Any conforming harness
can replay it with zero spend:

```text
dispositions rendered=… · skipped=… · failed=1
surprise-cause  external · input · self
cost rollup (tokens) …   chain-verify ok
```

Watch the leaf beat (`skipped moved[] fresh 0` across five dark packages), then
the hub beat widen the lane, then the RED beat block the merge.

## How it works (the two phases)

1. **Compile (intelligent).** A SKILL-loaded session embodies the VM and compiles
   the `src/*.prose.md` contracts into the deterministic topology + fingerprints.
   No parser ran; the session IS the compiler.
2. **Run (dumb).** The reconciler drives deterministic renders over a scripted beat
   timeline (cold → quiet skip → leaf diff → hub fan-out → RED → recover → quiet)
   and freezes the result into a state-dir. The reconciler replays it; a node
   renders IFF its memo key `(contract_fingerprint, input_fingerprints)` moved.
