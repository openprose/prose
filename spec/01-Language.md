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
  (loop, invariants, kernel, memoization, forecast, receipts, composition)
  that *serves* these contracts.
- [03-ReactorPattern.md](./03-ReactorPattern.md) — **the
  Reactor-Native Authoring Pattern**, **SKILL-bundled but harness-governed**:
  how to write `*.prose.md` so the harness's mechanisms engage. It bridges
  this doc and the Harness doc.
- **Internal decision log** — not shipped: the dialectic that produced the
  Harness doc; the clean statements live in the public specs above.
- [00-Tenets.md](./00-Tenets.md) — **the constitution**. When any
  document tensions with a tenet, the tenet wins.

This file has three parts, mirroring its companions:

1. **Ideal** — the OpenProse language and framework as it *should* be. This is
   the frozen authored vision.
2. **Current** — an accurate, code-grounded snapshot of what the
   public `openprose/prose` skill package and CLI *actually do today*. This
   section is mechanically re-derivable from the code; it is named real
   modules, real types, real behaviors, with paths.
3. **Roadmap (the Delta)** — the honest gap: what bridges Current → Ideal.

`Ideal − Current = Roadmap`. The three are kept distinct so the document can
never again claim shipped what isn't, or aspire in the same breath it reports.

---

## Part I — The Ideal OpenProse Language & Framework

OpenProse is a contract format, runtime doctrine, skill package, standard
library, and CLI wrapper for making agent work readable, reviewable, versioned,
reusable, and inspectable. A user writes one `*.prose.md` file of durable
intent. A Prose Complete agent host reads it, wires the services, spawns
isolated bounded sessions, passes artifacts through declared bindings, and
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
  semantic weight. Compiled IR, manifests, projections, and read models are
  derived views; if any disagrees with the Markdown, the Markdown is right.
  There is no second surface where intent lives — not a prompt, not a tool
  config, not a hidden judge prompt (Tenet 1).
- **The responsibility is the program (the inversion).** A standing goal
  written as durable intent is the top-level authored object. A `kind: system`
  is one beat of its loop; bounded service/system work is the **N=0
  (no-continuity) special case**, not the default.
- **The same Markdown runs on any Prose Complete host (Tenet 1).** Every
  contract authored against this spec executes identically on any compliant
  host. A fresh `git clone` is a first-class experience; a long-lived host
  adds reliability and scale, never semantics.
- **Intelligence lives in the model, not in deterministic code (Tenet 2).**
  The compiler is itself a Prose service the model runs; deterministic code
  only validates IR, wires connectors, enforces boundaries, schedules, and
  signs. The language never grows a config format to encode what the model
  should decide.
- **The authored surface is small, stable, and complete.** Six kinds
  (`service`, `system`, `test`, `pattern`, `responsibility`, `gateway`), the
  canonical `###` section set (enumerated in Part II), the `### Runtime`
  `persist` setting and the `### Memory` contract it gates, and the header
  hierarchy are the entire language. New capability is new *semantics* in
  skill docs, never new syntax or a YAML overlay.
- **A sensing service may return a stable content identity (Harness invariant
  5).** A service that observes the world to inform a judgment may declare, as
  an ordinary `### Ensures` output, a *stable content identity*: a cheaply
  computed value that changes if and only if the semantically relevant
  observed content changed. This is not new syntax — it is one `### Ensures`
  item, optionally diffed against a `### Memory` ledger key. It is what lets
  the harness reuse a prior verdict instead of re-judging an unchanged world;
  absent it, maintenance cost scales with time, not surprise. The
  *normalization convention* (hash of what, normalized how) is deliberately
  not fixed here — see [03-ReactorPattern.md](./03-ReactorPattern.md) Rules 2
  & 5 and [02-ReactorHarness.md](./02-ReactorHarness.md) open item I.1.
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

### What the responsibility's two semantic sections mean

Most `###` sections are catalogued in Part II; their meaning is self-evident
from their name. Two are not, and carry semantic load the Ideal must state
rather than defer: `### Continuity` and `### Criteria` in a
`kind: responsibility`.

**`### Continuity` is the author's input to forecast and memoization.** It is
not a schedule. It names: the *freshness referents* (what makes the goal go
stale, how fast, and which external signal — if any — announces a change); the
*memo-breaking condition* (what makes a prior verdict no longer reusable); the
*plan-audit horizon* (how long a no-escalation run may continue before a forced
deep revalidation, independent of judge confidence); and *whether a cheap
stable identity exists at all* — if "did the semantically relevant content
change" cannot be decided more cheaply than the judgment itself, the author
must say so, and the contract runs at forecast cadence by deliberate
declaration, not by accident.

