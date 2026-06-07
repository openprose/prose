# tamper-forge

**Standing goal:** stand a regulated-audit lens over an existing, frozen receipt
ledger and keep a living verdict on its integrity, proving exactly what the
Reactor v1 receipt model _does_ and _does not_ guarantee, so an auditor (or an
agent) never over-claims.

**One-line scenario:** replay the **masked-relay** ledger (77 receipts / 13
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
    - verdict   : verifyReceiptChain over all 13 per-node chains + 77/77
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

**The honest boundary, stated plainly:** Reactor v1 receipts are **tamper-evident**
(a `prev`-linked, content-addressed trail catches an accidental or careless
mutation of a _receipt_ field); they are **not** cryptographic **non-repudiation**
(the v1 signer is null; a re-stamped trail heals; the world-model artifact layer is
not covered). Never let an audit claim more than (a)–(d) prove.

**Exit codes (CI-safe in both modes):** `reactor receipts verify` returns a
non-zero exit on a broken chain, and the `--json` form
(`reactor --json receipts verify`) exits non-zero on a broken chain too, so a CI
gate can rely on the exit code whether or not it asks for JSON output. (An
empty/unreadable ledger is also a non-zero exit, never a green "ALL OK" on zero
receipts.)

## Replay it keyless (the universal "aha")

A `reactor run` (or `reactor serve`) writes a chain-verifiable, keyless state-dir
(the masked-relay ledger this lens audits). Point the devtools at it:

```sh
reactor-devtools <state-dir> --describe
#   dispositions rendered=… · skipped=… · failed=0
#   CHAIN-VERIFY ok        <- the honest baseline the attacks then break
```

## The reactor flow (compile → run from the contract)

The `.prose.md` contract under `src/` works with any harness; these verbs steer to
the Reactor harness.

### Offline (no key needed)

```sh
reactor doctor                 # honest health report (the best command in the kit)
reactor compile --check        # exits 1 (stale) until the audit lens is compiled
reactor topology               # the compiled lens once frozen (2 nodes)
reactor --state-dir <state-dir> receipts verify  # exits non-zero on a broken chain
```

### Live (needs OPENROUTER_API_KEY + @openai/agents + zod)

```sh
reactor compile                # the SKILL session compiles src/ → the IR cache
reactor run                    # boot the auditor over the frozen ledger
reactor serve                  # stand the audit up; re-wake it on a new trail
```

## What the offline check proves

The example is covered by the project's offline test suite, which drives the REAL
`@openprose/reactor` reconciler with deterministic fake renders (no key) and
asserts the validity contract **plus** the four audit facts:

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
