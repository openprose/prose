---
kind: responsibility
id: contract-registry
---

# Contract Registry

Parses the contract source ledger into a stable, content-addressed registry of
contracts: each contract's id, kind, declared `Requires` facets, declared
`Maintains` facets, continuity mode, and any parse errors. Stable contract IDs
are preserved across path moves when content identity is clear, so renaming a
file does not churn the topology.

The registry is the **middle ring of The Cradle**: it turns raw source bytes
into the structured contract set that Forme resolves into a graph. It does not
itself decide the topology — it only reports what the contracts *say*.

### Requires

- the current `ContractSourceLedger` (atomic) from **Contract Source Files**

It reads its own prior `ContractRegistry` by reference to preserve stable IDs.

### Maintains

`ContractRegistry` — the structured contract set.

```
ContractRegistry {
  contracts: [
    { contract_id, kind, source_path, contract_fingerprint,
      requires_facets, maintains_facets, continuity_mode, parse_errors }
  ],
  contract_set_fingerprint,
  deleted_contracts
}
```

#### contract-set

The structured contract set and its `contract_set_fingerprint`. This facet moves
**only when the material contract set changes** — a new responsibility, a
changed `Requires`/`Maintains`, a deletion. It is the single facet the Topology
Maintainer subscribes to.

### Continuity

- input-driven: wake when the `source_set_fingerprint` of the **Contract Source
  Files** gateway moves.
- self-driven: read the prior `ContractRegistry` by reference to preserve stable
  contract IDs across path moves when content identity is clear.
- Skip when the source set is unchanged — an immaterial source edit (a reflowed
  comment, trailing whitespace) never reaches here, so the contract-set facet
  holds and Forme memo-skips downstream.