**`### Criteria` states satisfaction in observable referents.** Every criterion
must point at something a judge can observe. When a criterion has no observable
referent the correct verdict is `blocked` with a judge-authored reason routed
to the contract author — an expected, high-value output, never an error and
never an enumerated status.

The author writes these; the harness owns the memo, the forecast, and the
control policy derived from them. The granular how-to — decomposition for
memoization, the confidence gate, projection-only shapes — is the Reactor
authoring pattern's ([03-ReactorPattern.md](./03-ReactorPattern.md)); the
runtime mechanics are the harness's
([02-ReactorHarness.md](./02-ReactorHarness.md)).

The full mechanics of the runtime that *serves* these contracts — memoization,
forecast-gated quiescence, the two-timescale model-authored policy, receipts,
composition — are **not** specified here. They are the Reactor harness's
concern ([02-ReactorHarness.md](./02-ReactorHarness.md)). This
document's ideal is the *language*: the contract a human or agent writes, and
the semantics by which it is understood.

---

## Part II — Current

> This part is a fresh, code-grounded audit of the public `openprose/prose`
> repository at `main` (HEAD `52724ed`, tag `reactor-v0.1.0`). It
> reports what the bundled skill and the `@openprose/prose-cli` package
> **actually do** at the audited state — version `0.14.0`. Where the language
> as authored exceeds what the code exercises, this part says so. It is named
> against real files; it is mechanically re-derivable from the code, and it is
> the section that must stay true.
>
> Older framing around hosted cloud products, social execution networks,
> company financing, `kind: program`, `.prose` source files, and the old
> registry model is not part of this audit unless the current repo still
> contains a live implementation or spec for it.

### Current Shape

OpenProse is distributed as a skill bundle plus a CLI. The skill at
`skills/open-prose/` carries the language doctrine; the CLI at `tools/cli/`
(`@openprose/prose-cli`) hosts the deterministic runtime pieces.

The load-bearing skill docs are:

| Doc | Location | Role |
| --- | --- | --- |
| Contract Markdown | `skills/open-prose/contract-markdown.md` | Canonical `*.prose.md` source format |
| Forme | `skills/open-prose/forme.md` | Semantic dependency-injection container for systems |
| Prose VM | `skills/open-prose/prose.md` | Execution semantics for services, systems, tests, and runs |
| ProseScript | `skills/open-prose/prosescript.md` | Imperative choreography inside `### Execution` and pattern `### Delegation` |
| Responsibility Runtime | `skills/open-prose/responsibility-runtime.md` | Standing goals, Reactor, repository IR, `compile`, `serve`, `status` |
| Compiler program | `skills/open-prose/compiler/index.prose.md` | The pinned ProseScript compiler service |
| IR v0 contract | `skills/open-prose/compiler/ir-v0.md` | The repository IR v0 output contract |
| Concepts | `skills/open-prose/concepts/responsibility.md`, `concepts/reactor.md` | Responsibility and Reactor semantic contracts |
| State backends | `skills/open-prose/state/{filesystem,in-context,sqlite,postgres}.md` | The four declared state backends |
| Authoring guidance | `skills/open-prose/guidance/{authoring,tenets,system-prompt}.md` | Authoring how-to and design reasoning |
| `SKILL.md` | `skills/open-prose/SKILL.md` | Agent-facing skill entrypoint |

The shippable repository also contains:

| Area | Location | Role |
| --- | --- | --- |
| OpenProse skill | `skills/open-prose/` | Agent-facing runtime/spec bundle |
| CLI | `tools/cli/` | Shell entrypoint and deterministic host for compile/status/serve |
| Standard library | `packages/std/` | Reusable roles, patterns, ops, delivery, memory, evals |
| Company-as-Prose package | `packages/co/` | Generic company-operations starter contracts |
| Reactor packages | `packages/reactor/`, `packages/reactor-cradle/` | The Reactor harness runtime; specified in [02-ReactorHarness.md](./02-ReactorHarness.md) |
| Examples | `skills/open-prose/examples/` | Native OpenProse repositories and minimal feature demos |
| Tests and fixtures | `tests/open-prose/`, `tools/cli/tests/` | Smoke fixtures, compiler fixtures, IR/runtime tests |
| Plugin envelopes | `.codex-plugin/`, `.claude-plugin/`, `.agents/plugins/` | Marketplace/install metadata |

