# tamper-forge

**Standing goal:** stand a regulated-audit lens over an existing, frozen receipt
ledger and keep a living verdict on its integrity, proving exactly what the
v1 receipt model _does_ and _does not_ guarantee, so an auditor (or an agent)
never over-claims.

**One-line scenario:** replay the **masked-relay** ledger (41 receipts / 13
node-chains), then run a guided 3-attack escalation against it: a naive
cost-inflation edit is caught, a public-hash re-stamp heals the chain (honest
book-keeping, _not_ cryptographic non-repudiation under the v1 null signer), a
forged signature is rejected, and finally assert the **known integrity boundary**
so it can never regress silently.

This is an **audit/replay lens, not a new DAG.** It teaches **chain-verify** and
the honest **tamper-evidence vs non-repudiation** line. It **depends on
`masked-relay`**: it lenses the masked-relay receipt ledger, so the trail it
audits is byte-identical to the one masked-relay produces.

## DAG sketch (the lens, 2 nodes)

```text
Ledger Feed (gateway, external-driven)
    |  trail            the masked-relay receipts.json, read-only, as evidence
    v
Chain Auditor (responsibility)
    - verdict   : verifyReceiptChain over all 13 per-node chains + 41/41
                  computeReceiptContentHash recompute
    - boundary  : the asserted honest limits (immaterial documentary state)
```

The lens itself is tiny; the _subject_ it audits is the full 12-node masked-relay
graph, replayed unchanged. The feed exposes the trail on its `trail` facet; a
byte-identical re-read does not move it, so a clean re-audit memo-**skips**
(`fresh 0`: cost scales with surprise, not the clock).

## The lesson: the three attacks + the boundary

|         | attack                                                                                                                                                                            | primitive                   | outcome                                                                                                                                                                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a)** | inflate `cost.tokens.fresh`, keep the stale `content_hash`                                                                                                                        | `verifyReceiptChain`        | **CHAIN-VERIFY FAILED**: the body no longer hashes to its recorded `content_hash`                                                                                                                                                                                                               |
| **(b)** | **full forward re-stamp**: recompute the public `content_hash` via `computeReceiptContentHash` _and_ relink every successor's `prev` to the new hash, node by node down the chain | `computeReceiptContentHash` | chain **PASSES** again, **honest book-keeping, NOT non-repudiation**: a _single_ receipt re-stamp would orphan the next receipt's `prev` and still FAIL; only re-stamping forward through the whole chain heals it, and under the v1 null signer, whoever rewrites the file can do exactly that |
| **(c)** | forge `sig.scheme` (claim a signed posture the run never had)                                                                                                                     | `verifyReceipt`             | **REJECTED**: `sig.scheme must be "none"`; the null signer is the only honest v1 state                                                                                                                                                                                                          |
| **(d)** | edit a `world-models/<hex>/published.json` artifact, leave `receipts.json` intact                                                                                                 | `verifyReceiptChain`        | **STILL PASSES**: the documented integrity gap: the maintained truth (the world-model artifact layer) sits _outside_ the receipt envelope, so chain-verify does not cover it. Asserted as **current** behavior so it can't regress silently                                                     |

**The honest boundary, stated plainly:** v1 receipts are **tamper-evident**
(a `prev`-linked, content-addressed trail catches an accidental or careless
mutation of a _receipt_ field); they are **not** cryptographic **non-repudiation**
(the v1 signer is null; a re-stamped trail heals; the world-model artifact layer is
not covered). Never let an audit claim more than (a)–(d) prove.

**Exit codes (CI-safe):** chain verification must report a broken or unreadable
chain as failure, never a green result for zero receipts.

## Replay it keyless (the universal "aha")

A run leaves a chain-verifiable, keyless state on disk (the masked-relay ledger
this lens audits). Any conforming harness can replay it:

```text
dispositions rendered=… · skipped=… · failed=0
chain-verify ok        <- the honest baseline the attacks then break
```

## Conformance expectations

A conforming harness proves a stale-hash edit breaks the chain, a complete
forward re-stamp heals it, a forged signature scheme is rejected, and tampering
with a world-model outside the receipt envelope remains outside chain coverage.

## Observable invariants

1. compiles to the frozen artifact set (valid `TopologyWorldModel`, single entry
   gateway, acyclic; `labels.json` + flat `receipts.json` + `world-models/<HEX>/…`
   - `beats.json`);
2. cold-start renders all; an identical re-wake **skips all** (a skip propagates
   nothing, wakes nothing);
3. `cost.surprise_cause === wake.source` on every receipt;
4. `ATOMIC_FACET` for facet-less producers; no `"*"` tokens anywhere;
5. **chain-verifies**: `verifyReceiptChain` passes over the raw on-disk receipts,
   then attacks (a)/(c) **break** it and (b) **heals** it via the public recompute;
6. **boundary (d)**: a tampered world-model artifact with an intact `receipts.json`
   STILL passes receipts verify (asserted so it can't regress);
7. byte-deterministic: a second generation yields identical
   `receipts.json` / `topology.json` / `labels.json` / `beats.json`, and the
   audited `receipts.json` is byte-identical to the masked-relay ledger it lenses.

Because this lens re-uses the masked-relay generator as its subject, the audited
ledger never drifts from the masked-relay trail.
