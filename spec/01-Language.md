# OpenProse

###### A programming language for AI sessions, expressed as durable Markdown contracts.

This document is the specification of **the OpenProse Language & Framework** —
the durable `*.prose.md` contract format, the skill semantics that interpret
it, the model-run compiler that lowers it, the standard library that packages
reusable behavior, and the CLI surface that drives it. It is the spec for what
ships **bundled as the SKILL**.

The OpenProse corpus divides labor exactly, and each document maps to what
ships:

- [01-Language.md](./01-Language.md) — **this document, the Language &
  Framework**, bundled as the **SKILL**: syntax, kinds, sections, compile
  model, std/co, CLI surface.
- [02-ReactorHarness.md](./02-ReactorHarness.md) — **the Reactor
  Harness**, bundled as the **CLI/Server**: the runtime control architecture
  (loop, invariants, the reconciler, memoization, forecast, receipts, composition)
  that *serves* these contracts.
- [03-ReactorPattern.md](./03-ReactorPattern.md) — **the
  Reactor-Native Authoring Pattern**, **SKILL-bundled but harness-governed**:
  how to write `*.prose.md` so the harness's mechanisms engage. It bridges
  this doc and the Harness doc.
- [ReactorFeedback.md](../history/ReactorFeedback.md) — **the
  decision log**, not shipped: the dialectic that produced the Harness doc;
  the clean statements live in the docs above.
- [00-Tenets.md](./00-Tenets.md) — **the constitution**. When any
  document tensions with a tenet, the tenet wins.

This file has three parts, mirroring its companions:

1. **The ideal** OpenProse language and framework.
2. **What exists today** (the current `platform/external/prose` skill package,
   treated as ground truth).
3. **What is next** to bring the current skill to the ideal.

---

## Part I — The Ideal OpenProse Language & Framework

OpenProse is a contract format, runtime doctrine, skill package, standard
library, and CLI wrapper for making agent work readable, reviewable, versioned,
reusable, and inspectable. A user writes one `*.prose.md` file of durable
intent. A Prose Complete agent host reads it, wires the responsibility DAG, spawns
isolated bounded sessions, and
leaves a durable receipt under an OpenProse root.

The central idea:

```text
Markdown source defines intent.
Skill and interpreter docs define semantics.
A model-run compiler lowers semantics into IR; deterministic code validates it.
The harness serves IR.
Runs interpret and act inside bounded activations.
```

### The commitments that define the language

Each is a Tenet made concrete at the language layer. They are the north star;
Part II is honest about how far the current skill has climbed toward them.

- **Markdown is the only contract (Tenet 1).** `*.prose.md` carries 100% of
  semantic weight. Compiled IR and other projections are
  derived views; if any disagrees with the Markdown, the Markdown is right.
  There is no second surface where intent lives — not a prompt, not a tool
  config, not a hidden judge prompt (Tenet 1).
- **The responsibility is the program (the inversion).** A standing goal
  written as durable intent is the top-level authored object — a
  `kind: responsibility`, mounted as a node whose truth is maintained over time.
  Node-ness comes from *mounting*, never from statefulness: a bounded,
  no-continuity job is a `kind: function` (a called, ephemeral helper that binds
  `### Parameters` and returns `### Returns`), not a lesser kind of loop.
- **The same Markdown runs on any Prose Complete host (Tenet 1).** Every
  contract authored against this spec executes identically on any compliant
  host. A fresh `git clone` is a first-class experience; a long-lived host
  adds reliability and scale, never semantics.
- **Intelligence lives in the model, not in deterministic code (Tenet 2).**
  Compilation is itself model work — intelligent sessions lower a contract into
  its IR (the Forme topology, the per-node canonicalizer, and the postcondition
  validators); deterministic code only validates that IR, wires connectors,
  enforces boundaries, schedules, and signs. The language never grows a config
  format to encode what the model should decide.
- **The authored surface is small, stable, and complete.** Five kinds
  (`responsibility`, `function`, `gateway`, `pattern`, `test`), the canonical
  `###` section set (`### Goal`, `### Requires`, `### Maintains`,
  `### Continuity`, `### Invariants`, `### Execution`, plus
  `### Parameters`/`### Returns` for a `function`, and the carried
  `### Shape`/`### Environment`/`### Tools`/`### Runtime`), and the header
  hierarchy are the
  entire language. Persistence is conferred by *mounting* a responsibility — the
  harness gives a mounted node its single durable world-model — not by a config
  flag. New capability is new *semantics* in skill docs, never new syntax or a
  YAML overlay.
- **Material change is declared, then frozen into a fingerprint (cost scales
  with surprise).** The author declares, inside `### Maintains`, *what counts as
  a material change* — which fields matter, how text/sets/numbers normalize, and
  (optionally) how the truth divides into facets. Compilation lowers that prose
  into a deterministic **canonicalizer**, and the run phase fingerprints each
  render's output through it. An unmoved fingerprint means the world did not
  materially change, so the dumb reconciler skips the render at zero cost —
  there is no judge re-deciding "did this change." Absent a material/immaterial
  split, maintenance cost scales with the clock, not with surprise. The
  *normalization convention* is the author's prose inside `### Maintains`; the
  compiled mechanics are the harness's
  ([02-ReactorHarness.md](./02-ReactorHarness.md)).
- **The language packages reusable behavior and stays a public good.** `std`
  and `co` prove OpenProse programs compose like code. The language, runtime
  doctrine, and skill are MIT and free, forever; commerce is out of scope of
  this specification and nothing here depends on it.
- **Agents are first-class authors.** Humans and agents co-equally
  author, fork, and compose contracts. Every surface, error, and metadata
  field is designed for both readers from the start.
- **Every contract is portable (Tenet 6).** The Markdown, with its
  durable trail, can leave for any Prose Complete harness with no lost
  semantics. The public artifact is the contract; the deployment's secrets and
  data stay private.

### What the responsibility's load-bearing sections mean

Most `###` sections' meaning is self-evident
from their name. Three carry the semantic load of a `kind: responsibility` and
the Ideal must state them rather than defer: `### Requires`, `### Maintains`,
and `### Continuity`.