OpenProse is distributed as an MIT-licensed beta (`LICENSE`, `TERMS.md`,
`PRIVACY.md`) and collects no telemetry.

> **Audit note.** The Reactor harness runtime (`packages/reactor`,
> `packages/reactor-cradle`) is present in the repository but is not language
> material. Its current state is audited in `02-ReactorHarness.md`. This
> document audits only the language, the source-compile, and the CLI surface
> that drives them.

### What OpenProse Is Not

The current repository narrows the ground truth:

- Current source files are `*.prose.md`, not plain `.md` contracts or
  standalone `.prose` programs.
- Current authored kinds are `service`, `system`, `gateway`, `test`, `pattern`,
  and `responsibility`. The source-compiler's `knownSourceKinds` set
  (`tools/cli/src/prose/repository-source-compiler.ts`) enumerates exactly
  these six; any other `kind:` lowers to `unknown`.
- `kind: program`, `kind: composite`, `compose:`, old numbered examples, old
  `.deps/` layout, `~/.prose`, and `.prose/runs/` are legacy upgrade context.
- `prose migrate` and `prose wire` are retired; current migration is
  `prose upgrade`, and current source compilation is `prose compile`. The
  CLI's command set (`tools/cli/src/commands/index.ts`) contains no `migrate`
  or `wire` command.
- Bare `owner/repo` identifiers and `p.prose.md` registry resolution are
  reserved/inert. Current dependency resolution is explicit git-host based,
  with `std/` and `co/` shorthands.
- The current repo does not specify a product/business platform surface like
  Cloud billing, sprites, Constellation, or an investor narrative. Hosted
  product, public/social, subscription, royalty, dependency-graph, brand, and
  design surfaces are intentionally outside this public language/runtime spec.

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
targets. The CLI ships three harness adapters
(`tools/cli/src/harnesses/`): `codex-sdk` (`codex-sdk.ts`, built on
`@openai/codex-sdk`), `claude-sdk` (`claude-sdk.ts`), and a local `mock`
harness (`mock.ts`). `HARNESS_NAMES` in `harnesses/index.ts` is exactly
`["codex-sdk", "claude-sdk", "mock"]`. OpenProse commands are therefore first
an agent-session command language. A shell command such as:

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

These are the constants in `tools/cli/src/prose/openprose-root.ts`
(`ATTACHED_OPENPROSE_ROOT_PATH = ".agents/prose"`,
`USER_OPENPROSE_ROOT_PATH = "~/.agents/prose"`). A native root is detected by
the presence of `prose.lock` or `.git`.

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
runtime hints, shape, execution, memory, and responsibility semantics. The
canonical spec is `skills/open-prose/contract-markdown.md`.

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

**Frontmatter.** Every file declares identity with `name` and `kind`. A
`kind: test` file also declares `subject:`. A `kind: responsibility` file
**also carries a required `id:` frontmatter field** — and the source-compile
*enforces* this (see audit note below). `id:` is a tooling-generated 16-byte
UUIDv7-compatible value rendered as a **26-character uppercase Crockford
base32** string (`isMarkdownResponsibilityId` in
`tools/cli/src/prose/repository-ir.ts`: `markdownIdLength = 26`,
`markdownIdByteLength = 16`, with the UUIDv7 version/variant nibbles checked).
It is minted once and preserved across `name:` and filename renames. `name:`
is the human-facing slug; `id:` is the durable identity used to key
standing-goal state under `state/responsibilities/{id}/`, to fence decisions on
contract revision, and as the composition referent. Authors do not hand-write
`id:`; tooling manages it.

> **Audit note — `id:` on responsibility files.** Both the spec
> (`contract-markdown.md`) **and every bundled example** carry the required
> `id:`. All eight responsibility files under
> `skills/open-prose/examples/*/src/*.prose.md` (e.g.
> `stargazer-outreach/src/high-intent-stargazer-outreach.prose.md` with
> `id: 067NC4KG19TPD9V8D5N6PV3DDR`) declare a valid 26-char id. The compile
> path enforces it three ways: a preflight check
> (`validateResponsibilitySources` in `tools/cli/src/commands/compile.ts`)
> emits a `missing_id` or `malformed_id` diagnostic and fails the compile
> *before* harness forwarding; the IR validator
> (`validateResponsibilities` in `repository-ir.ts`) rejects any
> responsibility whose `id` is not a Crockford-base32 UUIDv7 Markdown id; and
> a post-compile source-contract check
> (`validateCompiledResponsibilitySourceContracts`) re-confirms each emitted
> `id` matches the source frontmatter. The required-`id:` claim is **true and
> exercised** in the current code — there is no drift here.

