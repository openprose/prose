---
role: visual-compile-source
summary: |
  The **typed image**: a pixel-only visual source that an intelligent compile
  resolve turns into Prose contracts. A multi-node image is a visual *projection
  of a Forme topology world-model* (`forme.md`); inverting that projection
  reconstructs the `### Requires`/`### Maintains` graph. The image sits one rung
  ABOVE Contract Markdown in the derivation chain — a brief, not a binary. It is
  "well-typed" not by a parser but by **compilation succeeding**: the resolve
  emits `.prose.md`, a human ratifies it, and the normal compile (Forme +
  canonicalizer + postcondition) runs unchanged. Read this to compile or run an
  image source.
see-also:
  - contract-markdown.md: The `.prose.md` the resolve EMITS (kinds, `### Requires`, `### Maintains`, `### Continuity`)
  - forme.md: The topology world-model a multi-node image is a visual projection of
  - compiler/ir-v0.md: The compile IR the topology rides inside
  - compiler/index.prose.md: The compiler the resolve hands its emitted contracts to
  - reactor.md: `prose react <image>` — take a visual brief to a running Reactor
  - guidance/authoring.md: Ratifying the emitted contracts (the `prose write` discipline)
---

# The Typed Image — a visual Prose source

A **typed image** is an ordinary raster picture (`.png`/`.svg`) that carries
*no* embedded metadata, archive, or hidden payload — **pixels only** — yet holds
enough visual information for an intelligent compile *resolve* to reconstruct a
runnable Prose system. The picture is the human-facing surface; the contracts
are what runs.

> **It is a source ABOVE markdown, not a runtime input.**
>
> ```
> image → (resolve = prose write) → *.prose.md → (compile) → IR → (run) → receipts
>         └ lossy, generative, ratified ┘   └─ deterministic, content-addressed ─┘
> ```
>
> The resolve **emits Contract Markdown as its artifact**; a human ratifies it;
> *that* becomes the durable intent. Tenet 1 ("Markdown is intent") is preserved
> exactly — the image is a *brief*, the contracts are the *spec*, the IR is the
> *binary*. All model latitude is quarantined to authoring time, the rarest event
> in the system, identical to where `compile` already puts it.

## Why the picture earns its place

A DAG drawing is a *better* notation than prose for the half of a contract that
is hard to write, and a worse one for the half that is easy:

- **Structure** — nodes, directed edges, fan-out, diamonds, layering — is
  tedious and error-prone in markdown (it is the whole reason Forme must
  semantically match `### Requires` ↔ `### Maintains`). A picture conveys it at a
  glance.
- **Intent nuance** — the exact postcondition, the freshness window — pixels can
  only gesture at. Prose owns it.

So a typed image lets the **image own the structural/temporal skeleton** and
**text-inside-the-boxes own the semantic intent**. The picture is a schematic
(think circuit diagram or score), where labels and glyphs are load-bearing — not
decoration.

## The type

The type is **conceptual and loose by design** — it is not a byte schema. An
image is well-typed iff:

1. **`resolve(image)` yields a contract set that compiles** — Forme draws a
   topology and asserts its postcondition `acyclic: true`.
2. **The round-trip is stable** — re-rendering the emitted topology
   (`compile` → `topology.json` → the devtools/Forme render) and re-resolving it
   lands on the same topology fingerprint, modulo prose paraphrase of goals.

`prose compile <image>` **is** the typechecker. A picture that cannot be
resolved into a compiling, acyclic, round-trip-stable contract set is ill-typed,
and the resolve must say so (see *Pin-or-interrupt*), never guess a graph into
existence.

## Scope tiers (the type is parameterized by box count)

| Scope | Boxes | Resolves to | Verb |
|-------|-------|-------------|------|
| **System** | many | a Forme graph of `kind: responsibility`/`gateway` contracts + `reactor.yml` | `prose react <image>` / `prose compile <image>` |
| **Single responsibility** | one | one `kind: responsibility` contract | `prose compile <image>` |
| **Single function** | one | one `kind: function` (a visual signature + intent) | `prose compile <image>` → `prose run` |

The type predicate is identical across tiers; only the box count changes. A
single-node image is the N=1 case — a visual contract, not a visual graph.

## Requirement tiers — what the pixels must carry

### 1. Required (structural — must be visually unambiguous)

The resolve must be able to read each of these directly off the pixels. If any
is ambiguous, the image is ill-typed.

