---
role: contract-markdown-format
summary: |
  Canonical Markdown format for OpenProse responsibilities, functions, gateways,
  patterns, and tests. Defines the header hierarchy, contract sections, and how
  interpreters extract `*.prose.md` source for the mounted-node DAG.
see-also:
  - forme.md: Wiring semantics (the responsibility DAG)
  - prose.md: Execution semantics (the render harness)
  - responsibility-runtime.md: Compile/run reconciler semantics
  - prosescript.md: Imperative scripting layer for `### Execution`
  - guidance/tenets.md: Design reasoning
  - guidance/authoring.md: Authoring guidance
---

# Contract Markdown

Contract Markdown is the human-facing `*.prose.md` format for OpenProse
responsibilities, functions, gateways, patterns, and tests. It uses tiny YAML
frontmatter for file identity, then Markdown sections for the human-facing
language: contracts, the world-model schema, runtime hints, and the render body.

Every authored file is **one render** — a declaration plus the bounded session
that runs it. The `kind` field is sugar over that single render atom: each kind
is the same render with different or missing sections (`plan.md` §1).

The format optimizes for two readers:

1. Humans scanning a workflow.
2. Agents extracting contracts and wiring the responsibility DAG with Forme.

## Authored Kinds

`prose run` and the reactor recognize five kinds. Two are **data-flow kinds**
(sugar over the render atom); three are **tooling kinds**.

- **Responsibility** — a *mounted node*: the headline kind. A responsibility
  declares its inputs as subscription contracts (`### Requires`) and the shape
  of the standing truth it keeps current (`### Maintains`), and is woken over
  time. Mounting (a harness act) gives it identity, a persisted world-model, and
  resolved subscriptions. A responsibility is a node because it is mounted as a
  subscribable producer — **not** because it holds state (`plan.md` §2).

- **Function** — a *called* render: the library tier, and the replacement for the
  retired `service`. A function is stateless and ephemeral. Its interface is
  `### Parameters` → `### Returns` — a plain call interface, not a subscription
  contract — so it carries no world-model and no `### Continuity`. You call
  functions constantly and author them rarely; most ship pre-built in `std/`.

- **Gateway** — *sugar for an external-driven responsibility*. A gateway is how
  time or the outside world enters the graph: schedules, local HTTP routes,
  webhooks, or provider events. It has no `### Requires` (its input arrives from
  outside the graph) and declares `### Continuity: external-driven`. It maintains
  the latest incoming truth. Forme finds the entry-point set precisely by finding
  the responsibilities whose `### Continuity` is external-driven.

- **Pattern** — a reusable agent design pattern: slots, config, invariants, and
  delegation rules. Patterns are not run directly; they are instantiated at
  compile time and expanded into nodes.

- **Test** — a harness executed by `prose test`: it supplies fixtures, runs a
  subject responsibility or function, and evaluates assertions over the subject's
  world-model / returned value.

There is **no `system` kind**. Composition is imperative `call` *inside* a render
(ProseScript `### Execution`) or a cross-node *subscription* across
responsibilities (wired by Forme) — never a third "internally-autowired graph"
kind in the middle (`plan.md` §3).

A run starts from the file the caller invokes, which is a responsibility,
function, or gateway.

### Gateway shape

Gateway sections are intentionally small. A gateway always declares
`### Continuity: external-driven`:

```markdown
---
name: github-stars
kind: gateway
---

### Continuity

- external-driven

### Receives

- POST /webhooks/github/stars
- Provider: GitHub
- Event: star

### Maintains

- `stargazers`: the latest incoming star events as structured truth

### Emits

- high-intent-stargazer-outreach
```

## Core Shape

A `function` declares a plain call interface:

````markdown
---
name: research-report
kind: function
---

### Parameters

- `topic`: the question to investigate

### Returns

- `report`: concise answer with sources

### Strategies

- when sources are thin: broaden search terms

### Execution

```prose
let findings = call researcher
  topic: topic

return findings
```
````

A `responsibility` declares subscription contracts and the world-model schema it
maintains:

````markdown
---
name: competitor-activity-monitor
kind: responsibility
id: 067NC4KG01RG50R40M30E20918
---

### Goal

A current, corroborated view of each tracked competitor's material activity.

### Requires