The six current authored kinds are:

| Kind | Directly runnable? | Purpose |
| --- | --- | --- |
| `service` | Yes | Atomic execution boundary: one contract, one session, one workspace |
| `system` | Yes, when structurally complete | Composition boundary: one contract implemented as a graph |
| `test` | Via `prose test` | Fixtures plus semantic assertions against a service or system |
| `pattern` | No | Reusable agent design pattern instantiated by systems |
| `responsibility` | No | Standing goal compiled into repository IR |
| `gateway` | No | Ingress source compiled into trigger registrations |

The `###` sections recognized by `contract-markdown.md`, case-insensitively,
are:

| Section | Applies to | Meaning |
| --- | --- | --- |
| `### Description` | system/service/test/pattern | Human summary; preserved for readers, not a contract |
| `### Services` | system | Services, systems, or pattern instances to wire |
| `### Requires` | system/service/test/pattern slots; `responsibility` for a pinned composition reference | Inputs or dependencies the caller/container must provide |
| `### Ensures` | system/service/pattern | Outputs or postconditions |
| `### Errors` | system/service | Declared failure modes |
| `### Invariants` | system/service/pattern | Properties that hold regardless of outcome |
| `### Strategies` | system/service/test | Judgment rules and edge-case guidance |
| `### Environment` | system/service | Required runtime variables, checked by name only |
| `### Runtime` | system/service | Execution settings; `persist: project\|user` gates the durable-state surface and the `### Memory` contract; `model` selects the model |
| `### Memory` | service | Declared durable reads/writes; only meaningful when `### Runtime` sets `persist: project` or `persist: user` |
| `### Skills` | system/service | Agent harness skills the component requires the host to provide, declared by `namespace:name` |
| `### Tools` | system/service/responsibility | Host tools (`cli:<name>`, `mcp:<name>`) the component requires the host to provide, declared by name only |
| `### Shape` | service | Capability boundaries: self, delegates, prohibited work |
| `### Wiring` | system | Explicit binding when auto-wiring should be pinned |
| `### Execution` | system/service | ProseScript choreography |
| `### Fixtures` / `### Expects` / `### Expects Not` | test | Test data and assertions |
| `### Slots` / `### Config` / `### Delegation` | pattern | Pattern interface and algorithm |
| `### Goal` / `### Continuity` / `### Criteria` / `### Constraints` / `### Tools` / `### Fulfillment` | responsibility | Standing-goal contract |
| `### Schedule` / `### Receives` / `### Emits` / `### Payload` | gateway | Time/event ingress declarations |

Unknown `###` sections are preserved as documentation; they are not contract
sections.

> **Audit note — `### Tools` is required on responsibilities; `### Skills` is
> a real section.** The compile preflight
> (`validateResponsibilitySources` in `compile.ts`) emits a
> `missing_required_section` diagnostic and fails the compile if a
> `kind: responsibility` file has no `### Tools` section — an empty
> `### Tools` with `(none)` satisfies it, an absent one does not. Every
> bundled responsibility example includes an explicit `### Tools` section for
> this reason. Separately, `### Skills` is a current canonical section
> (declaring harness skills in `namespace:name` form, resolved fail-closed
> against `./skills/`, `~/.claude/skills/`, `~/.codex/skills/`,
> `~/.agents/skills/`); the deterministic preflight
> (`preflightDeclaredSkillsInRoot`) emits `skill_unresolved`. `### Skills`
> and `### Description` are part of the live language surface.

Header hierarchy is part of the language:

| Header | Meaning |
| --- | --- |
| `#` | Optional human title |
| `##` | Inline service boundary inside multi-service files |
| `###` | Section inside the current service/system/test/pattern/responsibility |
| `####`+ | Free-form nested documentation inside a section |

The source-compiler's `parseMarkdownSections` and `splitMarkdownComponents`
implement this hierarchy directly (`repository-source-compiler.ts`,
`compile.ts`), including fenced-code awareness so a `###` inside a code fence
is not mistaken for a section.

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

