---
role: topology-wiring
summary: |
  How the responsibility DAG wires itself. Forme is a compile-phase render: it
  reads every declared contract, semantically matches each `### Requires`
  facet-contract to the `### Maintains` facet that satisfies it, draws the
  subscription edges, registers external-driven entry points, and emits the
  **topology world-model** — Forme's own maintained truth. The run-phase
  reconciler reads that topology's edges to propagate. Read this file to
  understand how the graph of responsibilities is resolved.
see-also:
  - contract-markdown.md: Contract file format (kinds, `### Requires`, `### Maintains`, `### Continuity`)
  - concepts/reactor.md: The compile (intelligent) / run (dumb) split and the reconciler
  - concepts/responsibility.md: The responsibility as a mounted DAG node
  - compiler/ir-v0.md: The compile-phase IR Forme's topology rides inside
  - responsibility-runtime.md: How the reconciler executes the resolved DAG
  - prosescript.md: Intra-node imperative composition (`call`) — the alternative to a subscription
  - guidance/tenets.md: Design reasoning behind the specs
---

# Forme — the DAG topology world-model

This document defines **Forme**: the compile-phase render that draws the
responsibility DAG. Forme reads the full set of declared contracts, resolves
each responsibility's `### Requires` needs to the producer(s) that satisfy them,
and emits the **topology world-model** — the resolved graph of subscriptions.
The run phase never re-derives wiring; it follows the topology Forme froze.

> **Forme is intelligent at compile, dumb at run.** Deciding *which node depends
> on which* — by reading what each node is *for* — is a judgment problem, not
> plumbing. Forme makes that judgment **once, when the contract set changes**, and
> freezes the result. At run time the reconciler only compares fingerprints
> against the edges Forme drew. Intelligence at resolution time; determinism at
> run time.

---

## Where Forme sits

A Prose system runs in two phases. Forme is a step of the first.

| Phase | Intelligence | What Forme does |
|-------|--------------|-----------------|
| **Compile** (fires on contract-set change) | smart | Forme resolves the DAG and emits the topology world-model |
| **Run** (fires on every wake) | dumb | the reconciler reads `topology.edges` to propagate; Forme is not invoked |

The compile phase is itself a sequence of **renders** — Forme is one of them,
alongside the canonicalizer-compiler and the postcondition-compiler. Because
Forme is a render, it has a contract (below), produces a world-model (the
topology), and signs a receipt — so every wiring decision is auditable and
re-runnable. The compile phase lowers declarations into deterministic artifacts;
the topology world-model is Forme's contribution to that bundle (the
compile-phase IR — see `compiler/ir-v0.md`).

**Forme wires the DAG only.** It does *not* wire agents inside a node. Inside a
render, composition is imperative ProseScript `call`; there is no intra-node
autowiring. DI lives at the scope where it earns its keep — the DAG, with its
emergent topology, self-healing, and rewiring on new sources — and is dropped
where it is overhead (inside a render). Imperative where it's small; autowired
where it scales.

---

## Forme's own contract

Forme is a render like any other, so it declares its interface as a contract.

- **`### Requires`** — *the set of all declared contracts.* Forme reads them
  through a privileged **read of the registry that is exempt from Forme's own
  wiring**. This exemption is what breaks the bootstrap regress: Forme's first
  render runs from the static mount, not from a DAG it has not yet drawn.
- **`### Maintains`** — *the topology schema* (below). Its postcondition is
  `acyclic: true`.
- **`### Continuity`** — self-driven by contract-set change. In v1 the compile
  phase runs as a batch step (operator / CI / watch re-runs it when contracts
  change). Mounting Forme so the reconciler wakes it on a
  contract-set-change receipt — *the fixpoint* — is a non-breaking later upgrade:
  the same Forme, given a wake-source. Mounting is additive.

---

## The topology world-model — Forme's output

Forme's maintained truth is the resolved DAG. It is a world-model like any other
— content-addressable, fingerprinted, subscribable. Its schema:

```ts
interface TopologyWorldModel {
  nodes:        readonly TopologyNode[];   // one per declared contract
  edges:        readonly TopologyEdge[];   // resolved subscriptions
  entry_points: readonly string[];         // external-driven node ids (gateways)
  acyclic:      boolean;                    // Forme's own postcondition
}

interface TopologyNode {
  node:                 string;            // node identity
  contract_fingerprint: Fingerprint;       // which contract version produced this node
  wake_source:          WakeSource;        // "input" | "self" | "external"
}

interface TopologyEdge {
  subscriber: string;                      // the node that declared the ### Requires need
  producer:   string;                      // the node whose ### Maintains facet satisfies it
  facet:      Facet;                       // the producer's facet (ATOMIC_FACET if none declared)
}
```

