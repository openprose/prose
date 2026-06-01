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

> This part is a synthesis of the current `platform/external/prose` repository,
> treated as the source of truth. Older framing around hosted cloud products,
> social execution networks, company financing, `kind: program`, `.prose`
> source files, and the old registry model is not part of this synthesis
> unless the current repo still contains a live implementation or spec for it.

### Current Shape

OpenProse currently has five load-bearing pieces:

| Piece | Location | Role |
| --- | --- | --- |
| Contract Markdown | `skills/open-prose/contract-markdown.md` | Canonical `*.prose.md` source format |
| Forme | `skills/open-prose/forme.md` | Semantic dependency-injection container for systems |
| Prose VM | `skills/open-prose/prose.md` | Execution semantics for services, systems, tests, and runs |
| ProseScript | `skills/open-prose/prosescript.md` | Imperative choreography inside `### Execution` and pattern `### Delegation` |
| Responsibility Runtime | `skills/open-prose/responsibility-runtime.md` | Standing goals, Reactor, repository IR, `compile`, `serve`, and `status` |

The shippable repository also contains:

| Area | Location | Role |
| --- | --- | --- |
| OpenProse skill | `skills/open-prose/` | Agent-facing runtime/spec bundle |
| CLI | `tools/cli/` | Shell entrypoint and deterministic host for compile/status/serve |
| Standard library | `packages/std/` | Reusable roles, patterns, ops, delivery, memory, and evals |
| Company-as-Prose package | `packages/co/` | Generic company-operations starter contracts |
| Reactor packages | `packages/reactor/`, `packages/reactor-cradle/` | The Reactor harness runtime; specified in [02-ReactorHarness.md](./02-ReactorHarness.md), not language material |
| Examples | `skills/open-prose/examples/` | Native OpenProse repositories demonstrating responsibilities |
| Tests and fixtures | `tests/open-prose/`, `tools/cli/tests/` | Smoke fixtures, compiler fixtures, IR/runtime tests |
| Plugin envelopes | `.codex-plugin/`, `.claude-plugin/`, `.agents/plugins/` | Marketplace/install metadata |

OpenProse is distributed as an MIT-licensed beta and collects no telemetry.

### What OpenProse Is Not

The current repository narrows the ground truth:

- Current source files are `*.prose.md`, not plain `.md` contracts or
  standalone `.prose` programs.
- Current authored kinds are `service`, `system`, `gateway`, `test`, `pattern`,
  and `responsibility`.
- `kind: program`, `kind: composite`, `compose:`, old numbered examples, old
  `.deps/` layout, `~/.prose`, and `.prose/runs/` are legacy upgrade context.
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
| `spawn_session` | Start an isolated agent/session with a prompt, optional model, and access to declared input/output paths |
| `ask_user` | Pause for missing required caller input and resume with the answer |
| `read_file` / `write_file` | Read and write `<openprose-root>/runs/{id}/` state artifacts and backend records |
| `copy_binding` | Publish a declared output through the active backend (filesystem copies `workspace/{service}/` → `bindings/{service}/`) |
| `check_env` | Confirm an environment variable exists without exposing its value |
| `check_tool` | Confirm a declared host tool exists without installing, modifying, or running it |

Codex-style and Claude Code-style environments are the primary documented
targets. The CLI can currently forward runs to `codex-sdk`, `claude-sdk`, or a
local `mock` harness. OpenProse commands are therefore first an agent-session
command language. A shell command such as:

```bash
prose run src/hello.prose.md
```

means "ask the selected agent harness to embody the OpenProse VM and execute
this contract." The CLI is not a replacement VM.

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
| `src/` | Authored intent: services, systems, tests, patterns, gateways, responsibilities |
| `dist/` | Compiled intent, especially repository IR |
| `runs/` | Activation receipts for bounded VM runs |
| `state/` | Durable cross-run state |
| `state/agents/` | Durable agent memory |
| `state/responsibilities/` | Responsibility status and pressure |
| `deps/` | Installed git-native dependencies |
| `prose.lock` | Dependency lockfile |
| `.env` | Local runtime environment |