> **Audit note — pattern-instance lowering in the deterministic compiler.**
> The deterministic source-compiler's `compileFormeManifest`
> (`repository-source-compiler.ts`) wires systems by parsing `### Services`
> into plain service names and resolving each against discovered source by
> `name`. Structured pattern-instance YAML (`pattern:`/`with:`/`config:`) is
> *authored* syntax that the language recognizes and the pinned ProseScript
> compiler is meant to expand, but the deterministic TypeScript fallback
> compiler resolves only plain service-name entries and subsystem-by-name
> entries; a pattern-instance entry that does not name a resolvable source
> emits a `warning` diagnostic. Pattern instantiation is therefore fully
> *specified* and exercised in smoke fixtures
> (`tests/open-prose/smoke/09-local-pattern.prose.md`), but the deterministic
> compiler's Forme lowering does not itself expand patterns into graph nodes.

### Forme

Forme is OpenProse's semantic dependency-injection container. Traditional
containers wire by type. Forme wires by reading contracts. The doctrine is
`skills/open-prose/forme.md`.

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

The deterministic source-compiler emits a structured Forme manifest per system
as `formeManifests[]` in repository IR: graph nodes with workspace paths,
input/output bindings, a topological `executionOrder`, declared `environment`
variables, and declared `tools`, each with `requiredBy` node lists
(`compileFormeManifest`, `wireFormeInputs`, `executionOrderFor` in
`repository-source-compiler.ts`). Input wiring matches a node's `### Requires`
field names against upstream `### Ensures` outputs; an unmatched field becomes
a `caller` input. This is name-equality wiring; the richer semantic-equivalence
and shape-hint matching in the Forme doctrine is the pinned ProseScript
compiler's responsibility.

### Prose VM

The Prose VM is the execution semantics (`skills/open-prose/prose.md`). When an
agent runs OpenProse, it is not merely describing a VM. It performs the VM by
mapping the spec to host tools, spawning real sessions, writing real artifacts,
and evaluating real contracts.

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

OpenProse specifies four state backends, each with a doc under
`skills/open-prose/state/`: filesystem (`filesystem.md`, the default and
normative reference), in-context (`in-context.md`, for small ephemeral runs),
SQLite (`sqlite.md`), and PostgreSQL (`postgres.md`). SQLite and PostgreSQL are
documented as experimental durable alternatives that keep the run envelope but
move events and data-plane bindings into database records.

> **Audit note — the VM is host-embodied.** The Prose VM is not a TypeScript
> implementation in this repository. Execution is performed by the selected
> agent harness embodying the semantics in `prose.md`. The CLI forwards
> `prose run`/`prose test` to the harness; it does not itself spawn service
> sessions or copy bindings. The deterministic code's role is compile, IR
> validation, status reading, and serve dispatch — see the CLI subsection.

### ProseScript

Contract Markdown is declarative. ProseScript is the pinning layer
(`skills/open-prose/prosescript.md`).

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
ProseScript should not redeclare them. When `### Execution` is present it is a
Level 3 pin: Forme still validates contracts and extracts the call graph, but
the VM follows the written order.

### Responsibility Runtime

Responsibility Runtime is the continuity layer for repositories that need
standing goals to remain true over time
(`skills/open-prose/responsibility-runtime.md`).

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
- `### Tools`: declared host capabilities (`cli:`/`mcp:`) — a **required**
  section, even when `(none)`.
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

Current live serve support includes local cron and HTTP adapters
(`tools/cli/src/prose/repository-serve-reactor-adapters.ts`,
`repository-cron.ts`, `repository-serve-daemon.ts`). Queues, file watches,
provider subscription setup, webhook authentication, and automatic manifest
reload are explicitly later phases (stated in `responsibility-runtime.md`).
Judge activations use the bundled
`skills/open-prose/runtime/judge-responsibility.prose.md` service. Pressure
records (`responsibility-pressure.ts`, `responsibility-pressure-dispatch.ts`)
are deduped by responsibility fingerprint, status, source-status timestamp,
activation class, and activation id.

### Repository IR v0

`prose compile` lowers source under an OpenProse root into generated repository
IR. Markdown remains the durable authoring surface; IR is disposable compiled
intent consumed by deterministic infrastructure. The IR v0 contract is
`skills/open-prose/compiler/ir-v0.md`; the TypeScript types and validator are
`tools/cli/src/prose/repository-ir.ts`.

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

These are the `NEXT_REPOSITORY_IR_PATH` and `ACTIVE_REPOSITORY_IR_PATH`
constants in `repository-ir.ts`. Promotion from next to active is explicit
(by convention `cp dist/manifest.next.json dist/manifest.active.json`).

IR records include:

