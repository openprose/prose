---
role: compile-phase-ir-contract
summary: |
  Canonical compile-phase IR contract for `prose compile`. Load this before
  emitting or validating `dist/manifest.next.json`. The IR carries the
  compile-phase OUTPUTS — the topology world-model, per-node canonicalizers,
  per-node postcondition validators, and frozen contract fingerprints — NOT a
  judge-era activations/criteria manifest.
see-also:
  - index.prose.md: ProseScript compiler program
  - ../responsibility-runtime.md: Compile/run reconciler doctrine
  - ../forme.md: Forme wiring semantics (the topology world-model)
  - ../concepts/reactor.md: The fingerprint-comparison reconciler
---

# Compile-Phase IR

The compile-phase IR is generated JSON for the dumb reconciler. It is not an
authoring surface. Keep authored intent in Markdown; keep compiled intent in
JSON.

This is **the compile-phase seam**: the compile phase emits it on contract-set
change, the run phase (the reconciler) consumes it, and this doc authors to it.
There is no judge, no verdict, no pressure, and no fulfillment activation in the
IR. Commit-gating is compiled postcondition validators plus render
self-attestation, never an LLM judging "did this change" at wake time
(`world-model.md` §3; `architecture.md` §3.3).

The IR is the JSON realization of the `CompilePhaseIR` shape in
`packages/reactor/src/shapes/index.ts` (the shared shapes spine), wrapped in a
thin doc envelope of `sources` and `diagnostics`. Where this doc and that TS
shape disagree, the TS shape wins.

Emit only the fields listed here. Unknown notes, provider details, payload
shape, confidence, and source commentary belong in `diagnostics`, not in custom
IR fields.

## Top Level

```json
{
  "kind": "openprose.compile-phase-ir",
  "version": 2,
  "sources": [],
  "topology": {
    "nodes": [],
    "edges": [],
    "entry_points": [],
    "acyclic": true
  },
  "canonicalizers": [],
  "postconditions": [],
  "contract_fingerprints": {},
  "diagnostics": []
}
```

All fields must be present. `kind` is the literal
`"openprose.compile-phase-ir"`. `version` is the integer `2` (it tracks the
SKILL `runtime_contract`, which the format re-cleave bumped from `1` to `2`).
`sources`, `canonicalizers`, `postconditions`, and `diagnostics` are arrays.
`topology` is a single object. `contract_fingerprints` is an object map.

Paths are root-relative, forward-slash paths with no empty, current, parent, or
absolute segments.

## Fingerprints

A **fingerprint** is a string token that changes if and only if the
semantically-material content changed (`world-model.md` §3). The reference
computation is `sha256:<64 lowercase hex>` — a content address over a canonical
serialization. The IR carries fingerprints as opaque strings; the reconciler
only ever *compares* them.

Three fingerprints of meaning appear (`world-model.md` §4): the
**contract-fingerprint** of each node's own contract, the **input-fingerprint**
of each upstream facet a node subscribes to, and the **world-model-fingerprint**
of a node's own published truth. The compile phase freezes the first;
the run phase observes the other two on receipts.

A facet is a named, independently-subscribable part of a node's truth. The
reserved facet `"@atomic"` is the whole-truth fingerprint; a node that declares
no facets exposes the singleton `{ "@atomic": token }` map. Facet arrays in this
IR always include `"@atomic"`.

## Sources

```json
{ "path": "src/competitor-monitor.prose.md", "kind": "responsibility", "name": "competitor-monitor" }
```

`sources` is the discovered contract set the compile phase read. Allowed `kind`
values: `responsibility`, `function`, `gateway`, `pattern`, `test`, `unknown`.
`name` is optional.

There is no `system` kind and no `service` kind. Composition is intra-node
ProseScript `call` or a cross-node subscription, never an internally-autowired
graph kind (`plan.md` §3; `architecture.md` §7.1). A `kind: function` is a
called helper with no world-model and no node identity; functions appear in
`sources` only when discovered, and never appear as topology nodes.

## Topology

The topology world-model is Forme's output: the resolved DAG drawn from the
contract set (`architecture.md` §6.3, §3.1). It is a maintained truth like any
other. The reconciler reads `edges` to resolve propagation targets.

```json
{
  "nodes": [
    {
      "node": "competitor-monitor",
      "contract_fingerprint": "sha256:0000000000000000000000000000000000000000000000000000000000000001",
      "wake_source": "input"
    }
  ],
  "edges": [
    {
      "subscriber": "risk-brief",
      "producer": "competitor-monitor",
      "facet": "funding"
    }
  ],
  "entry_points": ["stargazer-events"],
  "acyclic": true
}
```

### nodes

Each node is one mounted producer (a `responsibility` or `gateway`). Required
fields: `node` (the node identity — its stable name), `contract_fingerprint`
(the frozen fingerprint of its contract/source), and `wake_source`.

`wake_source` is one of `input`, `self`, or `external`
(`world-model.md` §5): input-driven by default, self-driven when `### Continuity`
declares a cadence, external-driven for a gateway. It is the node's intrinsic
wake-source declaration, carried from `### Continuity`.

Functions are never nodes. Patterns expand into nodes at compile time; the
expanded responsibilities appear here, the pattern source does not.

### edges

Each edge is one resolved subscription:
`subscriber.Requires.<facet-contract>` → `producer.Maintains.<facet>`. Required
fields: `subscriber` (the consuming node), `producer` (the producing node),
`facet` (the producer facet consumed; `"@atomic"` when the producer declares no
facets). `subscriber` and `producer` must be `node` ids present in `nodes`.