This root model matters because OpenProse is not just syntax. Its runtime
contract includes where runs are recorded, how dependencies are found, and
where standing goals keep their history.

### Contract Markdown

Contract Markdown is the human-facing language surface. A `*.prose.md` file has
small YAML frontmatter for identity and Markdown `###` sections for contracts,
runtime hints, shape, execution, memory, and responsibility semantics.

```markdown
---
name: research-report
kind: service
---

### Requires

- `topic`: the question to investigate

### Ensures

- `report`: concise answer with sources

### Strategies

- when sources are thin: broaden search terms
```

A `kind: responsibility` file also carries a required `id:` frontmatter
field: a tooling-generated, UUIDv7-compatible identifier minted once by
`prose` and preserved across `name:` and filename renames. `name:` is the
human-facing slug; `id:` is the durable identity used to key standing-goal
state under `state/responsibilities/{id}/`, to fence decisions on contract
revision, and as the composition referent. Authors do not hand-write `id:`;
tooling manages it.

The six current authored kinds are:

| Kind | Directly runnable? | Purpose |
| --- | --- | --- |
| `service` | Yes | Atomic execution boundary: one contract, one session, one workspace |
| `system` | Yes, when structurally complete | Composition boundary: one contract implemented as a graph |
| `test` | Via `prose test` | Fixtures plus semantic assertions against a service or system |
| `pattern` | No | Reusable agent design pattern instantiated by systems |
| `responsibility` | No | Standing goal compiled into repository IR |
| `gateway` | No | Ingress source compiled into trigger registrations |

Canonical sections include:

| Section | Applies to | Meaning |
| --- | --- | --- |
| `### Description` | service/system/test/pattern | Human summary; preserved for readers, not a contract |
| `### Services` | system | Services, systems, or pattern instances to wire |
| `### Requires` | service/system/test/pattern slots; `responsibility` for a pinned composition reference | Inputs or dependencies the caller/container must provide; on a `kind: responsibility`, a reserved `responsibility` typed-input pins an upstream id-or-path + contract revision + acceptable signer set (kernel-verifiable, not a Forme edge) |
| `### Ensures` | service/system/pattern | Outputs or postconditions |
| `### Errors` | service/system | Declared failure modes |
| `### Invariants` | service/system/pattern | Properties that hold regardless of outcome |
| `### Strategies` | service/system/test | Judgment rules and edge-case guidance |
| `### Environment` | service/system | Required runtime variables, checked by name only |
| `### Skills` | service/system | Agent harness skills the component requires, declared as `namespace:name`; resolved fail-closed against `./skills/`, `~/.claude/skills/`, `~/.codex/skills/`, `~/.agents/skills/` |
| `### Tools` | service/system/responsibility | Host tools (`cli:<name>`, `mcp:<name>`) the component requires the host to provide, declared by name only; **required on `kind: responsibility` even when `(none)`** |
| `### Runtime` | service/system | Execution settings; `persist: project\|user` gates the durable-state surface and the `### Memory` contract (not advisory); `model` selects the model |
| `### Memory` | service | Declared durable reads/writes; only meaningful when `### Runtime` sets `persist: project` or `persist: user` |
| `### Shape` | service | Capability boundaries: self, delegates, prohibited work |
| `### Wiring` | system | Explicit binding when auto-wiring should be pinned |
| `### Execution` | service/system | ProseScript choreography |
| `### Fixtures` / `### Expects` / `### Expects Not` | test | Test data and assertions |
| `### Slots` / `### Config` / `### Delegation` | pattern | Pattern interface and algorithm |
| `### Goal` / `### Continuity` / `### Criteria` / `### Constraints` / `### Tools` / `### Fulfillment` | responsibility | Standing-goal contract |
| `### Schedule` / `### Receives` / `### Emits` / `### Payload` | gateway | Time/event ingress declarations |