| Record | Meaning |
| --- | --- |
| `sources[]` | Discovered source files: root-relative `path`, `kind`, optional `name` |
| `responsibilities[]` | `id`, `sourcePath`, `goal`, `continuity[]`, `criteria[]`, `constraints[]`, `tools[]`, optional `fulfillment` |
| `triggers[]` | Concrete `cron`, `http`, or `manual` trigger registrations keyed to a responsibility id |
| `activations[]` | `judge`, `fulfillment`, `retry`, or `escalation` intent |
| `formeManifests[]` | Structured runtime wiring for systems |
| `diagnostics[]` | `info`/`warning` messages with optional source paths (a written manifest may not contain `error`-severity diagnostics) |

> **Audit note — `prose compile` runs a deterministic compiler too.** The spec
> describes `prose compile` as forwarding to a pinned ProseScript compiler
> (`skills/open-prose/compiler/index.prose.md`) and then deterministically
> *validating* the model-produced JSON. That is accurate but incomplete for
> the current code. `runCompileCommand` (`tools/cli/src/commands/compile.ts`)
> *also* ships a complete deterministic TypeScript source-compiler,
> `compileRepositorySource` (`repository-source-compiler.ts`), which discovers
> every `.prose.md` under the source root and emits a full valid
> `manifest.next.json` — responsibilities, triggers, activations, and Forme
> manifests — purely from the Markdown. The CLI uses it as a fallback:
> `writeSourceCompiledRepositoryIrIfMissing` writes the deterministic IR when
> the harness produced none, and `shouldAcceptNonzeroCompiledManifest`
> accepts a valid deterministic IR even when the harness exits non-zero. So
> the current `prose compile` has *two* compilers — the model-run ProseScript
> program and a deterministic TypeScript one — and the deterministic one is
> exercised by the compiler fixtures (`tests/open-prose/compiler/expected/`).
> The Ideal commits the compiler to be a model-run Prose service (Tenet 2);
> the current code has a deterministic fallback that does the same lowering.

Important compiler doctrine (from `responsibility-runtime.md` and `ir-v0.md`):

- Discover every `.prose.md` under the source root.
- Infer only when the source graph is clear; the deterministic compiler infers
  fulfillment when exactly one system (or, absent systems, one service) is
  present, and warns when multiple systems are plausible.
- Warn instead of guessing timing, fulfillment, or wiring.
- Do not invent provider auth, queue names, routes, payload schemas, or
  subscription setup.
- Write `manifest.next.json` only after the IR shape is valid.

Repository IR v0 is **frozen and source-derived**: it is a function of the
`*.prose.md` source and nothing else. The Reactor harness's policy artifact,
token-truth receipts, forecasts, and decisions are **sibling runtime state**
owned by `@openprose/reactor` — not IR fields and not new source syntax. See
Part III §3 and [02-ReactorHarness.md](./02-ReactorHarness.md)
("The two compiles").

### CLI

The CLI package is `@openprose/prose-cli`, version `0.14.0` at the audited
state (`tools/cli/package.json`). It is an Oclif TypeScript package published
as the `prose` binary.

Its two jobs are:

1. Turn user-facing commands into canonical OpenProse prompts for agent
   harnesses.
2. Host deterministic local runtime pieces for repository IR, status, and
   trigger serving.

Current local deterministic commands (have a dedicated `Command` class in
`tools/cli/src/commands/`):

| Command | Role |
| --- | --- |
| `prose help` | Oclif help |
| `prose doctor` | Inspect or install selected provider skill targets |
| `prose compile` | Run the (preflight + harness + deterministic-fallback) compile, then validate generated IR |
| `prose status` | Read active IR and runtime receipts locally |
| `prose serve` | Serve active IR with local cron and HTTP adapters |

Current forwarded commands (defined as `ForwardCommandDefinition` entries in
`commands/index.ts`):

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
| `prose write` | Generate validated OpenProse source from rough English or pseudo-Prose |

> **Audit note — `prose write` is a new command (v0.14.0).** `prose write`
> and the `std/ops/prose-author` contract were added in `0.14.0` (see
> `CHANGELOG.md`). In-harness it is interactive by default and may ask
> targeted `ask_user` questions after a read-only landscape scan and
> shape/root inference; the shell CLI wrapper is non-interactive, forwards
> argv/stdin with `interactive: false`, and returns `unresolved-intent`
> rather than guessing. It is part of the current language tooling and is
> absent from the Ideal section.

