# implementation-pipeline

A large software-delivery effort run as a standing responsibility graph instead
of one long chat transcript: a **fixed, wide fan-out** of six parallel
construction lanes with
**per-facet wake**. The lesson is **facet-level lane invalidation under a FIXED
topology**.

> **Standing goal.** Every planning-corpus work item is built, reviewed, and
> integrated as a legible, auditable, memoized DAG; the planner may reassign what
> each lane builds, but it can never grow the graph.

**One-line scenario.** Planning docs + a repo snapshot + run config fan into a
work plan that assigns work to six fixed lanes; a shared foundation flows into all
six; a review gate rejects any unsafe lane; integration merges only the accepted
lanes; verification and a report/signpost index close it out.

## The invariant this teaches

> **The work plan may change lane CONTENTS; it may not mutate the GRAPH.**

- Work the six fixed lanes cannot own becomes `unassigned_work` on the work-plan's
  own truth (**never a 7th mounted node**). The expanded topology is frozen at
  **16 nodes**. `src/` ships the 6 authored contracts and mounts 6 nodes on its
  own; the 16-node topology is what the reference harness's per-lane expansion
  produces from them (see the Harnesses section of the repository README).
- A change to ONE lane's contents lights **one lane**; the five siblings stay dark
  (independent per-lane facet tokens).
- A change to the **foundation** fans out to **all six lanes once**: the
  intentional, auditable blast radius.
- A **rejected** lane never reaches integration.

## DAG sketch

```text
Planning Corpus (gateway: docs · repo · config)
        |
        v
Implementation Corpus
        |
        +-----------------------------+
        v                             v
Implementation Work Plan        Foundation Builder
   (facet per lane)              (shared-shapes facet)
        |                             |
        |                             v
        |                       Foundation Review
        |                             |
        +-------------+---------------+   (each lane subscribes to ITS
                      |                    work-plan facet + the foundation)
   +------+------+------+------+------+------+
   v      v      v      v      v      v
 SDK    SDK    SDK    Skill  Examples Docs        <- 6 FIXED construction lanes
World  Runtime Compile Contract /Test  /Signpost
   +------+------+------+------+------+------+
                      |
                      v
              Construction Review   (accept / REJECT a lane)
                      |
                      v
              Integration Builder   (merges accepted lanes ONLY)
                      |
                      v
              Verification Runner
                      |
              +-------+-------+
              v               v
        Signpost Index   Implementation Report
```

16 mounted nodes in the expanded topology; the planning inbox is a phantom
ingress edge, not a node.

## Conformance expectations

A conforming harness proves the expanded topology never grows, extra work remains
`unassigned_work`, lane-local changes wake one lane, foundation changes wake all
six lanes once, rejected work never integrates, and quiet replay adds no fresh
cost.

### Replay any run you produce

A run leaves a chain-verifiable state on disk that any conforming harness can
replay keyless:

```text
dispositions rendered=… · skipped=… · failed=0
surprise-cause  external=… · input=…
cost rollup (tokens) …   chain-verify ok
```

A replayed state holds the compiled topology and labels, the flat
chain-verifiable receipt ledger, and the per-node world-models, walking the
trajectory cold-boot → quiet → lane-local → foundation-fanout → review-blocks →
quiet bookend.

## Observable invariants

1. **Frozen artifacts.** In one harness's replay layout, `compile/topology.json`
   is a valid `TopologyWorldModel` (16 expanded nodes, a single entry gateway,
   `acyclic:true`), `labels.json` is present,
   `receipts.json` is a flat root file, and each `world-models/<hexNodeId>/` holds
   `published.json` + `versions/sha256_*.bin`.
2. **Dispositions.** Cold-start renders all 16 expanded nodes; a byte-identical re-wake
   memo-SKIPS them (a skip carries zero fresh and wakes nothing).
3. **`cost.surprise_cause === wake.source`** on every receipt (read off
   `ctx.wake.source`, never hardcoded).
4. **`ATOMIC_FACET`** for facet-less producers; no `"*"` token anywhere.
5. **Chain-verify.** `verifyReceiptChain` passes over every per-node chain.
6. **Byte-determinism.** A second generation yields identical
   `receipts.json` / `topology.json` / `labels.json` / `beats.json`.

Plus the tenet, encoded as IP00–IP06:

- **IP00**: extra work is `unassigned_work`, the expanded topology stays at 16 nodes.
- **IP03**: a lane-local change lights one lane; `propagationTargets` confirms the
  five siblings stay dark.
- **IP02**: a foundation change fans out to all six lanes.
- **IP04**: `construction-review` rejects the unsafe lane; the forbidden patch
  never appears in any `integrated_patch_set`.
- **IP06**: a no-change replay memo-skips the whole graph; `costRollup.total.fresh`
  does not move on a quiet re-wake and DOES move when a memo key moves.
