---
name: contract-source-files
kind: gateway
version: 0.15.0
id: contract-source-files
---

# Contract Source Files

The external entry point for the harness's own wiring: a file watcher (or a
scheduled scan) over the OpenProse contract sources — the `.prose.md`
responsibility, gateway, and `function` files plus the operator pin files. When
contract source content changes, this gateway wakes and republishes the latest
source ledger.

This is the **outermost ring of The Cradle**: a change to the *contracts that
describe the graph* enters here, never inside the graph it describes.

### Maintains

`ContractSourceLedger` — the latest observed set of contract source files.

```
ContractSourceLedger {
  sources: [
    { path, mtime, content_fingerprint, kind, changed_sections }
  ],
  source_set_fingerprint
}
```

The `content_fingerprint` is over the **material** contract body only. An
immaterial edit (a reflowed comment, trailing whitespace) leaves
`content_fingerprint` — and therefore `source_set_fingerprint` — unmoved, so the
registry downstream memo-skips.

### Continuity: external-driven

External file watcher or scheduled scan. This gateway is an **entry point**:
wake when contract source content changes. It has no `### Requires` — its truth
comes from outside the reactor.