- **`nodes`** — every declared `responsibility` and `gateway`. (A `function` is
  *called*, not mounted, so it is never a topology node; a `pattern` is expanded
  at compile into nodes, then is gone; a `test` is tooling, not a node.)
- **`edges`** — one per resolved subscription:
  `subscriber.Requires.<facet-contract>` → `producer.Maintains.<facet>`. When a
  producer declares no facets, it exposes its atomic whole-truth as the one
  implicit facet (`@atomic`).
- **`entry_points`** — the external-driven nodes (gateways): the ways the system
  gets kicked off from outside.
- **`acyclic`** — `true` when the graph has no back-edge; this is a postcondition
  on Forme's own `### Maintains`, not a side check.

The reconciler reads `edges` to resolve propagation targets: on a `rendered`
receipt whose fingerprint moved, it wakes the downstreams subscribed to the
moved facet. This is the entire connection between compile and run — Forme freezes
the edges, the reconciler follows them.

---

## The wiring algorithm

When the contract set changes, Forme runs this resolution. Every step is part of
one render that writes the topology world-model.

### Step 1: Read every declared contract

Forme's `### Requires` is the full set of declared contracts, read through the
wiring-exempt registry read. For each contract extract:

- **Frontmatter:** `name`, `kind`.
- **`### Requires`** (responsibility) — the facet-level needs; the *match
  source*. Each entry names a facet-contract: a `Requires.<facet>` describing the
  upstream truth this node depends on (not a pointer to a specific node — *"I need
  a current view of competitor funding,"* not *"subscribe to node X"*).
- **`### Maintains`** (responsibility / gateway) — the world-model schema; the
  *match target*. Its declared **facets** are the named, independently-subscribable
  parts of the truth. A single-truth node declares none and exposes the implicit
  `@atomic` facet.
- **`### Continuity`** — the intrinsic wake-source declaration: input-driven
  (default), self-driven (a declared cadence), or external-driven (a gateway
  trigger). Forme *reads* this; it never infers a cadence or a trigger.

Only `responsibility` and `gateway` kinds become topology nodes. A `function`
has `### Parameters` / `### Returns` and is invoked by ProseScript `call` from
inside a render — it never appears in the DAG. A `gateway` is sugar for an
external-driven `responsibility`: it has no `### Requires` and its `### Maintains`
is the incoming truth.

### Step 2: Match `### Requires` ↔ `### Maintains` semantically

This is the one intelligent step. For each subscriber's `### Requires` facet-
contract, find the producer's `### Maintains` facet that satisfies it **by
understanding the contracts**, not by string-matching. If the subscriber requires
*"a current view of competitor activity"* and a producer maintains a
`competitor-activity` truth with a `funding` facet, understand the relationship
and draw the edge — even when the words differ.

String-matching would defeat the purpose of a smart wiring layer. Forme is
strictly more capable than a type-matching DI container: where a traditional
container needs an explicit qualifier to disambiguate, Forme reads the prose and
understands which truth satisfies which need.

For each matched need, draw a `TopologyEdge`:
`subscriber.Requires.<facet-contract>` → `producer.Maintains.<facet>` (the
matched facet, or `@atomic` when the producer declares none).

### Step 3: Honor deliberate fan-in (the diamond rule)

When a contract deliberately asks for *many* producers of the same kind of truth
(*"all sources of competitor funding"*), each satisfying producer becomes a
**distinct slot** in the subscriber's input tuple — one edge per producer. The
subscriber's `input_fingerprints` tuple then carries one slot per subscribed
facet, in a stable resolved order.

At run time this is the **diamond rule**: a node reachable by several paths
renders **once per distinct input-fingerprint tuple**, not once per inbound edge.
A move in any one slot wakes the subscriber once. Fan-in is first-class, not an
accident.

### Step 4: Surface conflicts as diagnostics — never guess

Forme never silently guesses a binding. Two cases are **surfaced wiring
diagnostics**, recorded in the topology so the wiring is inspectable:

- **Unsatisfied** — a `### Requires` facet-contract with no satisfying
  `### Maintains` producer. Forme reports the need and the contracts it
  considered.
- **Ambiguous** — two or more equally-plausible producers for one need, where the
  downstream behavior would materially differ. Forme reports the candidates and
  does not pick.

Do not fail merely because a match is semantic rather than exact — that is the
normal, intended case. Surface a diagnostic only when the semantic evidence is
insufficient to choose a responsible binding. (The exact diagnostic boundary —
wire / ambiguous / unsatisfied — is pinned when Forme is built; the principle is
fixed: never a silent guess.)

### Step 5: Register entry points

The **entry points** are exactly the nodes whose `### Continuity` is
external-driven — the gateways. Forme finds them by reading declared
`### Continuity`, never by inferring a trigger. The intent (the trigger) stays
with the human; the mechanism (the wiring) is Forme's. Add each external-driven
node id to `entry_points`.

### Step 6: Enforce acyclicity as a postcondition

*"Is this a DAG?"* is a **postcondition on Forme's own `### Maintains`**, not an
afterthought. A topology that would close a loop — A requires what B maintains
while B requires what A maintains — is **rejected and surfaced as a diagnostic**,
not wired into a non-terminating loop. Set `acyclic: false` and emit the cycle as
a diagnostic for the author; the compile step does not produce a usable topology
until the cycle is broken.

**A back-edge is not feedback.** Legitimate feedback — a node's output shaping its
*next* input — is **not** a graph cycle. It is **self-driven `### Continuity`**: a
node waking itself on its clock to re-examine its own prior world-model. A node
never subscribes to its own facet; such a relationship is time, not an edge.
**Loops live in time, not in edges** — and the acyclicity check must not mistake
one for the other. (The reactor's deterministic cycle detector is reused
unchanged as this postcondition; see `concepts/reactor.md`.)

### Step 7: Rewire on a better or dead source (self-healing)

When a better source appears, or a live producer dies, Forme **rewires**. Because
Forme runs as a render with a receipt, every switchover is **audited and
self-healing**: the topology world-model gains a new version, and the receipt
chain records the rewire. The resolved graph is cached, inspectable, and pinnable;
Forme re-renders only when the *set of contracts* changes, not on every wake.

### Step 8: Emit the topology world-model

Forme writes the resolved `TopologyWorldModel` as its world-model and signs a
receipt. The topology travels inside the compile-phase IR (`CompilePhaseIR.topology`)
alongside the per-node canonicalizers and postcondition validators that the other
compile-step renders produce (see `compiler/ir-v0.md`). The reconciler reads the
topology's `edges` to schedule and propagate.

---

## What Forme retired

Forme used to be a SKILL-phase dependency-injection container that wired
*services within a `system`* and emitted a per-system manifest, with three
levels of author control. That scope and layer are both gone:

- **Scope:** intra-`system` service wiring → the **responsibility DAG**. There is
  no `system` kind — composition is intra-node `call` (ProseScript) or a
  cross-node subscription, never a third internally-autowired graph kind.
- **Layer:** a SKILL-phase manifest compiler → a **compile-phase render** producing
  the topology world-model. The per-system `manifest.next.json` / `formeManifests`
  concept is retired; the topology world-model replaces it.
- **Retired sections / controls:** `### Wiring` (deleted with `system`); the old
  Level-2 (`### Wiring`) and Level-3 (`### Execution`-as-wiring) author-control
  levels; the per-system manifest format. The author declares the *need*
  (`### Requires`) and the *wake-source* (`### Continuity`); Forme infers the
  *wiring*. That is the clean boundary — and the only one.

The wiring *judgment* survives — semantic `Requires ↔ Maintains` match, fan-in
slots, conflict diagnostics, rewire, acyclicity. Its scope, output, and layer are
what changed.

---

## Summary

Forme, the DAG topology world-model:

1. **Reads** every declared contract (its `### Requires` is the full set,
   wiring-exempt).
2. **Matches** each subscriber's `### Requires` facet-contract to the producer's
   `### Maintains` facet that satisfies it — semantically, never by string.
3. **Draws** one `TopologyEdge` per resolved subscription; deliberate fan-in adds
   a slot per producer (the diamond rule).
4. **Surfaces** unsatisfied and ambiguous matches as diagnostics — never a silent
   guess.
5. **Registers** external-driven nodes (gateways) as entry points, read from
   declared `### Continuity`.
6. **Enforces** acyclicity as a postcondition on its own `### Maintains`;
   self-driven feedback is time, not an edge.
7. **Rewires** on a better or dead source — each switchover an audited render.
8. **Emits** the topology world-model into the compile-phase IR; the reconciler
   reads its edges to propagate.

Intelligence at resolution time; determinism at run time. The edges of the DAG
are Forme's output, not human-authored config.