Fan-in (one need, many producers) is several edges with the same `subscriber`
and `facet`-contract but different `producer`s; each adds a slot to the
subscriber's input tuple (`architecture.md` §3.1). Edges are not a step list and
carry no ordering; propagation order falls out of the DAG.

### entry_points

`entry_points` lists the `node` ids that are external-driven ingress points
(gateways) — the nodes a webhook / cron / manual trigger turns into an edge
receipt at the system's edge (`world-model.md` §5). Every entry point must be a
`node` with `wake_source: "external"`.

### acyclic

`acyclic` is Forme's own acyclicity postcondition over `edges`
(`architecture.md` §3.1). It is computed by the deterministic cycle check
(`packages/reactor/src/cycle` `detectReceiptCycles`, the kept-half kernel DFS).
The acyclicity check rejects *graph* cycles only; legitimate feedback (a node's
output shaping its *next* input) is self-driven `### Continuity`, not a
back-edge — loops live in time, not in edges. When a contract set is
irreducibly cyclic, `acyclic` is `false` and a `severity: error` diagnostic
names the cycle; the compiler does not write the IR.

## Canonicalizers

One canonicalizer per node. The canonicalizer is the compiled, deterministic
lowering of the node's `### Maintains` canonicalization spec; it travels with
the compiled contract and a standalone render applies it locally to fingerprint
its own receipt (`architecture.md` §3.2, §1). `canonicalizer(world-model) →
fingerprints`.

```json
{
  "node": "competitor-monitor",
  "artifact": "dist/canonicalizers/competitor-monitor.js",
  "facets": ["@atomic", "funding", "hiring", "product-launches"]
}
```

Required fields: `node` (a node id present in `topology.nodes`), `artifact`
(a root-relative locator for the compiled canonicalizer artifact), and `facets`
(the facet boundaries the canonicalizer emits). `facets` always includes
`"@atomic"`; a leaf truth that declares no facets has `facets: ["@atomic"]`.

The `facets` listed here are the producer side of the `edges`: every
`edge.facet` whose `producer` is this node must appear in this node's `facets`.

The **structured-backing rule** (`architecture.md` §3.2; `world-model.md` §3):
anything subscribed must have a structured, canonicalizable backing. Free-form
rendered prose is a derived projection excluded from the fingerprint. The
compiler lints subscribed fields without structured backing and surfaces them as
a diagnostic.

## Postconditions

One postcondition validator per node. The folded-in `### Criteria` compile to
validators (`architecture.md` §3.3). There is no separate judge beat.

```json
{
  "node": "competitor-monitor",
  "artifact": "dist/postconditions/competitor-monitor.js",
  "mode": "deterministic"
}
```

Required fields: `node` (a node id present in `topology.nodes`), `artifact`
(a root-relative locator for the compiled validator artifact), and `mode`.

`mode` is one of:

- `deterministic` — the harness verifies the validator on commit; a render that
  fails verification commits nothing and writes a `failed` receipt. The
  deterministic engine is `packages/reactor/src/cycle` `evaluatePredicate`.
- `render-attested` — the postcondition is irreducibly semantic; the render
  self-polices it before signing.

Either way there is no LLM in the wake/commit decision.

## Contract Fingerprints

`contract_fingerprints` is a `{ node → fingerprint }` map: the per-node contract
fingerprints frozen at compile time (`architecture.md` §6.1; `world-model.md`
§4). Every `node` id in `topology.nodes` must have an entry, and each entry must
equal that node's `contract_fingerprint`. Editing a node's `### Maintains` (or
any material part of its contract) moves its contract fingerprint, which causes
a memo miss and a forced render at run time (`architecture.md` §8: "schema
migration = a forced render").

These are the first half of the memo key `(contract_fingerprint,
input_fingerprints)` — and nothing else is in the key (`world-model.md` §4).

## Diagnostics

```json
{
  "severity": "warning",
  "message": "Subscribed field `summary` has no structured backing; it is excluded from the fingerprint.",
  "sourcePath": "src/competitor-monitor.prose.md"
}
```

Allowed severities: `info`, `warning`, `error`. `sourcePath` is optional and
must reference a discovered source when present.

The compiler program must not write `manifest.next.json` when any diagnostic
has severity `error` (e.g. an ambiguous Forme match, an unsatisfied
subscription, or a cyclic contract set). Warnings and info diagnostics may be
written with a valid IR.

A wiring failure is always a surfaced diagnostic, never a silent guess: no
producer for a `### Requires` facet, or an ambiguous match between candidate
producers, is reported (`architecture.md` §3.1).

## Compact Valid Example

```json
{
  "kind": "openprose.compile-phase-ir",
  "version": 2,
  "sources": [
    {
      "path": "src/competitor-monitor.prose.md",
      "kind": "responsibility",
      "name": "competitor-monitor"
    }
  ],
  "topology": {
    "nodes": [
      {
        "node": "competitor-monitor",
        "contract_fingerprint": "sha256:0000000000000000000000000000000000000000000000000000000000000001",
        "wake_source": "self"
      }
    ],
    "edges": [],
    "entry_points": [],
    "acyclic": true
  },
  "canonicalizers": [
    {
      "node": "competitor-monitor",
      "artifact": "dist/canonicalizers/competitor-monitor.js",
      "facets": ["@atomic"]
    }
  ],
  "postconditions": [
    {
      "node": "competitor-monitor",
      "artifact": "dist/postconditions/competitor-monitor.js",
      "mode": "render-attested"
    }
  ],
  "contract_fingerprints": {
    "competitor-monitor": "sha256:0000000000000000000000000000000000000000000000000000000000000001"
  },
  "diagnostics": []
}
```