| Visual channel | Graph semantics |
|----------------|-----------------|
| Box + label | a node, with a stable identity from its label text |
| Box style (color / border / icon / badge) | `kind`: gateway (ingress) · responsibility · function · terminal |
| Directed edge (arrowhead) | a subscription; the arrow is evidence flow |
| Edge label on a multi-out edge | *which facet* is subscribed — the materiality partition (e.g. `funding` / `hiring` / `launches`) |
| Fan-out / fan-in / diamond geometry | the memo structure: independent facets → independent wake lanes; a diamond → dedup/collapse |
| Left→right layering | reconcile depth / order |
| Overall acyclicity | the picture must read as a DAG |

> A single labeled fan-out can encode an invariant that is a paragraph of prose.
> `competitor-monitor —funding→ deal-desk` plus `—hiring→ recruiting` plus
> `—launches→ product-radar` says: the monitor `### Maintains` three independent
> facets, each consumer `### Requires` exactly one — so a funding-only change
> wakes only `deal-desk` and the other lanes memo-skip. That is
> cost-scales-with-surprise, drawn.

### 2. Pin-or-interrupt (safety — read an explicit mark, or refuse)

These are safety-load-bearing: a wrong freshness window is silent staleness or
runaway spend; a wrong postcondition admits a corrupt commit. The resolve must
read them from an **explicit visual annotation** or **interrupt** — emit the
standard "this sentence is not yet decidable" `failed`/`needs-input` receipt
routed to the author. It may **not** invent them.

| Visual annotation | Contract element |
|-------------------|------------------|
| Clock / timer glyph, e.g. `+15m` | `### Continuity` `valid_until` freshness |
| Postcondition glyph / checklist in a box | `### Maintains` admissibility checks |

### 3. Elaborated (the resolve authors; the human ratifies)

Given the structural skeleton pinned, the resolve may author these from context,
and they come back as ordinary `prose write` output for ratification:

- The **Goal** sentence per node (a node named `competitor-monitor` between a
  news gateway and funding/hiring/launches consumers all but writes its own).
- The **Maintains** body prose around the pinned facets.

### Out of scope (deliberately NOT in the image)

- **Connector bindings** — which URL/queue a gateway actually reads. That is a
  deployment fact (adapters are the only reason hosts differ); the picture says
  "this ingress exposes a facet per source," the *which* is wired at serve time.
- **Receipts / world-models / the ledger** — runtime trail, never source.

## Handling in `compile` and `run`

The image adds exactly **one resolve render at the front of compile**; nothing
downstream changes.

### `prose compile <image.png> [--out <dir>]`

1. **Detect** the image format (Format Detection table → load this doc +
   `forme.md` + `compiler/index.prose.md`).
2. **Resolve** — run a vision render (the `prose write`-from-image session) that
   reads the pixels against this doc's requirement tiers and **emits `.prose.md`
   contract(s)** into `<openprose-root>/src/`. Pin-or-interrupt failures surface
   as receipts, not guesses. Per the `prose write` discipline, the emitted
   contracts are **shown for ratification** and not silently applied beyond
   `src/`.
3. **Compile** — hand the emitted contracts to the normal compile pipeline
   (Forme topology + per-node canonicalizer + postcondition validators) and emit
   the IR to `<openprose-root>/dist/`, exactly as a text compile does.

`prose compile <image>` is thus `prose write`-from-image fused with the ordinary
compile — and the act of compiling is what typechecks the picture.

### `prose run <image.png>`

`run` already does a compile step. For an image, that compile step *includes the
resolve*. So `run <image>` = resolve → compile → reconcile. A single-node
`kind: function` image runs as a called helper; a `kind: responsibility`/system
image mounts a DAG (refuse a bare `prose run` on a lone `kind: gateway`, same as
text).

### `prose react <image.png> [--start]`

The most natural verb: `react` already takes an English standing goal to a
running Reactor. An image is the **visual** peer of that brief — resolve →
author contracts + `reactor.yml` → `compile → serve` → show the devtools replay.

## Honest limits

- **Resolution is generative, not deterministic.** Model A and model B may
  resolve the same picture differently — the same cross-model *materiality
  parity* question the harness already names as its sharpest open edge. It is
  made safe the same way: resolution is a compile-time act, its output is a
  reviewable content-addressed artifact, and the run phase is the dumb
  deterministic reconciler over the frozen IR.
- **Semantic-drift nodes** (no cheap stable identity) can have field-level
  materiality the pixels can only point at; there the image pins structure and
  the resolve interrupts for the intent it cannot safely infer.
- **A screenshot of a graph is not a typed image** unless it was *authored* to
  carry the required tiers. A bare topology render omits freshness and
  postconditions — it resolves to a structurally-correct skeleton with
  interrupts on every safety-bearing blank.
