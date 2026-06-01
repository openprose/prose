# monorepo-ci

**Standing goal:** keep a monorepo's merge gate honest — re-run only the CI work
a diff actually invalidates, and block the merge the moment a test regresses.

**One-line scenario:** Your CI re-ran 200 checks. Reactor re-ran 3 — the ones
your 4-line diff actually touched; and when a `pkg-api` test throws, the merge
gate goes BLOCKED while the rest of the graph stays cached.

This is the **largest** example in the library (22 nodes / 48 edges) and the one
that teaches **memoization + hub fan-out blast radius**: a single `pkg-core` hub
edits fans out to its dependents, while a leaf edit lights only one lane.

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
  rebuilds core + ui + api + auth (+ their tests) — a visibly wider lane, still
  far short of "rebuild everything" (`pkg-utils` + `pkg-billing` stay dark).
- **Failure drives BLOCKED.** A `pkg-api` test render throws → a `failed` receipt
  (zero fresh, no published truth, wakes nothing) → the merge gate reads the
  build's recorded `RED` status and renders `merge: BLOCKED`. The fix lands and
  the gate returns to `GREEN`.

## Run it (the Reactor flow)

The `.prose.md` contracts under `src/` work with any harness; these verbs steer
you through the Reactor harness.

```sh
reactor doctor                 # honest health report (sandbox, IR present?)
reactor compile                # the session embodies the VM → IR cache / topology
reactor topology               # the compiled DAG (22 nodes / 48 edges)
reactor run                    # boot, drain, print dispositions + cost
reactor serve                  # browse the live world-models
reactor receipts verify        # chain-verify the on-disk ledger
```

## Replay it keyless (no model key)

The committed `replay/` state-dir is a frozen, chain-verifiable ledger. Replay it
in devtools with zero spend:

```sh
reactor-devtools --example monorepo-ci --describe
#   dispositions rendered=… · skipped=… · failed=1
#   surprise-cause  external · input · self
#   COST ROLLUP (tokens) …   CHAIN-VERIFY ok
```

Watch the leaf beat — `skipped moved[—] fresh 0` across five dark packages — then
the hub beat widen the lane, then the RED beat block the merge.

## How it was built (the two phases)

1. **Compile (intelligent).** A SKILL-loaded session embodies the VM and compiles
   the `src/*.prose.md` contracts into the deterministic topology + fingerprints.
   No parser ran; the session IS the compiler.
2. **Run (dumb).** `generate.ts` drives the **real `@openprose/reactor`
   reconciler** with deterministic fake renders (no key) over a scripted beat
   timeline (cold → quiet skip → leaf diff → hub fan-out → RED → recover → quiet)
   and freezes the result into `replay/`. The reconciler replays it; a node
   renders IFF its memo key `(contract_fingerprint, input_fingerprints)` moved.

Regeneration is byte-deterministic: `monorepo-ci.test.ts` regenerates `replay/`
into a temp dir and asserts the receipts / topology / labels are byte-identical,
that a quiet re-wake spends `fresh == 0`, that a contract edit forces a render,
that `cost.surprise_cause === wake.source` on every receipt, and that
`verifyReceiptChain` passes over the raw on-disk receipts.