Header hierarchy is part of the language:

| Header | Meaning |
| --- | --- |
| `#` | Optional human title |
| `##` | Inline service boundary inside multi-service files |
| `###` | Section inside the current service/system/test/pattern/responsibility |

Systems compose work four ways:

1. Plain service names in `### Services`.
2. Subsystems, where a `kind: system` is treated as a graph node by its parent.
3. Explicit `### Wiring`.
4. Pattern instances declared as YAML inside `### Services`.

Pattern instances are current syntax:

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

Forme is OpenProse's semantic dependency-injection container. Traditional
containers wire by type. Forme wires by reading contracts.

For a `kind: system`, Forme:

1. Reads the system contract and `### Services`.
2. Resolves local services, subsystems, dependency paths, and pattern files.
3. Expands pattern instances into concrete graph constraints.
4. Matches `### Requires` to caller inputs or upstream `### Ensures`.
5. Uses exact names, semantic equivalence, shape hints, and explicit wiring.
6. Warns on soft ambiguity and errors on hard ambiguity.
7. Builds a dependency graph, execution order, parallelization opportunities,
   environment requirements, and warnings.
8. Produces a compiled Forme manifest consumed by the Prose VM.

The current repository keeps the Forme doctrine in `skills/open-prose/forme.md`
and also expresses the wiring operation as a standard-library contract in
`packages/std/ops/wire.prose.md`. That is an important architectural point:
OpenProse uses Prose to describe parts of its own toolchain.

### Prose VM

The Prose VM is the execution semantics. When an agent runs OpenProse, it is
not merely describing a VM. It performs the VM by mapping the spec to host
tools, spawning real sessions, writing real artifacts, and evaluating real
contracts.

For a single service:

1. Snapshot the invoked source.
2. Bind caller inputs.
3. Spawn one session with the service contract, inputs, workspace, output
   obligations, and any allowed memory.
4. Wait for declared outputs.
5. Copy declared outputs to public bindings.
6. Return the ensured result and record the run.

For a system:

1. Run Forme to produce or load the compiled manifest.
2. Create a durable run envelope.
3. Execute graph nodes in topological order, parallelizing independent nodes.
4. Pass bindings by pointer.
5. Keep each service's scratch in its own workspace.
6. Publish only declared outputs.
7. Record the VM log, bindings, sources, and manifest.

The default filesystem backend creates:

```text
runs/{run-id}/
  root.prose.md
  sources/
  forme.manifest.json
  workspace/
  bindings/
  vm.log.md
  agents/
```

The separation matters:

| Directory | Meaning |
| --- | --- |
| `sources/` | Immutable source snapshots for the run |
| `workspace/` | Private scratch and outputs per service |
| `bindings/` | Public interface visible to downstream services |

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
pipeline-style operations. In current Contract Markdown, public interfaces
belong to `### Requires`, `### Ensures`, and `### Services`; embedded
ProseScript should not redeclare them.

### Responsibility Runtime

Responsibility Runtime is the continuity layer for repositories that need
standing goals to remain true over time.

The stack is:

| Layer | Role |
| --- | --- |
| Responsibility | What must remain true over time |
| Reactor | Evented reconciliation model |
| Forme | Fulfillment wiring |
| Prose VM | One bounded activation that judges, fulfills, retries, or escalates |

A `kind: responsibility` file is semantic and normative. It defines:

- `### Goal`: the invariant.
- `### Continuity`: how time qualifies the obligation.
- `### Criteria`: what satisfactory fulfillment means.
- `### Constraints`: what must remain bounded or prohibited.
- `### Fulfillment`: optional hint naming a system or service.

A `kind: gateway` file describes ingress when inference would be unsafe:
schedules, local HTTP routes, webhooks, provider events, and emitted
responsibility trigger ids.

The Reactor loop is:

1. A timer, HTTP route, webhook, manual request, source change, queue, or other
   event wakes the system.
2. A bounded judge activation evaluates the responsibility as `up`,
   `drifting`, `down`, or `blocked`.
