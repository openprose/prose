# DevTools replay fixtures

A **fixture** here is a saved, deterministic `<state-dir>` — the exact same shape
the SDK persists for a real run — that the devtools server replays. It is both the
**launch-demo replay input** and the **test corpus**.

A replayable state-dir has three things (plan R2 — a bare `receipts.json` is NOT
replayable):

```
<state-dir>/
  receipts.json            the durable append-only ledger trail
                           (opened with createFileSystemStorageAdapter +
                            FileSystemReceiptLedger → that IS replay)
  world-models/<node>/…    per-node published truth + version history
                           (FileSystemWorldModelStore; click-through reads it
                            via readVersion(node, receipt.fingerprints["@atomic"]))
  compile/topology.json    the flat TopologyWorldModel the SPA draws
                           (nodes / edges{subscriber,producer,facet} /
                            entry_points / acyclic) — MANDATORY for replay
```

## `masked-relay/` — the flagship fixture

A masked-relay graph (mirrors the SDK's `scenario/masked-relay`) chosen because it
exercises the full devtools vocabulary in ~12 nodes:

```
Signal Inbox (gateway, facet `ledger`)
   └─► Signal Ledger ──► Scout[price]   ┐
                     ├──► Scout[friction]├─► Viewport Masker  (facets view_e1 / view_e2)
                     └──► Scout[desire]  ┘        │
                              (3-way DIAMOND)     ├─ view_e1 ─► Expander 1 ┐
                                                  └─ view_e2 ─► Expander 2 ┤ (DIAMOND)
                                                           ┌── Critic[strong] ◄┘
                                                           └── Critic[weak]  ◄─┘
                                                                  │ (DIAMOND)
                                                        Insight Synthesizer ─► Diversity Auditor
```

What it proves for each devtools feature:

| Devtools feature | What the fixture provides |
|---|---|
| node **flash** (`rendered` + moved facet) | 46 rendered receipts across the cold boot + 3 surprise episodes |
| **dim pulse** (`skipped`) | 31 skipped receipts (the no-change re-wake memo-skips the whole relay) |
| **per-facet edge lights** | `inbox` (→gateway), `ledger` (→signal-ledger), `view_e1` (→expander-1), `view_e2` (→expander-2) — only the moved facet's lane lights |
| **diamond single-wake** | the masker (⊂ 3 scouts), the critics (⊂ both expanders), the synthesizer (⊂ the whole trail) each flash once per convergent change |
| **fresh-vs-reused $/token meter** | non-zero fresh tokens on every real render (cost scales with material digested), zero on every skip — total ~27k fresh / ~13k reused, bucketed by `surprise_cause` |

The episode is scripted (cold boot → new signal `S2` → no-change re-wake →
new signal `S3`) so the meter shows the contrast the launch video needs: **spikes
on surprise, a flat fresh-line + a field of dim pulses when quiet.**

### Determinism

Every render body is a pure function of (upstream truth read by reference, own
prior); the mask is a stable hash mod; the cost is a pure function of how much
moved. Two generations produce **byte-identical** `receipts.json` and
`topology.json` (asserted in `src/fixtures/masked-relay.test.ts`). The committed
fixture is therefore reviewable as a diff.

### Regenerate

The generator's first argument is the fixture **key** (NOT a directory); the
optional second argument is a custom output dir. The key for the observatory is
`observatory` (it writes the `fixtures/agent-observatory/` directory):

```bash
pnpm fixtures:gen                                   # → ALL committed fixtures
node dist/fixtures/generate.js masked-relay          # → fixtures/masked-relay
node dist/fixtures/generate.js observatory           # → fixtures/agent-observatory
node dist/fixtures/generate.js masked-relay /tmp/mr  # → a custom location
```

Valid keys: `masked-relay`, `observatory`, `monorepo-ci`, `news-desk`,
`inbox-triage`, `contract-redline`, `research-tree`.

Re-run after any change to a `src/fixtures/*.ts` generator and commit the result.

> **Shipped in the tarball:** only `masked-relay/` is in the package's npm `files`,
> so `reactor-devtools <pkg>/fixtures/masked-relay` works after a tarball install
> with no generation step. The other fixtures are repo-only — generate them from a
> checkout with the commands above.

### A note on the phantom ingress node

The trail contains 4 receipts for `ingress.signal-inbox` — the system's edge (a
webhook/source). It is **not** a `topology.nodes` entry (it is phantom), but it
**is** the `producer` of the gateway's `inbox` facet edge. The SPA should render
such edge-only producers as ingress/source nodes (drawn from the distinct edge
`producer` set, not just `topology.nodes`). This matches how a real `reactor`
state-dir represents external ingress.