- `funding-signals`: a current view of competitor funding events
- `hiring-signals`: a current view of competitor hiring activity

### Maintains

- `competitors`: per-competitor truth with `funding`, `hiring`, and
  `product-launches` facets
- each competitor has: a name, the latest material events, and a
  `last_corroborated` freshness field
- material: the event set and corroboration status; immaterial: `fetched_at`
  timestamps and source request ids
- postcondition: every listed competitor cites at least one corroborating source

### Continuity

- self-driven: re-check every 6h
````

## Header Hierarchy

| Level | Meaning |
|-------|---------|
| `#` | Optional human title. Ignored by Forme unless no frontmatter `name` exists. |
| `##` | Inline responsibility/function boundary in multi-node files. |
| `###` | Section inside the current responsibility, function, or gateway. |
| `####`+ | Free-form nested documentation inside a section. |

`##` is reserved for inline node names so a file can contain several
responsibilities or functions without ambiguous parsing. Contract sections use
`###` so they work uniformly in standalone files and inside inline nodes.

## Canonical Sections

Forme and the Prose VM recognize these `###` sections case-insensitively:

| Section | Applies To | Purpose |
|---------|------------|---------|
| `### Description` | all | Human summary. Preserved for readers; not used as a contract |
| `### Goal` | responsibility, gateway | The render's one-sentence standing intent |
| `### Requires` | responsibility, pattern slots | Subscription contracts naming facet-level needs; Forme's match target (`Requires.<facet> ↔ Maintains.<facet>`) |
| `### Maintains` | responsibility, gateway | The world-model **schema** — type, canonicalization spec, facets, and postconditions (see [Maintains](#maintains)) |
| `### Parameters` | function | Inputs the caller passes at call time |
| `### Returns` | function | The value the function returns |
| `### Continuity` | responsibility, gateway | The intrinsic wake-source declaration: input-driven, self-driven, or external-driven (see [Continuity](#continuity)) |
| `### Errors` | responsibility, function | Declared failures the node may signal |
| `### Invariants` | responsibility, function, pattern | Properties that must hold regardless of outcome |
| `### Strategies` | responsibility, function, test | Guidance for judgment calls and edge cases |
| `### Environment` | responsibility, function | Runtime variables supplied by host infrastructure |
| `### Runtime` | responsibility, function | Execution hints such as `model` |
| `### Skills` | responsibility, function | Agent harness skills the component requires the host harness to provide. See [Skills](#skills) |
| `### Tools` | responsibility, function | Host tools the component requires the host environment to provide. See [Tools](#tools) |
| `### Shape` | responsibility, function | Capability boundaries: self, delegates, and prohibited work |
| `### Execution` | responsibility, function | ProseScript render body that pins choreography |
| `### Fixtures` | test | Test inputs supplied without prompting |
| `### Expects` | test | Positive natural-language assertions |
| `### Expects Not` | test | Negative natural-language assertions |
| `### Slots` | pattern | Responsibilities or functions a pattern requires from its caller |
| `### Config` | pattern | Pattern-level parameters and defaults |
| `### Delegation` | pattern | ProseScript or pseudocode describing slot interaction |
| `### Schedule` | gateway | Optional cron-like ingress cadence |
| `### Receives` | gateway | Optional HTTP/event ingress description |
| `### Emits` | gateway | Responsibility name the gateway should wake |
| `### Payload` | gateway | Notes about the event payload shape |

Unknown `###` sections are preserved as documentation. They are not contract
sections unless a future spec names them.

### Folded and deleted sections

The judge-era responsibility vocabulary folds into the world-model model:

| Legacy section | Folds into |
|----------------|------------|
| `### Ensures` | `### Maintains` (data-flow) / `### Returns` (function) — re-purpose, not just rename |
| `### Criteria` | `### Maintains` postconditions |
| `### Fulfillment` | the render itself, or a delegated `function` |
| `### Constraints` | `### Invariants` / `### Shape` |
| `### Memory` | the single persisted world-model (responsibility); dropped (function) |
| `### Services` / `### Wiring` | deleted with `system`; composition is `call` or subscription |

`### Memory` is gone: one persisted world-model per node subsumes the old
reads/writes ledger (`world-model.md` §9.4). A `function` is stateless and has no
world-model, so it simply has no memory; a former `service`-with-memory that was
genuinely stateful is really a `responsibility`, and its persisted state is its
world-model.

## File Extraction

Interpreters parse a file in this order:

1. Read YAML frontmatter for identity metadata (`name`, `kind`; `kind: test`
   files also declare `subject`; `kind: responsibility` files declare `id`).
2. Create the file-level responsibility, function, gateway, pattern, or test from
   the frontmatter.
3. Attach all `###` sections before the first `##` to the file-level entry.
4. For every `## {name}` heading, create an inline node named `{name}`.
5. Attach subsequent `###` sections to that inline node until the next `##`.

Example — a file with one responsibility and two helper functions it `call`s:

````markdown
---
name: content-pipeline
kind: responsibility
---

### Requires

- `draft`: text to improve

### Maintains

- `final`: the current polished text

### Execution

```prose
let notes = call review
  draft: draft

let polished = call polish
  draft: draft
  feedback: notes

return polished
```

## review

### Parameters

- `draft`: text to review

### Returns

- `feedback`: editorial notes

## polish

### Parameters

- `draft`: original text
- `feedback`: editorial notes

### Returns

- `final`: polished text
````

The file-level responsibility requires `draft` and maintains `final`. It also
contains inline functions `review` and `polish` that its render `call`s.

## Responsibilities

A `kind: responsibility` is a mounted DAG node: a standing truth kept current
over time. It declares both halves of its interface — `### Requires` (what it
subscribes to) and `### Maintains` (the shape of the truth it keeps) — and its
wake-source in `### Continuity`.

```markdown
---
name: qualified-stargazer-outreach
kind: responsibility
id: 067NC4KG01RG50R40M30E20918
---

### Goal

High-intent GitHub stargazers are identified, enriched, and thoughtfully
followed up with.

### Requires

- `stargazers`: a current view of new high-intent stargazers

### Maintains

- `outreach`: per-stargazer truth with `qualification`, `enrichment`, and
  `contact-history` facets
- each entry has: GitHub activity, company context, plausible pain, and the
  outreach already sent
- material: qualification verdict and contact history; immaterial: scan timestamps
- postcondition: outreach is specific (a concrete program idea or sample result),
  never generic
- postcondition: a stargazer is never contacted twice without new evidence

### Continuity

- input-driven

### Tools

(none)
```

Forme matches each `### Requires` facet-contract to the `### Maintains` facet
that satisfies it semantically, across all mounted responsibilities, and draws
the subscription edge (`plan.md` §5). `### Requires` is the *need* (intent stays
with the human); the resolved producer is Forme's choice (mechanism).

Load `responsibility-runtime.md` and `concepts/responsibility.md` for the
compile/run reconciler semantics.

## Maintains

`### Maintains` declares the **shape** of the world-model — the schema, not the
instance. It is not just a renamed `### Ensures`: a maintained truth is a
standing, typed, subscribable artifact, so its declaration does **four jobs**
(`world-model.md` §2):

1. **A type** — the fields and their shapes, including any freshness fields
   (`valid_until`, `last_corroborated`, `confidence`; see [Continuity](#continuity)).
2. **A canonicalization spec** — *what equality means* for the fingerprint: which
   fields are material, which are volatile-but-immaterial and excluded
   (timestamps, request ids, cosmetic ordering), and how sets / numbers / text
   normalize. This is the single highest-leverage memoization control: without
   it, a feed re-polled every few minutes always *looks* changed and "cost scales
   with surprise" degrades into "cost scales with the clock."
3. **Facets** (optional) — named, independently-subscribable parts of the truth.
   A downstream that subscribes to facet *X* does not wake when facet *Y* moves.
   A single-truth (leaf) node declares none; its atomic world-model is the one
   implicit facet, so a `### Requires` match still resolves.
4. **Postconditions** — the folded-in `### Criteria`: validators the render must
   leave the truth satisfying before it signs. Not a separate judge beat; just
   conditions on the output. Deterministically-expressible postconditions are
   verified by the harness on commit; irreducibly-semantic ones are self-attested
   by the render.

All four jobs live **inside** `### Maintains` — none gets its own block. The
canonicalization spec and facet declarations may be written as semantically rich
natural language, as long as they are unambiguous, because the spec is **compiled
into a deterministic canonicalizer ahead of run time** (`world-model.md` §3). The
compiled canonicalizer travels with the contract, so a standalone render computes
its own fingerprints and signs a fingerprinted receipt with no harness present.

**The structured-backing rule.** Anything *subscribed* must have a structured,
canonicalizable backing. Free-form rendered prose is a derived projection excluded
from the fingerprint — otherwise an LLM re-rendering the same paragraph hashes
differently every time and falsely re-triggers downstreams. Rule: fingerprint the
structured truth; render prose *from* it (`world-model.md` §3). The compiler lints
subscribed fields that lack a structured backing.

The world-model itself — the materialized truth the render writes and commits —
is a content-addressable artifact, a directory by default. `### Maintains`
describes its shape; `state/filesystem.md` describes its on-disk canonical form.
(Where facet and material annotations physically sit inside the block — inline vs
a sub-block — is an open ergonomics question; atomic-only is the v1 default,
`world-model.md` §9.5.)

## Continuity

`### Continuity` is the node's **wake-source** declaration — *what can wake this
node* — and is **intrinsic** to the responsibility: it travels with the contract,
not the mount (`plan.md` §4; `architecture.md` §4.2). It has three modes:

- **input-driven** (the default) — woken by an upstream node's receipt whose
  subscribed facet-fingerprint moved. Falls out of `### Requires`, so it needs no
  explicit declaration.
- **self-driven** — a declared cadence (e.g. "re-check every 6h", "re-validate
  when stale"). The node's own continuity clock emits a *synthetic self-receipt*
  (a tick); the node re-renders and either writes a moved fingerprint (surprise
  propagates) or an unmoved one (the tick stops there, costing nothing
  downstream).
- **external-driven** — a declared outside trigger (webhook / cron / manual kick).
  This is the `gateway` case; its input arrives from outside the graph.

Every wake is a receipt; the only variable is who emitted it (`world-model.md`
§5). `### Continuity` declares *which* sources may wake a node — it never makes the
wake decision intelligent; the reconciler stays dumb.

**Freshness — state vs. policy.** Freshness *state* (`valid_until`,
`last_corroborated`, `confidence`) lives **in the world-model** as data declared
by `### Maintains`. Freshness *policy* — the recheck cadence — lives in
`### Continuity`. The bridge: a `valid_until` lapsing flips a fact's status, which
moves that facet's fingerprint, so "time becoming material" is just another change
that propagates as surprise (`world-model.md` §6). `### Continuity` may *read* the
world-model's soonest `valid_until` to drive a data-driven recheck cadence, but
the cadence rule stays in `### Continuity` and the expiry data stays in the
world-model.

## Functions

A `kind: function` is a called helper — stateless, ephemeral, and the replacement
for the retired `service`. Its interface is `### Parameters` → `### Returns`, a
plain call interface: arguments in, a value out. A function carries no
world-model, no `### Maintains`, and no `### Continuity`.

```markdown
---
name: summarizer
kind: function
---

### Parameters

- `text`: the document to compress

### Returns

- `summary`: a five-bullet précis preserving key claims
```

Functions are invoked from a render body with ProseScript `call`:

```prose
let s = call summarizer
  text: document
```

You author functions rarely and call them constantly; most ship pre-built in
`std/`. They are the standard-library tier — the place the "unmounted" render
actually lives (`plan.md` §3).

## Patterns

A `pattern` is a reusable agent design pattern: slots, config, invariants, and
delegation rules for how filled nodes interact. Patterns are not run directly;
they are instantiated at compile time and expanded into nodes.

````markdown
---
name: worker-critic
kind: pattern
---

### Slots

- `worker`: produces the draft
- `critic`: reviews and returns notes

### Config

- `max_rounds`: 3

### Delegation

```prose
loop up to config.max_rounds:
  let draft = call worker ...
  let notes = call critic draft: draft
  if notes.accepted: break
```
````

A pattern is instantiated with a fenced `yaml` declaration. Use `with:` for slot
bindings and `config:` for pattern parameters:

```yaml
- name: reviewed-draft
  pattern: std/patterns/worker-critic
  with:
    worker: writer
    critic: reviewer
  config:
    max_rounds: 3
```

`pattern:` names a `kind: pattern` file. `with:` binds slots to responsibilities,
functions, or nested pattern instances. After expansion, the named instance
behaves like a node. Nested pattern declarations are allowed only as slot values
inside another pattern instance's `with:` block.

## Structured Blocks

Use Markdown structure directly for Markdown: section headers, bullets, and
tables are the language surface and should not be wrapped in code fences.

Use fenced `yaml` only for structured YAML declarations such as pattern
instances. Use fenced `prose` only for ProseScript in `### Execution` and pattern
`### Delegation`. Do not use `markdown` or `text` fences as structured data
formats.

## Runtime and Shape

Runtime hints and behavioral boundaries are sections:

```markdown
### Runtime

- `model`: sonnet

### Shape

- `self`: evaluate sources, score confidence
- `delegates`:
  - `summarizer`: compression
- `prohibited`: direct web scraping
```

`### Shape` describes the capability boundary of *this render*. `delegates` names
the helper functions the render `call`s inside the node (intra-node, ephemeral) —
it is not a DAG edge and not a subscription. Cross-node dependency is expressed
only through `### Requires` / `### Maintains`.

## Skills

A responsibility or function that depends on the host agent's harness skills
declares them in a `### Skills` section. The compiler resolves the named skills
against the host's installed skills before emitting the component's IR, and
`prose compile` fails closed with a `skill_unresolved` diagnostic if any are
missing.

```markdown
### Skills

- document-skills:pdf
- document-skills:xlsx
```

Skill names use the `namespace:name` colon form that matches the plugin
marketplace convention shown in `/skill` invocations.

Rules:

- A responsibility's skill declarations apply to every function its render
  `call`s. Node-level declarations are *additive*, not exclusive.
- The compiler resolves each declared skill by looking, in order, in:
  1. The project's `./skills/` directory.
  2. `~/.claude/skills/`.
  3. `~/.codex/skills/`.
  4. `~/.agents/skills/`.
- If a declared skill cannot be resolved in any of those paths, `prose compile`
  fails closed with a `skill_unresolved` diagnostic naming the skill and the
  paths that were searched.

The compiler program implements this resolution rule; see
`skills/open-prose/compiler/index.prose.md` (`skills_resolver`) for the
program-level contract.

### BYO harness invariant

OpenProse never installs, modifies, or removes the user's harness skills.
Installing skills is the user's responsibility; the compiler only verifies they
are present and stops the compile when they are not.

## Tools

A responsibility or function that depends on host capabilities declares them in a
`### Tools` section. Tool declarations are host capability requirements: they do
not satisfy `### Requires`, do not create Forme dependency-graph edges, and do not
grant or restrict tool use. Use `### Shape` for capability boundaries and
prohibited actions.

```markdown
### Tools

- `cli:gh`: GitHub CLI available on PATH for PR inspection
- `cli:jq`: JSON CLI available on PATH for JSON validation
- `mcp:gmail`: MCP server registered with the host
```

The supported deterministic tool declaration shapes are `cli:<executable-name>`
and `mcp:<server-name>`. A CLI executable name is the command name the host should
find by PATH lookup. An MCP server name is the registered server name the host
advertises. Names must be non-empty and must not contain path separators. Tool
declarations belong only in the `### Tools` section; there is no frontmatter form.

Rules:

- A responsibility's tool declarations apply to every function its render `call`s.
  Node-level declarations are additive, not exclusive.
- `cli:<name>` checks only executable presence on PATH. Version ranges, auth
  checks, and installer behavior are outside the declaration.
- `mcp:<name>` checks only server presence in the host MCP registry. The compiler
  does not install, contact, or introspect the server during this check.
- For `kind: responsibility`, declared tools are the host capabilities the render
  may use to observe and act on the maintained truth. The compiler does not
  pre-split read vs write; capability scope is enforced by the connector adapter
  at runtime.
- Namespaces other than `cli` and `mcp` are reserved. The current compiler reports
  `tool_unsupported_kind` for reserved but unsupported namespaces such as
  `http:example`.
- A malformed declaration, such as `gh`, `cli:`, or `mcp:`, reports
  `tool_invalid`.
- A supported `cli:<name>` declaration that cannot be found on PATH reports
  `tool_unresolved`.
- A supported `mcp:<name>` declaration that cannot be found in the host MCP
  registry reports `tool_unresolved`.
- `prose compile` fails closed when any `tool_invalid`, `tool_unsupported_kind`,
  or `tool_unresolved` diagnostic is emitted.

The compiler program implements this resolution rule; see
`skills/open-prose/compiler/index.prose.md` (`tools_resolver`) for the
program-level contract.

### BYO host tools invariant

OpenProse never installs, modifies, upgrades, or removes host tools. Installing
and authenticating host tools is the user's responsibility; the compiler only
verifies declared tools are present and stops the compile when they are not.

## Frontmatter

Every responsibility, function, gateway, pattern, or test declares identity with
`name` and `kind`:

```yaml
---
name: entry-name
kind: responsibility | function | gateway | pattern | test
---
```

Frontmatter should stay structural. If a field would be useful to read, review,
or discuss, it should usually be a `###` section.

A `kind: test` file also declares `subject:` to name the responsibility or
function it runs.

A `kind: responsibility` file also declares required `id:` frontmatter to name the
stable Markdown identity for the responsibility. The id is generated once by
tooling as a UUIDv7-compatible 16-byte value, rendered as uppercase Crockford
base32, and preserved across filename and `name:` renames. The slug is display;
`id:` is identity.

## Contract Item Style

Use backticked names followed by a colon:

```markdown
- `topic`: a research question
- `report`: executive-ready summary with sources
```

This is visually clear and easy for agents to extract.

`each` postconditions are contract items:

```markdown
- `articles`: collected articles from the feed
- each article has: a summary, relevance score, and key claims
```

## Typed Caller Inputs

Most `### Parameters` and `### Requires` entries are free-form values provided at
run time. Two keywords are reserved for passing *completed runs* as inputs — the
typical shape for inspectors, regression checkers, and meta-systems:

```markdown
### Parameters

- `subject`: run — a completed run to inspect
- `cohort`: run[] — a set of completed runs to compare
```

When an entry's type is `run` or `run[]`, the caller supplies a run ID (or a list
of them). The Prose VM resolves each ID to its run directory and writes a
structured binding at `bindings/caller/{name}.md` containing the run ID, path,
root source name, and status. The render reads that binding and then reaches into
the run's own `bindings/`, `vm.log.md`, and compiled artifacts directly.

See `prose.md` (Run-Typed Inputs) for binding format, resolution order (bare ID,
`~/{id}` for user scope, absolute path), and staleness validation.

## Execution Sections

`### Execution` contains the render body in ProseScript. Use a fenced block:

````markdown
### Execution

```prose
let research = call researcher
  topic: topic

return research
```
````

`### Execution` is the intra-node render body: `call` (invoke a function),
`session` / `agent` / `resume` (spawn ephemeral sub-agents), plus control flow.
All of it is internal to producing this node's world-model, and **none of it is a
node** (`plan.md` §7). Cross-node connection is only ever a subscription. When
`### Execution` is present, Forme validates contracts and extracts the call graph,
but the Prose VM follows the written order.

## Tests

Test files use the same section grammar. A `kind: test` names a subject
responsibility or function, supplies fixtures as caller inputs, then evaluates
semantic assertions against the subject's world-model or returned value:

```markdown
---
name: test-summarizer
kind: test
subject: summarizer
---

### Fixtures

- `text`: recent developments in quantum error correction

### Expects

- `summary`: contains at least five bullet points
- `summary`: is under 500 words

### Expects Not

- `summary`: contains fabricated citations
```

Rules:

- `subject:` must name a responsibility or function. Tests do not execute patterns
  directly.
- Path-like subjects use normal resolution. Bare subjects may resolve by matching
  frontmatter `name:` in the test file's directory and nearest OpenProse
  source/package root.
- `### Fixtures` must provide every caller input needed by the subject; tests do
  not prompt the user.
- `### Expects` and `### Expects Not` assert observable behavior, not exact
  phrasing.
- Test reports should list each assertion with pass/fail status and concise
  evidence for failures.

## Design Guidance

Use Contract Markdown when the author cares about the promise more than the
choreography — declare a `### Requires` need and let Forme choose the graph when
the end-state matters. Use ProseScript `### Execution` when the author needs exact
order, control flow, or human-readable procedural steps inside a render.

For canonical responsibility, function, gateway, pattern, test, world-model, and
security guidance, load `guidance/authoring.md`.