3. Status is written under `state/responsibilities/{id}/latest.json` and
   appended to `status.jsonl`.
4. Unhealthy status produces deduped pressure.
5. Pressure launches an ordinary fulfillment, retry, or escalation activation.

Current live serve support includes local cron and HTTP adapters. Queues, file
watches, provider subscription setup, webhook authentication, and automatic
manifest reload are explicitly later phases.

### Repository IR v0

`prose compile` lowers source under an OpenProse root into generated repository
IR. Markdown remains the durable authoring surface; IR is disposable compiled
intent consumed by deterministic infrastructure.

The v0 top-level shape is:

```json
{
  "kind": "openprose.repository-ir",
  "version": 0,
  "sources": [],
  "responsibilities": [],
  "triggers": [],
  "activations": [],
  "formeManifests": [],
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
| `sources[]` | Discovered source files with root-relative paths |
| `responsibilities[]` | Standing-goal contracts preserved as structured data |
| `triggers[]` | Concrete cron, HTTP, or manual trigger registrations |
| `activations[]` | Judge, fulfillment, retry, or escalation intent |
| `formeManifests[]` | Structured runtime wiring for systems |
| `diagnostics[]` | Info/warning/error messages with optional source paths |

The canonical compiler is a pinned ProseScript service at
`skills/open-prose/compiler/index.prose.md` that the harness runs. The CLI also
ships a deterministic TypeScript source-compiler
(`tools/cli/src/prose/repository-source-compiler.ts`) used as a validating
fallback when the harness produces no manifest. The Ideal commits the compiler
to be a model-run Prose service (Tenet 2); the current code carries both, with
the deterministic one performing real lowering — fulfillment inference and
Forme-manifest construction — as well as validation. Resolving whether the
deterministic compiler should be reframed as *only* a structural validator or
acknowledged as a permitted, semantics-free mechanical lowering is open
roadmap work (see Part III §3).

Important compiler doctrine:

- Discover every `.prose.md` under the source root.
- Infer only when the source graph is clear.
- Warn instead of guessing timing, fulfillment, or wiring.
- Do not invent provider auth, queue names, routes, payload schemas, or
  subscription setup.
- Write `manifest.next.json` only after the IR shape is valid.
- Stop after writing; the CLI performs deterministic validation.

Repository IR v0 is **frozen and source-derived**: it is a function of the
`*.prose.md` source and nothing else. The Reactor harness's policy artifact,
token-truth receipts, forecasts, and decisions are **sibling runtime state**
owned by `@openprose/reactor` — not IR fields and not new source syntax. See
Part III §3 and [02-ReactorHarness.md](./02-ReactorHarness.md)
("The two compiles").

### CLI

The CLI package is `@openprose/prose-cli`, currently version `0.14.0` in the
repository. It is an Oclif TypeScript package published as the `prose` binary.

Its two jobs are:

1. Turn user-facing commands into canonical OpenProse prompts for agent
   harnesses.
2. Host deterministic local runtime pieces for repository IR, status, and
   trigger serving.

Current local deterministic commands:

| Command | Role |
| --- | --- |
| `prose help` | Oclif help |
| `prose doctor` | Inspect or install selected provider skill targets |
| `prose compile` | Forward compile to harness, then validate generated IR |
| `prose status` | Read active IR and runtime receipts locally |
| `prose serve` | Serve active IR with local cron and HTTP adapters |

Current forwarded commands:

| Command | Role |
| --- | --- |
| `prose run` | Run a service or structurally complete system |
| `prose test` | Execute `kind: test` contracts |
| `prose lint` | Validate source structure and contract consistency |
| `prose preflight` | Check dependencies and environment |
| `prose inspect` | Inspect a completed run |
| `prose install` | Install and pin dependencies |
| `prose examples` | List or run bundled examples |
| `prose upgrade` | Migrate legacy source/layout conventions |
| `prose write` | Generate validated OpenProse source from rough English or pseudo-Prose (backed by `std/ops/prose-author`) |

Harness selection uses `--harness` or `PROSE_HARNESS`. The documented harnesses
are `codex-sdk`, `claude-sdk`, and `mock`; `codex-sdk` is the default.

`prose serve` loads `dist/manifest.active.json`, validates it, registers local
cron timers and HTTP routes, exposes `/_openprose/health`, and dispatches
accepted events into ordinary `prose run` activations. HTTP triggers return
`202 Accepted` before long-running agent work completes.

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
| `roles/` | Atomic role services: classifier, critic, verifier, extractor, summarizer, formatter, researcher, writer, planner, router |
| `patterns/` | 19 reusable coordination patterns: worker-critic, pipeline, map-reduce, fan-out, race, guard, fallback-chain, retry-with-learning, dialectic, oversight, ensemble-synthesizer, proposer-adversary, assumption-miner, blind-review, coherence-probe, contrastive-probe, ratchet, refine, stochastic-probe |
| `ops/` | Operational systems: lint, preflight, wire, status, diagnose, profiler, plus `prose-author` (the backing contract for `prose write`) |
| `delivery/` | Human gate, email, Slack, webhook, HTML rendering, and file writing |
| `memory/` | Project and user memory services |
| `evals/` | Inspector, contract grader, regression tracker, cross-run differ, calibrator, system improver, platform improver, prose-contributor |

The `roles` README describes roles as the atoms. Patterns are the molecules:
they define slots, config, invariants, and delegation algorithms that systems
instantiate.

The eval and ops libraries make the feedback loop explicit. A run can be
inspected, graded against contracts, compared across runs, diagnosed, profiled,
and used to propose source or platform improvements.

### Company-As-Prose Package

`packages/co/` is a first-party but domain-shaped package. It sits beside
`std`, not inside it.

`std` is use-case agnostic. `co` is an opinionated starter kit for operating a
company as an OpenProse-native repository. Current public contracts include:

| Contract | Role |
| --- | --- |
| `co/services/agent-readiness` | Probe a company's website for agent-discoverability and plain-HTML readiness |
| `co/systems/company-repo-checker` | Verify a company-as-prose repo matches shared layout and contract expectations |
| `co/evals/*` | Evaluations for the package services/systems |

The package explicitly avoids OpenProse, Inc. private business logic. It is
generic company-operations scaffolding.

### Examples

The examples under `skills/open-prose/examples/` are OpenProse Native
Repositories. Each one uses:

```text
src/      authored responsibility, gateway, system, and service contracts
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

Current example repositories:

| Example | Standing goal |
| --- | --- |
| `stargazer-outreach` | Keep high-intent GitHub stargazers enriched and ready for thoughtful follow-up |
| `incident-briefing-room` | Keep an incident channel current with sourced status, impact, and next actions |
| `customer-risk-radar` | Keep customer risk visible before renewals or escalations surprise the team |
| `release-readiness` | Keep a release candidate ready with evidence, risks, notes, and rollback context |
| `vendor-renewal-watch` | Keep vendor renewals prepared before auto-renewal or negotiation windows close |
| `research-inbox-triage` | Keep a research inbox deduplicated, prioritized, and converted into action |
| `content-performance-loop` | Keep content performance learnings flowing into next editorial actions |
| `compliance-evidence-tracker` | Keep audit evidence fresh, reviewed, and gap-aware |

The examples repeatedly demonstrate the current architecture: a responsibility
defines the standing goal, a gateway provides time/event ingress, a fulfillment
system composes services, and project-scoped memory updates durable ledgers,
registers, or histories.

The examples directory also contains minimal feature demos that each isolate
one language feature:

| Example | Demonstrates |
| --- | --- |
| `declared-skills` | `### Skills` resolution and the `skill_unresolved` diagnostic |
| `declared-tools` | `### Tools` resolution and the `tool_unresolved` diagnostic |
| `auto-pocock` | A non-interactive multi-service system adapting an external skill workflow |
| `flat-tokens` | A Reactor-runtime token-accounting demo (Reactor-harness material, not language material) |

### Tests And Release

The current repository has several layers of validation:

| Layer | Coverage |
| --- | --- |
| Contract smoke fixtures | Single service, caller input, auto-wiring, inline services, explicit wiring, ProseScript execution, errors/strategies, tests, local pattern instantiation |
| Compiler fixtures | Expected repository IR shapes for empty source, stargazer responsibility runtime, ambiguous fulfillment, and invalid responsibility |
| CLI tests | Command validation, forwarding, harnesses, skill bootstrap, compile validation, root resolution, status, serve dispatch |
| IR validation tests | Source paths, cron/http/manual triggers, judge activation rules, fulfillment/Forme consistency, diagnostics |
| Responsibility tests | Status records, pressure records, dedupe, freshness, and activation routing |
| CI workflows | CLI release checks, real harness smoke, skill install smoke, OpenProse smoke, plugin manifest validation, release publishing |

The release process uses one release train. Skill metadata, plugin metadata, CLI
npm package, package lock, and tarball installer share the same `X.Y.Z`
version. The protected release workflow verifies CLI/package/plugin surfaces,
publishes `@openprose/prose-cli`, and creates a GitHub Release.

### Mental Model

OpenProse is best understood as typed, inspectable agent software:

- A prompt is useful for one-off work.
- A `*.prose.md` contract is useful when the work has roles, handoffs,
  retries, memory, tests, or a receipt.
- A `kind: system` is a dependency graph of service contracts.
- Forme is the semantic container that wires the graph.
- The Prose VM is the agent-session runtime that performs the graph.
- ProseScript is how authors pin choreography when declaration is not enough.
- Responsibility Runtime is how a repository keeps standing goals true across
  bounded runs instead of pretending one agent session should live forever.
- `std` and `co` are proof that OpenProse programs can package reusable
  behavior like code.

### Glossary

| Term | Meaning |
| --- | --- |
| Activation | One bounded VM run, often launched by `prose run` or `prose serve` |
| Binding | A public declared input or output artifact |
| Contract Markdown | The canonical `*.prose.md` source format |
| Forme | Semantic dependency-injection container for systems |
| Gateway | Ingress declaration compiled into trigger registrations |
| OpenProse root | Root directory containing `src`, `dist`, `runs`, `state`, `deps`, and lock/env files |
| Pattern | Reusable coordination algorithm instantiated by a system |
| Pressure | Runtime feedback created when a responsibility is unhealthy |
| Prose Complete | Host capability threshold for running OpenProse |
| Prose VM | Execution semantics embodied by the agent host |
| ProseScript | Imperative choreography language inside `### Execution` and `### Delegation` |
| Repository IR | Generated JSON manifest consumed by deterministic runtime infrastructure |
| Responsibility | Standing goal that must remain true over time |
| Reactor | Evented reconciliation model for responsibilities |
| Service | Atomic execution boundary: one contract, one session, one workspace |
| System | Composition boundary implemented as a graph of services/systems/pattern instances |

---

## Part III — What Is Next

The gap between Part I and Part II is **almost entirely doctrine, not syntax.**
The finding across this doc, the Harness doc, and the Pattern doc is
that the ideal language needs **no new `*.prose.md` syntax** — the six kinds,
the canonical sections, and the header hierarchy already express everything,
with one bounded exception: composition pins a reserved `responsibility`
typed-input (the same mechanism as `run`/`run[]`), so the supply-chain edge is
kernel-verifiable rather than prose-asserted (Part III §3).
What must change is which model the skill *teaches as default*, and how thinly
two sections are currently documented relative to the load they bear.

### 1. Invert the taught mental model (the central item)

The "Mental Model" and the "Directly runnable?" framing in Part II are
**system-first**. They are correct for bounded work and wrong as the default.
The climb:

- Rewrite the mental model responsibility-first: the responsibility is the
  program; the gateway is ingress; the system is one beat of the loop;
  Forme/VM/ProseScript are substrate. Keep the system-centric model explicitly
  as the **N=0 (no-continuity) special case**, not as the headline.
- Reframe "Directly runnable?" so `kind: responsibility` being *served* rather
  than *run* reads as "continuously reconciled" — the most load-bearing
  authored object, not a lesser artifact.
- Route standing-goal language ("keep X true," "make sure Y stays current") in
  `SKILL.md` to responsibility authoring **before** system wiring.

These are enumerated precisely in
[03-ReactorPattern.md](./03-ReactorPattern.md) Part III §1–§3 and
§6–§7; that doc is the authoritative checklist. This section exists so the
language doc itself records the obligation rather than silently depending on
the Pattern doc.

### 2. Strengthen `### Continuity` and `### Criteria` doctrine

The Ideal-level semantic contract for these two sections now lives in Part I
("What the responsibility's two semantic sections mean") — they are no longer
deferred to an out-of-corpus file for *meaning*. What remains owed to
`contract-markdown.md` is the *granular authoring how-to* (worked examples,
lint-able expectations), framed as one-line definitions that point at Part I
rather than re-deriving the semantics. Detail in Pattern doc Part III §4–§5.

### 3. Boundary with the Reactor harness

The language has **one** compile: `prose compile` (source → repository IR v0),
source-derived, re-run when source changes. The Reactor harness adds a
**second, distinct** compile — policy-compile (contract + receipt history →
a token-free policy registry), history-derived, re-run when the policy's own
falsification predicate trips. Same doctrine (a model authors; deterministic
code validates and executes the artifact), different trigger, input, lifetime,
and output. The full statement — why they cannot be merged, the lifecycle
asymmetry, and the agentic-author sequencing — lives in
[02-ReactorHarness.md](./02-ReactorHarness.md) ("The two
compiles"); it is not restated here.

The language-side commitments are only these, and they bound what the harness
may do without changing the language:

- **Repository IR v0 is frozen and source-derived.** The policy artifact,
  token-truth receipts, forecasts, and Reactor decisions are **sibling runtime
  state owned by `@openprose/reactor`** — not new IR fields and not new
  `*.prose.md` syntax. The policy-registry artifact's format is the harness's
  to specify, tracked as Harness open item I.5
  ([02-ReactorHarness.md](./02-ReactorHarness.md), "Open
  specification items"); this disclaimer is the language side of that seam.
- **The bounded-activation agent SDK stays an adapter.** The `--harness`
  surface in Part II (`codex-sdk`/`claude-sdk`/`mock`) carries no Reactor
  control logic; the harness's model-gateway is a separate socket. Detail in
  the Harness doc.
- **Stable content identity is an `### Ensures` convention, not a schema.** The
  identity a sense service returns rides on existing `### Ensures` / `### Memory`
  surfaces; the harness memoizes on it but the language adds no field, type, or
  section for it. Its normalization convention is tracked as Pattern open item
  1, gated on Harness receipt-schema research (open item I.1).
- **Composition pins a reserved typed-input, not a new section.** A
  `kind: responsibility` may declare a reserved `responsibility` input in
  `### Requires` that pins an upstream id-or-path + contract revision +
  acceptable signer set — the same typed-input mechanism as `run`/`run[]`,
  resolved by the source-compile, kernel-verifiable, and explicitly **not** a
  Forme wiring edge. It is source-derived authoring surface, not
  policy-registry/sibling state.

### Definition of done for the language layer

- The mental model and runnable framing are responsibility-first; the
  system-first model survives only as the explicitly labeled N=0 case.
- `SKILL.md` routes standing-goal language to responsibility authoring first.
- `contract-markdown.md` documents `### Continuity` as forecast/memo input and
  `### Criteria` decidability with the undecidable-`blocked` doctrine.
- No new syntax is introduced; every change is doctrine, docs, or routing.
- The IR-vs-sibling-state boundary is stated and cross-linked, not implied.