**`### Maintains` is the world-model schema — the truth this node keeps
current.** It does four jobs at once: it *types* the maintained truth; it
carries the *canonicalization spec* (which fields are material, how they
normalize) that compiles into the node's fingerprint; it declares *facets*
(below); and it states *postconditions* — the obligations a render must satisfy
before it may commit. There is no separate judge and no `### Criteria`:
satisfaction folds into `### Maintains`, checked deterministically where it can
be expressed as a validator and self-attested by the render where it is
semantic. A render that cannot satisfy its postconditions commits nothing — the
prior truth stands and a `failed` receipt records why.

**Facets make subscription structural.** A `####` sub-heading inside
`### Maintains` declares a facet — a named part of the truth. Its name is, at
once, its *fingerprint unit* (the canonicalizer emits one token per facet, plus
an always-on atomic token over the whole truth), its *subscription symbol* (a
consumer names it in `### Requires`, and the reconciler wakes that consumer only
when *that* facet's token moves — `Requires.<facet>` ↔ `Maintains.<facet>`), and
its region of the world-model. Declaring no parts is the atomic default — one
truth, one token — and costs nothing. This adds no new grammar; it reuses the
heading hierarchy and the Requires↔Maintains join. *Structure is subscription.*

**`### Requires` declares what the node subscribes to.** It names the upstream
facets this node consumes; Forme matches each `### Requires` entry to a
producer's `### Maintains` facet and draws the subscription edge. `### Requires`
is the input side of the memo key: the run phase fingerprints the node's
contract together with its subscribed inputs, and re-renders only when one of
them moves.

**`### Continuity` declares the wake source — when, beyond an input change, a
node should re-render.** It is not a schedule. A node is *input-driven* by
default (it wakes when a subscribed facet moves); `### Continuity` adds a
*self-driven* cadence (the truth goes stale on its own — a `valid_until`
freshness state the node carries in its world-model, read on a forecast cadence)
or marks a `kind: gateway` as *external-driven* (an ingress event wakes it).
Freshness *state* lives in the world-model as data; `### Continuity` carries only
the *policy* that reads it. When a `valid_until` lapses, the harness mechanically
moves the affected facet's fingerprint and wakes the node — no model call to
decide that time has passed.

The author writes these; the harness owns the fingerprinting, the forecast
cadence, the receipts, and the subscription wiring. The granular how-to —
declaring material fields, faceting the truth, giving the world a cheap content
identity, projection-only shapes — is the Reactor authoring pattern's
([03-ReactorPattern.md](./03-ReactorPattern.md)); the runtime mechanics are the
harness's ([02-ReactorHarness.md](./02-ReactorHarness.md)).

The full mechanics of the runtime that *serves* these contracts — the two-phase
compile/run split, memoization, the deterministic continuity clock, receipts,
composition — are **not** specified here. They are the Reactor harness's concern
([02-ReactorHarness.md](./02-ReactorHarness.md)). This document's ideal is the
*language*: the contract a human or agent writes, and the semantics by which it
is understood.

---

## Part II — What Exists Today

> This part is a synthesis of the current `openprose/prose` repository, treated
> as the source of truth, measured honestly against Part I. The skill is **mid-migration**:
> its `runtime_contract` advanced from `1` to `2` in the `v0.15.0` "Intelligent
> React" overhaul, which retired the judge / verdict / pressure / fulfillment
> loop and re-cleaved the kind taxonomy around a single render atom. The
> *teaching docs* (`SKILL.md`, `contract-markdown.md`, `concepts/`, `changelog.md`)
> are on the new model; the *library examples* under `skills/open-prose/examples/`
> are migrated; the bundled `packages/std/` and `packages/co/` contracts are
> **not yet migrated** (they still carry the retired vocabulary). This part says
> so plainly rather than projecting completion. Older framing around hosted cloud
> products, social execution networks, company financing, `kind: program`,
> standalone `.prose` source files, and the old registry model is not part of
> this synthesis unless the current repo still contains a live implementation.

### Current Shape

The skill (SKILL `version: 0.15.0`, `runtime_contract: 2`) has five load-bearing
spec files plus the reactor-semantics concept docs the `v0.15.0` overhaul added:

| Piece | Location | Role |
| --- | --- | --- |
| Contract Markdown | `skills/open-prose/contract-markdown.md` | Canonical `*.prose.md` source format for responsibilities, functions, gateways, patterns, tests |
| Forme | `skills/open-prose/forme.md` | Compile-phase wiring render: matches `### Requires` ↔ `### Maintains` and draws the responsibility-DAG subscription edges |
| Prose VM | `skills/open-prose/prose.md` | Bounded-render execution semantics: one session reads evidence, queries prior world-model by reference, writes the world-model, signs a receipt |
| ProseScript | `skills/open-prose/prosescript.md` | Imperative choreography inside `### Execution` and pattern `### Delegation` |
| Responsibility Runtime | `skills/open-prose/responsibility-runtime.md` | The compile (intelligent) / run (dumb) split, repository IR, `compile`, `serve`, and `status` |
| Concepts | `skills/open-prose/concepts/{responsibility,reactor}.md` | The `kind: responsibility` semantic contract and the dumb fingerprint-comparison reconciler (no judge) |

The shippable repository also contains:

| Area | Location | Role |
| --- | --- | --- |
| OpenProse skill | `skills/open-prose/` | Agent-facing runtime/spec bundle |
| CLI | `tools/cli/` (`@openprose/prose-cli`) | Shell entrypoint and deterministic host for compile/serve/status/doctor |
| Standard library | `packages/std/` | Reusable roles, patterns, ops, delivery, memory, and evals (**not yet migrated** to the v0.15.0 vocabulary) |
| Company-as-Prose package | `packages/co/` | Generic company-operations starter contracts (**not yet migrated**) |
| Reactor packages | `packages/reactor/` (`0.2.0`), `packages/reactor-cli/` (`0.1.0`), `packages/reactor-devtools/` | The Reactor harness runtime and its `reactor` CLI/replay viewer; specified in [02-ReactorHarness.md](./02-ReactorHarness.md), **not** language material |
| Examples | `skills/open-prose/examples/` | Native OpenProse repositories; migrated to responsibility/function/gateway |
| Tests and fixtures | `tools/cli/tests/`, package test suites | Command-model, harness, compile-validation, and IR/runtime tests |
| Plugin envelopes | `.codex-plugin/`, `.claude-plugin/`, `.agents/plugins/` | Marketplace/install metadata |

OpenProse is distributed as an MIT-licensed beta and collects no telemetry. Note
that this document's CLI is the **`prose` CLI** (`@openprose/prose-cli`); the
separate **`reactor` CLI** (`packages/reactor-cli/`) drives the Reactor harness
and is the Harness doc's concern, not this one.

### What OpenProse Is Not

The current repository narrows the ground truth:

- Current source files are `*.prose.md`, not plain `.md` contracts or
  standalone `.prose` programs.
- Current authored kinds taught by the skill are `responsibility`, `function`,
  `gateway`, `pattern`, and `test`. **`kind: service` was renamed to
  `kind: function`** (a called, ephemeral helper with `### Parameters` →
  `### Returns`); **`kind: system` was deleted** (composition is intra-node
  ProseScript `call` or a cross-node `### Requires` ↔ `### Maintains`
  subscription, never a third autowired graph kind).
- The judge model is retired. There is **no judge, no verdict, no
  `up`/`drifting`/`down`/`blocked` status enum, no pressure record, no separate
  fulfillment activation, and no policy-compile loop**. Commit-gating is
  deterministic postcondition validators (lowered from `### Maintains`) plus the
  render's self-attestation; receipt `status` is `rendered` | `skipped` |
  `failed`.
- The retired sections are gone from the taught surface: `### Ensures` became
  `### Maintains` (re-purposed as the world-model schema, not a renamed output
  list); `### Criteria` folded into `### Maintains` postconditions;
  `### Memory` folded into the single persisted world-model; `### Fulfillment`
  folded into the render or a delegated function; `### Services` / `### Wiring`
  were deleted with `system`.
- `kind: program`, `kind: composite`, `compose:`, old `.deps/` layout,
  `~/.prose`, and `.prose/runs/` are legacy upgrade context.
- `prose migrate`, `prose wire`, and old compile-as-lint wording are retired;
  current migration is `prose upgrade`, and current Responsibility Runtime
  compilation is `prose compile`.
- Bare `owner/repo` identifiers and `p.prose.md` registry resolution are
  reserved/inert. Current dependency resolution is explicit git-host based,
  with `std/` and `co/` shorthands.
- The current repo does not specify a product/business platform surface like
  Cloud billing, sprites, Constellation, or an investor narrative. The hosted
  product, public/social surface, and go-to-market motion are sketched in
  [ContinuousOutcomes.md](../ideation/ContinuousOutcomes.md) (stale
  product ideation, not a live spec); the forward-looking subscription,
  royalty, and dependency-graph economics are sketched in
  [SubscriptionsHypothetical.md](../ideation/SubscriptionsHypothetical.md)
  (hypothetical, not a live spec and not load-bearing); the brand and design
  surface lives in `platform/apps/run/PRODUCT.md`. None of those documents are
  live OpenProse language/runtime material; this file remains the language and
  runtime spec only.

### Prose Complete

OpenProse runs inside an agent host. A host is "Prose Complete" when it can map
the abstract VM primitives onto real capabilities:

| Primitive | Required behavior |
| --- | --- |
| `spawn_session` | Run a render (a responsibility or a called function) in an isolated agent/session with a prompt, optional model, and access to declared input/output paths |
| `ask_user` | Pause for missing required caller input and resume with the answer |
| `read_state` / `write_state` | Read and write run state through the selected backend (`<openprose-root>/runs/{id}/` artifacts and durable records) |
| `copy_binding` | Publish a declared output through the active backend (filesystem copies `workspace/` → `bindings/`; never publishes undeclared scratch) |
| `check_env` | Confirm an environment variable exists without exposing its value |

Codex-style and Claude Code-style environments are the primary documented
targets. The `prose` CLI can forward runs to `codex-sdk`, `claude-sdk`, or a
local `mock` harness (the three harnesses under `tools/cli/src/harnesses/`);
`codex-sdk` is the default. OpenProse commands are therefore first an
agent-session command language. A shell command such as:

```bash
prose run src/hello.prose.md
```

means "ask the selected agent harness to embody the OpenProse VM and execute
this contract." The CLI is not a replacement VM; it never parses `.prose`
semantics — the SKILL-loaded session embodies the VM.

### OpenProse Root

Every run happens relative to an OpenProse root:

| Scope | Root |
| --- | --- |
| Native repository | Repository root |
| Attached repository | `repo/.agents/prose` |
| User-global | `~/.agents/prose` |

The root layout is:

| Path | Purpose |
| --- | --- |
| `src/` | Authored intent: responsibilities, functions, gateways, patterns, tests |
| `dist/` | Compiled intent (repository IR `manifest.next.json` / `manifest.active.json`) |
| `runs/` | Activation receipts for bounded VM runs |
| `state/` | Durable cross-run state |
| `state/agents/` | Durable agent memory |
| `state/responsibilities/{id}/` | Each responsibility's persisted world-model and its signed, append-only receipt ledger (no separate status/pressure store — the judge loop is retired) |
| `deps/` | Installed git-native dependencies |
| `prose.lock` | Dependency lockfile |
| `.env` | Local runtime environment |

This root model matters because OpenProse is not just syntax. Its runtime
contract includes where runs are recorded, how dependencies are found, and
where standing goals keep their history.

### Contract Markdown

Contract Markdown is the human-facing language surface. A `*.prose.md` file has
small YAML frontmatter for identity and Markdown `###` sections for contracts,
runtime hints, shape, execution, and world-model semantics.

A responsibility — the headline kind — declares both halves of its reactive
interface (`### Requires` it subscribes to, `### Maintains` it keeps current):

```markdown
---
name: research-report
kind: responsibility
id: 067NC4KG01RG50R40M30E20918
---

### Goal

A current, sourced answer to the tracked question is maintained.

### Requires

- A current view of the source material for the question.

### Maintains

A concise answer with citations.

Material: the answer text and its sources. Immaterial (excluded from the
fingerprint): `fetched_at`, request ids, cosmetic ordering.

Postconditions:
- Every claim is backed by a cited source.

### Continuity

input-driven; self-driven daily.
```

A `kind: responsibility` file carries a required `id:` frontmatter field: a
tooling-generated, UUIDv7-compatible identifier (rendered as uppercase Crockford
base32) minted once by `prose` and preserved across `name:` and filename
renames. `name:` is the human-facing slug; `id:` is the durable identity used to
key world-model and receipt-ledger state under `state/responsibilities/{id}/`.
Authors do not hand-write `id:`; tooling manages it.

The five current authored kinds are:

| Kind | Run model | Purpose |
| --- | --- | --- |
| `responsibility` | Served (continuously reconciled) | The headline kind: a mounted DAG node maintaining a standing truth over time |
| `function` | Called (one-shot) | A stateless, ephemeral helper: bind `### Parameters`, run one render, return `### Returns`. No Forme phase, no world-model. (Renamed from `service`.) |
| `gateway` | Mounted as external-driven | Sugar for an external-driven responsibility; compiled into a trigger registration for `prose serve` |
| `test` | Via `prose test` | Fixtures plus natural-language assertions against a subject responsibility or function |
| `pattern` | Instantiated at compile time | Reusable coordination algorithm expanded into nodes; never directly run |

Canonical sections include:

| Section | Applies to | Meaning |
| --- | --- | --- |
| `### Description` | all | Human summary; preserved for readers, not a contract |
| `### Goal` | responsibility, gateway | The render's one-sentence standing intent |
| `### Requires` | responsibility, pattern slots | Subscription contracts naming facet-level needs; Forme's match target (`Requires.<facet>` ↔ `Maintains.<facet>`) |
| `### Maintains` | responsibility, gateway | The world-model **schema** doing four jobs at once: type, canonicalization spec (material vs immaterial fields), facets (a `####` sub-heading), and postconditions |
| `### Parameters` / `### Returns` | function | The plain call interface (inputs, return value) |
| `### Continuity` | responsibility, gateway | The structural wake-source declaration: input-driven (default), self-driven (cadence), external-driven (gateway) |
| `### Errors` | responsibility, function | Declared failures the node may signal |
| `### Invariants` | responsibility, function, pattern | Properties that hold regardless of outcome |
| `### Strategies` | responsibility, function, test | Judgment rules and edge-case guidance |
| `### Environment` | responsibility, function | Required runtime variables, checked by name only |
| `### Skills` | responsibility, function | Agent harness skills the component requires, as `namespace:name`; resolved fail-closed against `./skills/`, `~/.claude/skills/`, `~/.codex/skills/`, `~/.agents/skills/` |
| `### Tools` | responsibility, function | Host tools (`cli:<name>`, `mcp:<name>`) declared by name only |
| `### Runtime` | responsibility, function | Execution hints such as `model` |
| `### Shape` | responsibility, function | Capability boundaries: self, delegates, prohibited work |
| `### Execution` | responsibility, function | ProseScript render body that pins choreography |
| `### Fixtures` / `### Expects` / `### Expects Not` | test | Test data and assertions |
| `### Slots` / `### Config` / `### Delegation` | pattern | Pattern interface and algorithm |
| `### Schedule` / `### Receives` / `### Emits` / `### Payload` | gateway | Time/event ingress declarations |

The retired judge-era sections (`### Ensures`, `### Criteria`, `### Fulfillment`,
`### Constraints`, `### Memory`, `### Services`, `### Wiring`) are documented in
`contract-markdown.md` and `changelog.md` only as fold/upgrade targets, not as
authoring surface.

Header hierarchy is part of the language, and the `####` level is now load-bearing:

| Header | Meaning |
| --- | --- |
| `#` | Optional human title |
| `##` | Inline responsibility/function boundary inside multi-node files |
| `###` | Section inside the current responsibility, function, gateway, pattern, or test |
| `####` inside `### Maintains` | **Semantic: a facet** — a named, independently-subscribable part of the maintained truth; its name is the fingerprint unit, the subscription symbol, and the world-model subtree |
| `####` inside `### Requires` | **Semantic: a facet-need** — a named subscription Forme matches `Requires.<facet>` ↔ `Maintains.<facet>` |

Composition has exactly two forms (there is no `system` graph kind): **intra-node**
choreography is a ProseScript `call` inside one render's `### Execution`;
**cross-node** composition is a Forme-wired `### Requires` ↔ `### Maintains`
subscription between responsibilities. Pattern instances remain current YAML
syntax, declared in a responsibility's slots:

```yaml
- name: reviewed-output
  pattern: std/patterns/worker-critic
  with:
    worker: writer
    critic: reviewer
  config:
    max_rounds: 3
```

### Forme

Forme is OpenProse's semantic wiring layer. Traditional containers wire by type.
Forme wires by reading contracts. Since `v0.15.0` it is a **compile-phase render**
that produces the resolved responsibility DAG (the topology world-model), not a
per-`system` manifest compiler.

Forme:

1. Reads the full set of mounted responsibility contracts.
2. Resolves local nodes, dependency paths, and pattern files; expands pattern
   instances into concrete nodes.
3. Matches each `### Requires` facet-need to a producer's `### Maintains` facet
   (`Requires.<facet>` ↔ `Maintains.<facet>`), using exact names, semantic
   equivalence, and shape hints.
4. Surfaces unsatisfied or ambiguous matches as diagnostics — never a silent guess.
5. Draws the subscription edges and registers external-driven entry points
   (gateways).
6. Produces the topology world-model — the resolved DAG with its `edges` — that
   the dumb reconciler reads to schedule and propagate.

The repository keeps the Forme doctrine in `skills/open-prose/forme.md`. The
older `packages/std/ops/wire.prose.md` contract still exists but, like the rest
of `std/`, predates the v0.15.0 vocabulary and is pending migration. Forme
running standalone (no harness) is still well-defined: a single responsibility
applies its compiled canonicalizer locally to fingerprint its own receipt.

### Prose VM

The Prose VM is the execution semantics. When an agent runs OpenProse, it is
not merely describing a VM. It performs the VM by mapping the spec to host
tools, spawning real sessions, writing real artifacts, and evaluating real
contracts. The render atom both phases agree on is
`(contract, evidence, prior world-model) → (new world-model, receipt)`.

For a called function:

1. Snapshot the invoked source.
2. Bind `### Parameters`.
3. Spawn one session with the function contract, inputs, and workspace.
4. Wait for the declared `### Returns` value.
5. Return it and record the run. (A function is stateless: no world-model, no
   Forme phase.)

For a responsibility render:

1. The reconciler computes the memo key `(contract_fingerprint,
   input_fingerprints)`; if neither half moved since the last receipt, it writes
   a `skipped` receipt and spawns nothing.
2. Otherwise spawn one bounded session — the render — which reads the evidence
   the wake delivered and queries the prior world-model **by reference** (never
   pre-stuffed into context).
3. The render writes the updated world-model and signs a receipt carrying the
   new fingerprints.
4. On a `rendered` receipt whose fingerprint moved, wake the downstreams
   subscribed to the moved facet(s).

The default filesystem backend creates, under each run, a control-plane envelope
(the compiled Forme topology or a minimal activation record for a lone function,
`root.prose.md`, and `sources/`) before reporting success:

```text
runs/{run-id}/
  root.prose.md
  sources/
  workspace/
  bindings/
  vm.log.md
  agents/
```

The separation matters:

| Directory | Meaning |
| --- | --- |
| `sources/` | Immutable source snapshots for the run |
| `workspace/` | Private scratch and outputs per render |
| `bindings/` | Public declared outputs visible downstream |

OpenProse also specifies in-context, SQLite, and PostgreSQL state backends.
Filesystem is the default and normative reference. In-context is for small
ephemeral runs. SQLite and PostgreSQL are experimental durable alternatives
that keep the run envelope but move events and data-plane bindings into
database records.

### ProseScript

Contract Markdown is declarative. ProseScript is the pinning layer.

Use ProseScript when order, loops, branching, retries, parallelism, or exact
call choreography matters:

````markdown
### Execution

```prose
let findings = call researcher
  topic: topic

let report = call writer
  findings: findings

return report
```
````

ProseScript supports `call`, `parallel`, `for`, `loop`, `if`, `choice`,
`try/catch/finally`, `throw`, `agent`, `session`, `resume`, blocks, and
pipeline-style operations. In current Contract Markdown, the reactive interface
belongs to `### Requires` and `### Maintains` (responsibility) or
`### Parameters` and `### Returns` (function); embedded ProseScript should not
redeclare them.

### Responsibility Runtime

Responsibility Runtime is the continuity layer for repositories that need
standing goals to remain true over time. Its spine is the **compile
(intelligent) / run (dumb)** split: intelligence decides what counts as a change
*once*, at compile time; determinism checks whether one *happened* every time,
at run time.

The stack is:

| Layer | Role |
| --- | --- |
| Responsibility | The standing truth kept current (a mounted node) |
| Reactor | The dumb reconciler: compare fingerprints, skip / render / propagate |
| Forme | Compile-phase wiring of `### Requires` ↔ `### Maintains` |
| Prose VM | One bounded render that computes the next world-model and signs a receipt |

A `kind: responsibility` file is semantic and normative. It defines `### Goal`
(the standing intent), `### Requires` (subscriptions), `### Maintains` (the
world-model schema: type, canonicalization, facets, postconditions), and
`### Continuity` (the wake-source declaration: input-driven, self-driven, or
external-driven).

A `kind: gateway` is sugar for an external-driven responsibility: it declares
`### Continuity: external-driven`, has no `### Requires`, maintains the latest
incoming truth, and describes ingress (schedules, local HTTP routes, webhooks,
provider events) that inference cannot safely recover.

The reconcile loop is **dumb on purpose** (the full semantics are in
`concepts/reactor.md`):

1. A receipt arrives. Its `wake.source` is `input` (an upstream facet moved),
   `self` (the continuity clock's synthetic self-receipt), or `external` (a
   gateway turning a trigger into an edge receipt).
2. Compute the memo key `(contract_fingerprint, input_fingerprints)`. If neither
   half moved, write a `skipped` receipt and spawn nothing.
3. Otherwise spawn one render. It computes the new truth, leaves its
   `### Maintains` postconditions satisfied, writes the world-model, and signs a
   receipt with `status` `rendered` or `failed`.
4. Only a `rendered` receipt whose fingerprint moved wakes downstreams
   subscribed to the moved facet(s).

There is **no judge** in the wake or commit decision, no status enum, no pressure
record, and no separate fulfillment activation. A render that errors or leaves a
postcondition unsatisfied commits nothing (the last-good truth stands) and writes
a cheap `failed` receipt. Freshness *state* (`valid_until`) lives in the
world-model; a lapse mechanically moves a facet fingerprint via the self-driven
tick — a zero-token continuity move, not a model re-render.

Current live serve support includes local cron and HTTP adapters. Queues, file
watches, provider subscription setup, webhook authentication, and automatic
manifest reload are explicitly later phases.

### Compile-Phase IR (v2)

`prose compile` lowers source under an OpenProse root into generated compiled
intent. Markdown remains the durable authoring surface; IR is disposable
compiled intent consumed by deterministic infrastructure. The `v0.15.0` overhaul
re-shaped the IR around the compile/run split: it is now the **compile-phase
output** — the topology, the per-node canonicalizers, the per-node postcondition
validators, and the frozen contract fingerprints — not a judge-era
activations/criteria manifest.

The v2 top-level shape (`compiler/ir-v0.md`) is:

```json
{
  "kind": "openprose.compile-phase-ir",
  "version": 2,
  "sources": [],
  "topology": {},
  "canonicalizers": [],
  "postconditions": [],
  "contract_fingerprints": {},
  "diagnostics": []
}
```

The canonical output files are:

| File | Meaning |
| --- | --- |
| `dist/manifest.next.json` | Fresh compile output |
| `dist/manifest.active.json` | Manifest consumed by `prose serve` |

Promotion from next to active is explicit.

IR records include:

| Record | Meaning |
| --- | --- |
| `sources[]` | Discovered contract set (allowed kinds: responsibility, gateway; functions appear only when discovered, never as topology nodes) |
| `topology` | Forme's resolved DAG: nodes (each with `contract_fingerprint` and `wake_source`), `edges`, and the `acyclic` postcondition |
| `canonicalizers[]` | One per node: the deterministic lowering of `### Maintains` — `canonicalizer(world-model) → fingerprints` |
| `postconditions[]` | One set per node: validators lowered from `### Maintains` postconditions (deterministic where expressible, render-attested otherwise) |
| `contract_fingerprints` | The frozen `{ node → fingerprint }` map — the memo key's first half |
| `diagnostics[]` | Info/warning/error messages (unsatisfied/ambiguous Forme matches, missing structured backings) with optional source paths |

The canonical compiler is a pinned ProseScript program at
`skills/open-prose/compiler/index.prose.md` whose agents are **compile-step
renders** — Forme (wiring), the canonicalizer compiler, and the postcondition
compiler — so the compile output is itself auditable (Tenet 2). The `prose` CLI
also ships a deterministic TypeScript source-compiler
(`tools/cli/src/prose/repository-source-compiler.ts`) used as a validating
fallback when the harness produces no manifest. Whether that fallback should be
reframed as a *structural validator only* or acknowledged as a permitted,
semantics-free mechanical lowering remains open roadmap work (Part III §3).

Important compiler doctrine:

- Discover every `.prose.md` under the source root.
- Match `### Requires` ↔ `### Maintains` only when the resolution is clear; warn
  instead of guessing wiring, timing, or facet matches.
- Lint any subscribed field that lacks a structured, canonicalizable backing.
- Do not invent provider auth, queue names, routes, payload schemas, or
  subscription setup the source does not supply.
- Write `manifest.next.json` only after the IR shape is valid.
- Stop after writing; the CLI performs deterministic validation.

The compile-phase IR is **source-derived**: it is a function of the `*.prose.md`
source set and nothing else. The Reactor harness's token-truth receipts,
forecasts, freshness state, and reconciler decisions are **sibling runtime state**
owned by `@openprose/reactor` — not IR fields and not new source syntax. See
Part III §3 and [02-ReactorHarness.md](./02-ReactorHarness.md).

### CLI

The CLI package is `@openprose/prose-cli`, version `0.14.0` in the repository
(`tools/cli/package.json`). It is an Oclif TypeScript package published as the
`prose` binary. (This is distinct from the `reactor` CLI in
`packages/reactor-cli/`, which drives the harness and belongs to the Harness doc.)

Its two jobs are:

1. Turn user-facing commands into canonical OpenProse prompts for agent
   harnesses.
2. Host deterministic local runtime pieces for compile-phase IR, status, and
   trigger serving.

Current local deterministic commands (the Oclif commands under
`tools/cli/src/commands/`):

| Command | Role |
| --- | --- |
| `prose compile [path] [--out <dir>]` | Forward compile to the harness, then validate the generated IR |
| `prose serve` | Serve active IR with local cron and HTTP adapters |
| `prose status` | Read active IR and runtime receipts locally |
| `prose doctor` | Inspect or install selected provider skill targets |

Current forwarded commands (the agent-prompt model in
`tools/cli/src/prose/command-model.ts`):

| Command | Role |
| --- | --- |
| `prose run <file.prose.md\|package/handle>` | Run a responsibility (served/reconciled) or a called function |
| `prose test <path>` | Execute `kind: test` contracts |
| `prose lint <file.prose.md>` | Validate source structure and contract consistency |
| `prose preflight <file.prose.md>` | Check dependencies and `### Environment` without executing |
| `prose inspect <run-id>` | Inspect a completed run (`std/evals/inspector`) |
| `prose install [--update]` | Install and pin dependencies |
| `prose examples [name]` | List or run bundled examples |
| `prose upgrade [--dry-run]` | Migrate legacy source/layout conventions (now including the v0.15.0 kind/section rewrites) |
| `prose write [request...]` | Generate validated OpenProse source from rough English or pseudo-Prose (backed by `std/ops/prose-author`); non-interactive by default in CLI forwarding |

Harness selection uses `--harness` or `PROSE_HARNESS`. The harnesses are
`codex-sdk`, `claude-sdk`, and `mock` (`tools/cli/src/harnesses/`); `codex-sdk`
is the default.

`prose serve` loads `dist/manifest.active.json`, validates it, registers local
cron timers and HTTP routes, exposes a health endpoint, and dispatches accepted
events into ordinary bounded activations. HTTP triggers return `202 Accepted`
before long-running agent work completes.

### Dependencies

OpenProse dependencies are git-native and disk-only at runtime.

Canonical dependency identifiers use explicit git hosts:

```text
github.com/openprose/prose/packages/std/evals/inspector
gitlab.com/alice/research/tools/summarizer
git.company.com/team/internal-system
```

Two first-party shorthands exist:

| Shorthand | Expands to |
| --- | --- |
| `std/...` | `github.com/openprose/prose/packages/std/...` |
| `co/...` | `github.com/openprose/prose/packages/co/...` |

`prose install` populates `<openprose-root>/deps/` and writes
`<openprose-root>/prose.lock`. Runtime resolution reads installed dependencies
from disk. Missing dependency identifiers should fail with a message telling
the user to run `prose install`.

### Standard Library

`packages/std/` is the standard library. It is not just helper text; it is a
library of OpenProse contracts written in the language itself.

| Category | Contents |
| --- | --- |
| `roles/` | 10 atomic role contracts: classifier, critic, verifier, extractor, summarizer, formatter, researcher, writer, planner, router |
| `patterns/` | 19 reusable coordination patterns: worker-critic, pipeline, map-reduce, fan-out, race, guard, fallback-chain, retry-with-learning, dialectic, oversight, ensemble-synthesizer, proposer-adversary, assumption-miner, blind-review, coherence-probe, contrastive-probe, ratchet, refine, stochastic-probe |
| `ops/` | Operational contracts: lint, preflight, wire, status, diagnose, profiler, plus `prose-author` (the backing contract for `prose write`, with a test suite) |
| `delivery/` | Human gate, email, Slack, webhook, HTML rendering, and file writing |
| `memory/` | Project and user memory contracts |
| `evals/` | Inspector, contract grader, regression tracker, cross-run differ, eval calibrator, system improver, platform improver, prose-contributor |

Roles are the atoms; patterns are the molecules (slots, config, invariants, and
delegation algorithms a responsibility instantiates). The eval and ops libraries
make the feedback loop explicit: a run can be inspected, graded against
contracts, compared across runs, diagnosed, profiled, and used to propose source
or platform improvements.

**Honest gap:** `packages/std/` and `packages/co/` have **not** been migrated to
the v0.15.0 vocabulary. Their contracts still declare `kind: service` (≈25 files)
/ `kind: system` (≈18) and `### Ensures` (across ≈62 files); **no** contract yet
uses the renamed `kind: function` / `kind: responsibility`. The only non-retired
kinds present are the unchanged `kind: pattern` (≈19) and `kind: test`. The
teaching docs and the bundled `examples/` are on the new model, but `std`/`co`
source still carries the retired vocabulary and is the largest pending migration
task (Part III §1).

### Company-As-Prose Package

`packages/co/` is a first-party but domain-shaped package. It sits beside
`std`, not inside it.

`std` is use-case agnostic. `co` is an opinionated starter kit for operating a
company as an OpenProse-native repository. Current public contracts include:

| Contract | Role |
| --- | --- |
| `co/services/agent-readiness` | Probe a company's website for agent-discoverability and plain-HTML readiness |
| `co/systems/company-repo-checker` | Verify a company-as-prose repo matches shared layout and contract expectations |
| `co/evals/*` | Evaluations for the package contracts |

The package explicitly avoids OpenProse, Inc. private business logic. It is
generic company-operations scaffolding. Like `std/`, its on-disk paths
(`services/`, `systems/`) and contracts still use the pre-v0.15.0 vocabulary and
are pending migration to `function` / `responsibility`.

### Examples

The examples under `skills/open-prose/examples/` are OpenProse Native
Repositories, and — unlike `std/` and `co/` — they **are migrated** to the
v0.15.0 vocabulary (their `src/` carries only `kind: function`,
`kind: responsibility`, and `kind: gateway`; no `service`, no `system`). Each
uses:

```text
src/      authored responsibility, gateway, and function contracts
dist/     compiled intent
runs/     bounded activation receipts
state/    durable responsibility/application state
deps/     installed dependencies
prose.lock
```

The shared lifecycle is:

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose serve
```

Current standing-goal example repositories include `stargazer-outreach`,
`incident-briefing-room`, `customer-risk-radar`, `release-readiness`,
`vendor-renewal-watch`, `research-inbox-triage`, `content-performance-loop`,
`compliance-evidence-tracker`, and `competitor-activity`. Each demonstrates the
current architecture: a responsibility defines the standing goal, a gateway
provides time/event ingress, the render (or a delegated function) composes the
work, and the persisted world-model updates durable ledgers, registers, or
histories.

The examples directory also contains minimal feature demos that each isolate one
language feature:

| Example | Demonstrates |
| --- | --- |
| `declared-skills` | `### Skills` resolution and the `skill_unresolved` diagnostic |
| `declared-tools` | `### Tools` resolution and the `tool_unresolved` diagnostic |
| `auto-pocock` | A non-interactive multi-step responsibility adapting an external skill workflow |
| `session-to-prose` | Turning a working session into authored `*.prose.md` source |
| `flat-tokens` | A Reactor-runtime token-accounting demo (Reactor-harness material, not language material) |

### Tests And Release

The current repository validates the language surface at several layers
(`tools/cli/tests/` and the package test suites):

| Layer | Coverage |
| --- | --- |
| Command-model tests | Argument validation and the canonical agent-prompt forwarding for each `prose` command |
| Harness tests | `codex-sdk` / `claude-sdk` / `mock` selection and dispatch |
| Compile-validation tests | Compile-phase IR shape (topology, canonicalizers, postconditions, contract fingerprints), root resolution, status, serve dispatch |
| Reactor-runtime tests | Fingerprint comparison, skip/render/propagate, receipt `status` (`rendered`/`skipped`/`failed`), freshness — in `packages/reactor/` (harness material) |
| CI workflows | CLI release checks, real harness smoke, skill install smoke, OpenProse smoke, plugin manifest validation, release publishing |

The release process uses one release train: skill metadata, plugin metadata, the
CLI npm package, package lock, and tarball installer share the same `X.Y.Z`
version. The protected release workflow verifies CLI/package/plugin surfaces,
publishes `@openprose/prose-cli`, and creates a GitHub Release.

### Mental Model

OpenProse is best understood as typed, inspectable agent software, built around
the render atom `(contract, evidence, prior world-model) → (new world-model,
receipt)`:

- A prompt is useful for one-off work.
- A `*.prose.md` contract is useful when the work has a standing truth to keep
  current, roles, handoffs, retries, or a receipt.
- A `kind: responsibility` is the headline kind: a mounted DAG node whose
  maintained truth the reconciler keeps current; a `kind: function` is a called,
  stateless helper.
- Forme wires the responsibility DAG at compile time by matching `### Requires`
  ↔ `### Maintains`.
- The Prose VM is the agent-session runtime that performs each render.
- ProseScript is how authors pin choreography (including the intra-node `call`)
  when declaration is not enough.
- Responsibility Runtime keeps standing goals true across bounded renders via the
  dumb reconciler: cost scales with surprise, not the clock.
- `std` and `co` are proof that OpenProse programs can package reusable behavior
  like code.

### Glossary

| Term | Meaning |
| --- | --- |
| Activation | One bounded VM render, launched by `prose run` or `prose serve` |
| Binding | A public declared output artifact |
| Canonicalizer | The deterministic lowering of `### Maintains` that maps a world-model to its fingerprints |
| Contract Markdown | The canonical `*.prose.md` source format |
| Facet | A `####` part under `### Maintains`: a named, independently-subscribable unit of truth (fingerprint unit + subscription symbol) |
| Fingerprint | A cheap token that moves iff the semantically-relevant content moved |
| Forme | Compile-phase wiring render that resolves `### Requires` ↔ `### Maintains` into the topology |
| Function | A called, stateless helper: `### Parameters` → `### Returns`, no world-model (renamed from `service`) |
| Gateway | Sugar for an external-driven responsibility; compiled into a trigger registration |
| OpenProse root | Root directory containing `src`, `dist`, `runs`, `state`, `deps`, and lock/env files |
| Pattern | Reusable coordination algorithm instantiated by a responsibility |
| Prose Complete | Host capability threshold for running OpenProse |
| Prose VM | Execution semantics (the render) embodied by the agent host |
| ProseScript | Imperative choreography language inside `### Execution` and `### Delegation` |
| Reactor / Reconciler | The dumb run-phase model: compare fingerprints, skip / render / propagate (no judge) |
| Receipt | The signed commit object; `status` ∈ {`rendered`, `skipped`, `failed`}; the unit of the append-only ledger |
| Repository IR | The compile-phase IR (topology + canonicalizers + postconditions + contract fingerprints) consumed by deterministic infrastructure |
| Responsibility | The headline kind: a standing truth kept current over time, mounted as a DAG node |
| World-model | A node's maintained truth (the DOM analogue), persisted under `state/responsibilities/{id}/` |

---

## Part III — What Is Next

The gap between Part I and Part II is now **mostly migration, not invention.**
The `v0.15.0` "Intelligent React" overhaul already reshaped the taught taxonomy
to the Ideal (five kinds; the load-bearing `### Requires` / `### Maintains` /
`### Continuity` sections; facets; the dumb reconciler; receipts with
`status` ∈ {`rendered`, `skipped`, `failed`}). What remains is **finishing the
migration across the corpus that the teaching docs already lead**, closing a few
in-flight SKILL inconsistencies, and shipping the genuine runtime affordances the
Ideal assumes (which are mostly harness work, surfaced through the language).
No new `*.prose.md` syntax is owed.

### 1. Complete the kind/section migration across the corpus (the central item)

The teaching docs (`SKILL.md`, `contract-markdown.md`, `concepts/`,
`changelog.md`) and the bundled `examples/` are on the new model; the largest
remaining work is everything they reference but that still carries the retired
vocabulary:

- **Migrate `packages/std/` and `packages/co/`.** Their contracts still
  declare `kind: service` (≈25) / `kind: system` (≈18) and `### Ensures`; **no**
  contract yet uses `kind: function` / `kind: responsibility` (the only
  non-retired kinds present are the unchanged `kind: pattern` and `kind: test`).
  Run the `prose upgrade`
  kind/section rewrites (the `runtime_contract: 1 → 2` migration map in
  `changelog.md`) across both packages: `service` → `function`
  (`### Requires`/`### Ensures` → `### Parameters`/`### Returns`); flatten or
  split each `system` (a manual-review diagnostic, never auto-guessed);
  re-home directory names (`co/services/`, `co/systems/`).
- **Drive the count to zero.** Until `std`/`co` are migrated, an author who
  composes from them sees both vocabularies side by side. This is the single
  most visible Part-I/Part-II divergence and the clearest definition-of-done.

### 2. Close the in-flight SKILL inconsistencies

The SKILL is mid-migration and still carries a few stale fragments that should be
swept to match its own new model:

- The **"Contract Markdown Sections" example block in `SKILL.md`** still shows
  `### Ensures` (and a `### Runtime: persist` hint from the retired `### Memory`
  era). Replace with a `### Requires` / `### Maintains` responsibility or a
  `### Parameters` / `### Returns` function example, matching `contract-markdown.md`.
- A few SKILL routing lines still say "service or system" or "inline service";
  align them to "responsibility or function" and the no-`system` rule already
  stated in the Format Detection section.
- The `### Tools` "required even when `(none)`" rule and the `id:` Crockford
  base32 format should be stated once, consistently, across `SKILL.md`,
  `contract-markdown.md`, and `changelog.md`.

### 3. Ship the runtime affordances the Ideal assumes

These are real deferrals — the language describes them, but they are not yet
fully shipped. Most are harness work surfaced through the language:

- **Default `valid_until` freshness projector for `serve`.** Part I's
  data-driven freshness (a lapsed `valid_until` mechanically moves a facet
  fingerprint via the self-tick) needs a default projector in the continuity loop;
  today that loop (which `prose serve` delegates to `@openprose/reactor`) runs on a
  fixed poll cadence and does not yet read per-facet `valid_until`. Until it lands,
  `### Continuity: self-driven` runs on a flat cadence, not the Ideal's "wake
  exactly when the soonest `valid_until` lapses."
- **Adaptive serve cadence.** With the freshness projector, `serve` should sleep
  until the soonest armed recheck instead of a fixed poll cadence (the flat
  `--poll-interval` is the `reactor serve` flag, not a `prose serve` flag), so a
  quiet system is genuinely idle.
- **Facet inference.** Facets are declared today (`####` under `### Maintains`).
  Inferring a reasonable facet split from an undivided `### Maintains` (so authors
  get subscription granularity without hand-faceting) is future compiler work;
  the atomic default is correct but coarse until then.
- **Cryptographic byte-hash signer.** The receipt's `sig` is a v1 meaning-layer
  attestation and the `signer` is an explicit null state (chain-consistency, not
  a cryptographic byte-hash). A real signing identity and byte-hash chain are
  deferred.
- **Ledger compaction.** The per-node receipt ledger is append-only and grows
  without bound; compaction / snapshotting of `state/responsibilities/{id}/` is
  not yet specified.
- **Live serve adapters beyond cron + HTTP.** Queues, file watches, provider
  subscription setup, and webhook auth remain later phases (per
  `responsibility-runtime.md`).

### 4. The fixpoint (topology-as-responsibility)

Part I keeps, as its closing recursion, the **fixpoint**: wiring the graph is
itself a maintained truth, so Forme is a `kind: responsibility` whose world-model
is the resolved DAG and whose render is the wiring step — memoized like any node,
bootstrapped by a tiny deterministic seed. Today Forme is a compile-phase render
that produces the topology, but it is not yet *mounted as a node in the graph it
draws*. Closing the loop (topology-as-responsibility) is explicitly **post-v1**.

### 5. The deterministic compiler fallback

The `prose` CLI carries a deterministic TypeScript source-compiler
(`tools/cli/src/prose/repository-source-compiler.ts`) used as a validating
fallback when the harness produces no manifest. The Ideal commits compilation to
be model-run (Tenet 2). Resolving whether this fallback is reframed as a
*structural validator only* or acknowledged as a permitted, semantics-free
mechanical lowering is open roadmap work.

### Boundary with the Reactor harness

The language has one source-derived compile: `prose compile` (source →
compile-phase IR). The IR is a function of the `*.prose.md` source set and
nothing else. The harness's token-truth receipts, forecasts, freshness state, and
reconciler decisions are **sibling runtime state owned by `@openprose/reactor`** —
not IR fields and not new `*.prose.md` syntax. The `--harness`
(`codex-sdk`/`claude-sdk`/`mock`) surface is a bounded-activation SDK adapter and
carries no reconciler control logic. The full runtime mechanics live in
[02-ReactorHarness.md](./02-ReactorHarness.md); this disclaimer is the language
side of that seam.

### Definition of done for the language layer

- `packages/std/` and `packages/co/` are migrated to `function` /
  `responsibility` / `### Maintains`; no retired-vocabulary contract remains in
  the bundled corpus.
- The remaining stale SKILL fragments (the `### Ensures` example block, the
  "service or system" routing lines) are swept to the new model.
- The default `valid_until` freshness projector and adaptive `serve` cadence
  ship, so self-driven continuity is data-driven rather than fixed-interval.
- The deterministic-compiler-fallback question is resolved one way or the other.
- No new `*.prose.md` syntax is introduced; the fixpoint remains the explicitly
  labeled post-v1 recursion.