Harness selection uses `--harness` or `PROSE_HARNESS`. The documented harnesses
are `codex-sdk`, `claude-sdk`, and `mock`; `codex-sdk` is the default
(`env.PROSE_HARNESS || "codex-sdk"` in `tools/cli/src/commands/base.ts`).

`prose serve` loads `dist/manifest.active.json`, validates it, registers local
cron timers and HTTP routes, exposes `GET /_openprose/health`
(`repository-serve-daemon.ts`), and dispatches accepted events into ordinary
`prose run` activations. HTTP triggers return `202 Accepted` before
long-running agent work completes.

### Dependencies

OpenProse dependencies are git-native and disk-only at runtime
(`skills/open-prose/deps.md`).

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

| Category | Contents (audited file count) |
| --- | --- |
| `roles/` | 10 atomic role services: `classifier`, `critic`, `extractor`, `formatter`, `planner`, `researcher`, `router`, `summarizer`, `verifier`, `writer` |
| `patterns/` | 19 reusable coordination patterns: `assumption-miner`, `blind-review`, `coherence-probe`, `contrastive-probe`, `dialectic`, `ensemble-synthesizer`, `fallback-chain`, `fan-out`, `guard`, `map-reduce`, `oversight`, `pipeline`, `proposer-adversary`, `race`, `ratchet`, `refine`, `retry-with-learning`, `stochastic-probe`, `worker-critic` |
| `ops/` | Operational systems: `diagnose`, `lint`, `preflight`, `profiler`, `status`, `wire`, plus `prose-author` (the `prose write` backing contract, with its test suite) |
| `delivery/` | Human gate, email, Slack, webhook, HTML rendering, and file writing |
| `memory/` | Project and user memory services |
| `evals/` | `contract-grader`, `cross-run-differ`, `eval-calibrator`, `inspector`, `platform-improver`, `prose-contributor`, `regression-tracker`, `system-improver` |

> **Audit note — std additions since the prior spec.** The prior Part II
> listed `ops/` as `lint, preflight, wire, status, diagnose, profiler` and
> `evals/` without `prose-contributor`. The current `ops/` also contains
> `prose-author.prose.md` (the backing contract for `prose write`, shipped
> with eight `*.test.prose.md` files), and the current `evals/` also contains
> `prose-contributor.prose.md`. The pattern and role inventories above are
> the audited file listing.

The `roles` README describes roles as the atoms. Patterns are the molecules:
they define slots, config, invariants, and delegation algorithms that systems
instantiate. The eval and ops libraries make the feedback loop explicit: a run
can be inspected, graded against contracts, compared across runs, diagnosed,
profiled, and used to propose source or platform improvements.

### Company-As-Prose Package

`packages/co/` is a first-party but domain-shaped package. It sits beside
`std`, not inside it.

`std` is use-case agnostic. `co` is an opinionated starter kit for operating a
company as an OpenProse-native repository. The current public contracts are:

| Contract | Role |
| --- | --- |
| `co/services/agent-readiness` | Probe a company's website for agent-discoverability and plain-HTML readiness |
| `co/systems/company-repo-checker` | Verify a company-as-prose repo matches shared layout and contract expectations |
| `co/evals/agent-readiness`, `co/evals/company-repo-checker` | Evaluations for the package services/systems |

The package explicitly avoids OpenProse, Inc. private business logic. It is
generic company-operations scaffolding. As audited, `co/` contains exactly one
service, one system, and two eval contracts — a small, focused package.

### Examples

The examples under `skills/open-prose/examples/` divide into two groups.

**Native OpenProse repositories** — full responsibility-runtime examples, each
with `src/`, `dist/`, `runs/`, `state/`, `deps/`, and `prose.lock`:

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

Each of these eight repositories follows the shared lifecycle:

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose serve
```

and each demonstrates the current architecture: a responsibility defines the
standing goal, a gateway provides time/event ingress, a fulfillment system
composes services, and project-scoped memory updates durable ledgers. All
eight responsibility source files carry a valid `id:` frontmatter field.

**Minimal feature demos** — smaller examples that each isolate one language
feature:

| Example | Demonstrates |
| --- | --- |
| `declared-skills` | `### Skills` resolution and the `skill_unresolved` diagnostic |
| `declared-tools` | `### Tools` resolution and the `tool_unresolved` diagnostic |
| `auto-pocock` | A non-interactive 12-service system adapting an external skill workflow |
| `flat-tokens` | A Reactor-runtime (`packages/reactor`) token-accounting demo — Reactor-harness material, not language material; see [02-ReactorHarness.md](./02-ReactorHarness.md) |

