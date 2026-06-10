---
name: chain-auditor
kind: responsibility
---

### Goal

Stand as the audit surface over the masked-relay ledger: chain-verify the raw
on-disk receipts and prove the **honest boundary** the Reactor v1 receipt model
draws — tamper-EVIDENCE (a `prev`-linked, content-addressed trail catches a
mutated field) versus cryptographic NON-REPUDIATION (which the v1 null signer does
NOT provide). The auditor maintains a standing verdict over the trail; it renders a
fresh verdict only when the trail moves.

This responsibility teaches four facts as assertions, escalating in subtlety:

1. a naive cost-inflation edit that leaves the stale `content_hash` in place is
   CAUGHT — `verifyReceiptChain` fails;
2. re-stamping the edited receipt's public `content_hash` via
   `computeReceiptContentHash` makes the chain PASS again — and this is **honest
   book-keeping, not cryptographic non-repudiation**: with a null signer, anyone
   who can rewrite the file can also recompute the hash;
3. a forged `sig.scheme` (claiming a signed posture the run never had) is
   REJECTED;
4. the KNOWN BOUNDARY (the documented `world-model` integrity gap): editing a
   `world-models/<hex>/published.json` artifact while leaving `receipts.json`
   intact currently PASSES the receipts chain-verify, because the maintained truth
   sits outside the receipt integrity envelope. The audit asserts this CURRENT
   behavior so it cannot regress silently.

### Requires

- the materialized receipt `trail` from the `ledger-feed` gateway's `trail` facet

### Maintains

A chain-audit verdict over the masked-relay trail. Material: the verdict and its
evidence.

#### verdict

For every node in the trail, the result of `verifyReceiptChain` over that node's
`prev`-linked slice (`ok` / the list of errors), plus the recomputed
`content_hash` for each receipt via `computeReceiptContentHash` (the 41/41 public
recompute over the masked-relay ledger). A re-presentation of a byte-identical
trail does not move the verdict.

#### boundary

The honest, asserted limits of v1 receipt verification, kept as immaterial
documentary state so a doc-only edit does not falsely re-render the verdict:
tamper-evidence is NOT non-repudiation under a null signer; a re-stamped trail
heals the chain; and a `world-models/<hex>/published.json` edit with an intact
`receipts.json` is NOT caught by `receipts verify` today.

The auditor self-polices these postconditions before signing its verdict — there
is no separate judge beat. The verdict is read by reference against the prior
audit, never pre-stuffed.

### Continuity

- input-driven: wake when the gateway's `trail` facet moves. An unmoved trail
  fingerprint writes a `skipped` receipt that spawns nothing — the audit stops
  here; cost scales with surprise, not the clock. The audit never mutates the
  ledger it inspects, so a clean re-run is a flat-line.