### Tests And Release

The current repository has several layers of validation:

| Layer | Coverage |
| --- | --- |
| Contract smoke fixtures | `tests/open-prose/smoke/` — 10 `*.prose.md` fixtures: single service, caller input, auto-wiring, inline services, explicit wiring, ProseScript execution, errors/strategies, `kind: test`, local pattern instantiation |
| Compiler fixtures | `tests/open-prose/compiler/` — expected repository IR (`expected/empty`, `expected/stargazer`, `expected/ambiguous-fulfillment`) and invalid IR shapes (`invalid/malformed-forme`, `invalid/malformed-responsibility`, `invalid/missing-version`) plus source fixtures including a `missing-criteria` invalid responsibility |
| CLI tests | `tools/cli/tests/` — 26 `*.test.ts` files across `cli/`, `prose/`, `harnesses/`, `skills/`, `tools/`, `install/`, `package/` |
| IR validation tests | Source paths, cron/http/manual triggers, judge-activation rules, fulfillment/Forme consistency, diagnostics — exercised against `repository-ir.ts` |
| Responsibility tests | Status records, pressure records, dedupe, freshness, activation routing |
| CI workflows | `.github/workflows/` — CLI release checks, real harness smoke, skill install smoke, OpenProse smoke, plugin manifest validation, release publishing |

The release process uses one release train. Skill metadata, plugin metadata,
CLI npm package, package lock, and tarball installer share the same `X.Y.Z`
version (`.version-bump.json`, `.plugin-meta.json`). The protected release
workflow verifies CLI/package/plugin surfaces, publishes `@openprose/prose-cli`,
and creates a GitHub Release.

### Mental Model

> **Audit note.** This mental model is reported as the *current taught* model.
> The Ideal (Part I) and the Roadmap (Part III §1) call for inverting it so
> the responsibility, not the system, is the headline. It is preserved here as
> an accurate record of what the skill currently teaches.

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
| ProseScript | Imperative choreography language inside `### Execution` and pattern `### Delegation` |
| Repository IR | Generated JSON manifest consumed by deterministic runtime infrastructure |
| Responsibility | Standing goal that must remain true over time |
| Reactor | Evented reconciliation model for responsibilities |
| Service | Atomic execution boundary: one contract, one session, one workspace |
| System | Composition boundary implemented as a graph of services/systems/pattern instances |

---

## Part III — Roadmap (the Delta)

The gap between Part I and Part II is **almost entirely doctrine, not syntax.**
The finding across this doc, the Harness doc, and the Pattern doc is
that the ideal language needs **no new `*.prose.md` syntax** — the six kinds,
the canonical sections, and the header hierarchy already express everything,
with one bounded exception: composition pins a reserved `responsibility`
typed-input (the same mechanism as `run`/`run[]`), so the supply-chain edge is
kernel-verifiable rather than prose-asserted (§3).
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

### 4. Converge the two compilers, or document the split deliberately

Part II's audit found that `prose compile` currently ships **two** compilers:
the pinned model-run ProseScript program
(`skills/open-prose/compiler/index.prose.md`) and a deterministic TypeScript
source-compiler (`tools/cli/src/prose/repository-source-compiler.ts`) used as a
fallback. The Ideal commits the compiler to be a Prose service the model runs
(Tenet 2: intelligence in the model, deterministic code only validates). The
deterministic fallback does real lowering — including fulfillment inference and
Forme-manifest construction — which is more than validation.

The roadmap item is a deliberate decision, not a silent drift: either (a) the
deterministic compiler is reframed as *only* a structural validator and the
model-run compiler becomes the sole lowering path, or (b) the deterministic
compiler is acknowledged in the Ideal as a permitted, semantics-free
mechanical lowering (name-equality wiring, no judgment) that coexists with the
model-run compiler for ambiguous graphs. This doc's Ideal currently assumes
(a); the code currently does (b). Resolving which the language commits to is
owed work.

### Definition of done for the language layer

- The mental model and runnable framing are responsibility-first; the
  system-first model survives only as the explicitly labeled N=0 case.
- `SKILL.md` routes standing-goal language to responsibility authoring first.
- `contract-markdown.md` documents `### Continuity` as forecast/memo input and
  `### Criteria` decidability with the undecidable-`blocked` doctrine.
- No new syntax is introduced; every change is doctrine, docs, or routing.
- The IR-vs-sibling-state boundary is stated and cross-linked, not implied.
- The two-compiler relationship is resolved into a single committed doctrine.
