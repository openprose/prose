---
role: execution-semantics
summary: |
  How to execute OpenProse contracts. You embody the OpenProse VM—a virtual machine that
  reads a compiled Forme manifest, spawns sessions through the host's
  `spawn_session` primitive, manages state via the selected backend, and
  coordinates execution across responsibilities and functions. Read this file to run responsibility and function files.
see-also:
  - contract-markdown.md: Contract file format (kinds and sections)
  - forme.md: Wiring semantics (Phase 1 — produces the compiled manifest you consume)
  - prosescript.md: Imperative syntax for pinned execution blocks
  - state/README.md: State backend router and shared run-envelope rules
  - state/filesystem.md: File-system state management
  - primitives/session.md: Session context and compaction guidelines
  - guidance/tenets.md: Design reasoning behind the specs
---

# OpenProse VM

This document defines how to execute OpenProse contracts. You are
the OpenProse VM—an intelligent virtual machine that reads a contract file or
compiled Forme manifest, spawns a bounded render session for each node, passes
data between them through the selected state backend, and returns the run's
output.

## Agent Commands

OpenProse is invoked via `prose` commands inside an agent session. The command
string is a routing instruction for a Prose Complete host, not necessarily a
shell executable. If a host also ships a native CLI, the same strings can be
passed to it. Otherwise wrap the command in the host runner, for example:

```bash
claude -p "prose run research.prose.md"
codex exec "prose run research.prose.md"
```

| Command                     | Action                                                          |
| --------------------------- | --------------------------------------------------------------- |
| `prose compile [path]` | Compile Responsibility Runtime source into validated repository IR |
| `prose serve` | Serve active repository IR as local cron and HTTP trigger adapters |
| `prose run <file.prose.md>`      | Execute a local responsibility or function                               |
| `prose run <host>/<owner>/<repo>` | Explicit git host (e.g. `github.com/alice/research`); resolve from `<openprose-root>/deps/` |
| `prose run std/...` / `co/...`     | Expand OpenProse package shorthand and resolve from `<openprose-root>/deps/github.com/openprose/prose/` |
| `prose run <owner>/<repo>`       | Reserved for the OpenProse registry (future home at `p.prose.md`)         |
| `prose run ...@<version>`        | Pin to a SHA or tag; require that version in `<openprose-root>/deps/`                     |
| `prose run ... --offline`        | Require disk-only resolution; error if not in `<openprose-root>/deps/`                   |
| `prose write [request...]`        | Interactive-by-default authoring through `std/ops/prose-author`, asking targeted shape/root questions when supported and returning a validated source package |
| `prose lint <file.prose.md>`      | Validate structure, schema, shapes, and contracts               |
| `prose preflight <file.prose.md>` | Check dependencies, declared tools, and environment variables   |
| `prose test <path>`         | Run test(s) and report results                                  |
| `prose install`             | Install dependencies from `use` statements into `<openprose-root>/deps/`        |
| `prose install --update`    | Update pinned dependency SHAs                                   |
| `prose inspect <run-id>`    | Evaluate a completed run                                        |
| `prose status`              | Show active IR, diagnostics, the topology world-model (nodes/edges/wake-sources), recent runs, and per-node receipt/fingerprint state |
| `prose upgrade --dry-run`   | Inspect OpenProse source/layouts and report the migration plan   |
| `prose upgrade`             | Migrate OpenProse source/layouts to current conventions          |
| `prose help`                | Show help and examples                                          |
| `prose examples`            | List or run bundled examples                                    |

### OpenProse Root

All filesystem paths are relative to `<openprose-root>`. Native repositories
use the repository root as `<openprose-root>`. Attached repositories use
`repo/.agents/prose`. User-global work uses `~/.agents/prose`.

The root contains `src/` for authored intent, `dist/` for compiled intent,
`runs/` for activation receipts, `state/` for durable cross-run state, `deps/`
for installed dependencies, plus `prose.lock` and `.env`.

### Remote Systems

`prose run` and `use` statements share one resolution algorithm: read the
locally installed copy in `<openprose-root>/deps/`. Fetching and pinning belong to
`prose install`; execution does not auto-install missing dependencies.

The canonical identifier is `host/owner/repo`. Any git host works —
write the host explicitly. GitHub is the 90% case but nothing in the
resolver privileges it.

```bash
# Canonical: explicit git host
prose install                                    # populate <openprose-root>/deps/ from declared deps
prose run github.com/alice/research              # installed copy wins; errors if missing
prose run github.com/alice/research@0.3.1        # pin to installed tag
prose run github.com/alice/research@abc1234      # pin to SHA
prose run gitlab.com/alice/research              # any git host
prose run git.company.com/team/repo              # self-hosted
prose run std/evals/inspector                    # OpenProse package shorthand
prose run std/evals/prose-contributor            # turn run evidence into an approved PR

# Flags
prose run github.com/alice/research --offline    # assert disk-only resolution
```

**Resolution rules:**

- First path segment contains a dot (looks like a hostname) → explicit git host; resolve under `<openprose-root>/deps/{host}/{owner}/{repo}/`; error if missing
- Starts with `std/` or `co/` → expand to `github.com/openprose/prose/packages/{std|co}/...`; resolve under `<openprose-root>/deps/github.com/openprose/prose/`; error if missing
- Ends with `@{version}` → resolve that version (SHA or tag) from `<openprose-root>/deps/`; error if missing
- Otherwise contains `/` → reserved for the OpenProse registry (future home at `p.prose.md`); nothing publishes there today, so this path is spec'd but inert
- Otherwise → treat as local path; directories conventionally resolve to
  `index.prose.md`, and extensionless source paths try `.prose.md`

`--offline` is a declaration of intent for dependency runs: every dependency
must already be available in `<openprose-root>/deps/`. Runtime dependency resolution is always
disk-only.

**When resolution fails:**

When an identifier is not in `<openprose-root>/deps/`, report:

```
[Error] Dependency not found: github.com/alice/research
  Run `prose install` to install dependencies.
```

The error must name the identifier and the expected `<openprose-root>/deps/` location so the
user can distinguish a typo from a missing install.

**On the bare `owner/repo` form.** Bare identifiers (no host prefix) are
reserved for the OpenProse registry. That registry isn't accepting
publications yet, so the bare form doesn't resolve today — use
`github.com/owner/repo` (or the appropriate host) explicitly. When the
registry opens, the bare form gains a defined resolution without breaking
anyone who wrote explicit hosts.

---

## Two Phases of a Run

A Prose run has two phases:

| Phase                  | Who                      | Input                 | Output         |
| ---------------------- | ------------------------ | --------------------- | -------------- |
| **Phase 1: Wiring**    | Forme (`forme.md`)       | Responsibility `*.prose.md` files | Compiled topology world-model |
| **Phase 2: Execution** | Prose VM (this document) | Compiled topology world-model | Reconciled world-models + receipts |

You are Phase 2. The compiled topology tells you which responsibilities are
mounted and how their subscriptions are wired. The reconciler renders them.

For a lone `kind: function` file there is no Forme phase: the function is a
called, ephemeral helper. The run still records a minimal activation record for
uniform inspection and resumption. The `*.prose.md` file is the function to run:
snapshot it as `root.prose.md` and `sources/{name}.prose.md`, bind
`### Parameters`, spawn one render, and return its `### Returns` value. There is
no `### Services` graph kind to declare — cross-node composition is a Forme-wired
subscription between responsibilities.

### Kinds

Every source file declares a `kind` in its frontmatter:

| Kind        | Purpose                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| `function`   | A called, ephemeral helper — `### Parameters` → `### Returns`, stateless, no world-model. The replacement for the retired `service` |
| `responsibility` | A mounted DAG node: `### Requires`/`### Maintains` interface + a render, woken by its `### Continuity` wake-source. Maintains a canonical world-model; downstreams subscribe to it |
| `gateway` | Sugar for an external-driven responsibility: ingress (webhook/cron/manual) that maintains the latest incoming truth. Compiled into trigger registrations |
| `pattern` | Reusable agent design pattern with slots, config, invariants, and delegation rules |
| `test`      | A test harness — provides fixtures, runs a subject, evaluates assertions |

`prose run` accepts a lone `kind: function` (run directly) and `kind: responsibility`
files (mounted and reconciled). `prose test` executes `kind: test` files. `kind: gateway`
files are not directly runnable: gateways compile into trigger registrations for
`prose serve`. `kind: pattern` files are not runnable; they are instantiated at
compile time and expanded into nodes. There is no `service`/`system`: a function is
`call`ed inside a render, and responsibilities are wired to each other by Forme
matching `### Requires` → `### Maintains` — never an internally-autowired graph kind.

**Retired kinds never execute.** If an invoked file declares a retired kind
(`service`, `system`) or an unknown kind — or carries retired sections taught
as live (`### Ensures`, `### Services`, `### Wiring`) — do not run it under
any semantics, old or new. Halt and route the user to `prose upgrade`
(`changelog.md` holds the migration map), which rewrites legacy source to
current conventions; then run the migrated source. Legacy compatibility is
migration at the source, never interpretation at runtime.

---

## Why This Is a VM

Large language models are simulators. When given a detailed description of a machine, they don't just _describe_ that machine—they _simulate_ it. This document leverages that property: it describes a virtual machine with enough specificity that reading it causes a Prose Complete host to simulate that VM.

But simulation with sufficient fidelity _is_ implementation. When the simulated VM spawns real subagents, produces real artifacts, and maintains real state, the distinction between "simulating a VM" and "being a VM" collapses.

### VM Mapping

| Traditional VM      | OpenProse VM                        | Substrate                                |
| ------------------- | ----------------------------------- | ---------------------------------------- |
| Instructions        | Manifest graph entries              | Executed via host `spawn_session` calls  |
| Instruction pointer | Current position in execution order | Tracked in the active backend event store; filesystem uses `vm.log.md` |
| Working memory      | Conversation history                | The context window holds ephemeral state |
| Persistent storage  | Selected state backend rooted at `<openprose-root>` | Files or database rows hold durable state across sessions |
| Registers/variables | Named bindings                      | Stored by the active backend; filesystem uses `world-model/caller/{name}.md` and published world-model artifacts |
| I/O                 | Tool calls and results              | Host primitives spawn sessions, ask users, and return pointers |

### What Makes It Real

The OpenProse VM isn't a metaphor. Each node in the topology triggers a
_real_ host session through `spawn_session`. The outputs are _real_ artifacts on
disk. The simulation produces actual computation—it just happens through a
different substrate than silicon executing bytecode.

---

## Embodying the VM

When you execute a compiled topology, you ARE the virtual machine. This is not a metaphor—it's a mode of operation:

| You                        | The VM                          |
| -------------------------- | ------------------------------- |
| Your conversation history  | The VM's working memory         |
| Your host primitive calls  | The VM's instruction execution  |
| Your state tracking        | The VM's execution trace        |
| Your judgment on contracts | The VM's intelligent evaluation |

**What this means in practice:**

- You don't _simulate_ execution—you _perform_ it
- Each woken node renders in a real subagent spawned through the host's
  `spawn_session` primitive
- Your state persists through the selected backend rooted at `<openprose-root>/runs/`
- You follow the manifest strictly, but apply intelligence where needed

---

## Host Primitive Adapter

This spec names abstract VM primitives. The current harness maps them onto its
own tools:

| Primitive | Required Behavior |
|-----------|-------------------|
| `spawn_session` | Start an isolated agent/session with a prompt, optional model, and access to declared input/output paths |
| `ask_user` | Pause execution for missing required caller input and resume with the answer |
| `read_file` / `write_file` | Read and write `<openprose-root>/runs/{id}/` state artifacts and backend records |
| `commit_world_model` | Publish a node's maintained truth: write the **canonical world-model artifact** through the active backend (filesystem: from the render's private `workspace/{node}/` scratch to the canonical `world-model/{node}/` artifact), then sign a receipt carrying its `fingerprints`. The published artifact is deterministically serialized and fingerprinted; the workspace scratch never is. This replaces the old dumb copy: publishing is *write world-model + sign receipt*, not a file copy. |
| `check_env` | Confirm an environment variable exists without exposing its value |
| `check_tool` | Confirm a declared host tool exists without installing, modifying, or running it |

---

## Directory Structure

Load `state/README.md` and the selected backend spec before execution. Durable
backends always create `<openprose-root>/runs/{id}/` with `root.prose.md`, source
snapshots, and either a compiled Forme manifest or a function activation
record. The default filesystem backend stores all execution state in that
directory:

```
<openprose-root>/runs/{id}/
├── compiled-intent.json           # Snapshot of compiled intent (topology world-model + canonicalizers + validators)
├── root.prose.md                  # Copy of the invoked contract file
├── sources/                       # Contract and pattern source files copied by Phase 1
│   ├── researcher.prose.md
│   ├── critic.prose.md
│   └── synthesizer.prose.md
├── workspace/                     # Private render scratch — never fingerprinted, never subscribed to
│   ├── researcher/
│   │   ├── notes.md               # Intermediate work
│   │   └── raw-results.md         # Intermediate data
│   ├── critic/
│   │   └── ...
│   └── synthesizer/
│       └── ...
├── world-model/                   # Published canonical truth (one per node, plus caller/)
│   ├── caller/
│   │   └── question.md            # Caller-provided input (gateway-style)
│   ├── researcher/
│   │   ├── findings.md            # Declared `### Maintains` truth — deterministically serialized, fingerprinted
│   │   ├── sources.md
│   │   └── .version               # ContentAddress of this committed version
│   ├── critic/
│   │   └── ...
│   └── synthesizer/
│       └── report.md
├── receipts/                      # Append-only receipt ledger (one chain per node)
│   ├── researcher.jsonl
│   ├── critic.jsonl
│   └── synthesizer.jsonl
├── vm.log.md                      # Append-only execution log
└── agents/                        # Run-scoped agent memory
    └── {name}/
        ├── memory.md
        └── {name}-NNN.md
```

Unless a section explicitly says otherwise, the concrete paths below describe
the default filesystem backend. SQLite and PostgreSQL perform the same VM
operations through their event and binding tables; see `state/README.md` and
the selected backend spec for the storage mapping.

### Run ID Format

Format: `{YYYYMMDD}-{HHMMSS}-{random6}`

Example: `20260317-143052-a7b3c9`

### Runtime Activation Envelope

`prose serve` launches ordinary `prose run` activations with a reserved
argument:

```bash
prose run <source.prose.md> --activation-context '<json>'
```

Treat `--activation-context` as VM control data, not caller input. The JSON
envelope has `kind: "openprose.activation"` and points at the compiled intent
(the topology world-model + per-node canonicalizers + postcondition validators),
the woken `node`, and the `wake` that scheduled this render — its `source`
(`input` | `self` | `external`) and the `refs` to the waking receipt(s) or tick.
The host may also provide the same payload through `PROSE_ACTIVATION_CONTEXT`,
with `PROSE_OPENPROSE_ROOT`, `PROSE_REPOSITORY_IR_PATH`,
`PROSE_REPOSITORY_IR_VERSION`, and `PROSE_ACTIVATION_ID` for quick lookup. A
render may also receive `PROSE_NODE` (the node identity), `PROSE_CONTRACT_FINGERPRINT`,
and `PROSE_PREV_RECEIPT` (the prior receipt, by reference). Load the referenced
compiled intent from the active OpenProse root before execution, then continue as
a normal bounded render.

There is no judge beat, no responsibility status enum, no pressure record. A node
runs because the **reconciler** compared fingerprints and found that either the
node's own `contract_fingerprint` or one of its subscribed `input_fingerprints`
moved (`world-model.md` §3). The wake decision is deterministic and total — never
an LLM judgment — and every wake, from any of the three sources, arrives as a
receipt the render reads by reference.

---

## The Execution Algorithm

### Step 1: Read the Compiled Manifest

Read the compiled Forme manifest from activation context, compiled intent, or the
filesystem snapshot at `<openprose-root>/runs/{id}/compiled-intent.json`. Extract:

- **Caller Interface** — what inputs the run needs, what it returns
- **Graph** — each node with its source file, workspace path, subscriptions (with `←` mappings), and maintained outputs
- **Execution Order** — the topology order (with parallelization notes)
- **Tools** — host executable requirements attributed to graph nodes
- **Warnings** — present to the user before executing

### Step 2: Bind Caller Inputs

The manifest's Caller Interface lists what the run requires. Bind these values:

| Source                                                           | Behavior                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| CLI arguments (`prose run research.prose.md --question "..."`)  | Bind immediately                                      |
| Config file (`<openprose-root>/.env` or project-level config)             | Bind immediately                                      |
| Pre-supplied by a calling render (if this is a nested invocation) | Bind immediately                                    |
| No value available                                               | Pause execution, prompt user via `ask_user` |

Write each bound input to `world-model/caller/{name}.md`:

```markdown
# question

binding: input
source: caller

---

What are the latest developments in quantum computing?
```

### Step 3: Create Working Directories

For each node in the manifest, create:

- `workspace/{node-name}/`
- `world-model/{node-name}/`

### Step 4: Render Nodes

Walk the execution order from the manifest. For each node:

#### 4a. Check Dependencies

All upstreams listed in the node's subscriptions (the `←` mappings) must have their published outputs available. If not, wait—an earlier node hasn't rendered yet.

#### 4b. Spawn Session

Spawn a subagent via the host's `spawn_session` primitive with:

1. **The node's source file** — read `sources/{node-name}.prose.md` and include its full content as the contract
2. **Input file paths** — list each input with its binding path
3. **Workspace path** — where the render should write ALL its work
4. **Output instructions** — which files in the workspace are declared `### Maintains` (or, for a called function, `### Returns`) outputs

The session prompt follows this structure:

```
You are rendering an OpenProse node.

## Your Contract

{contents of sources/{node-name}.prose.md}

## Your Inputs

Read these files for your input data:
- {input-name}: {input-path}
- {input-name}: {input-path}

## Your Workspace

Write all your work to: <openprose-root>/runs/{id}/workspace/{node-name}/

This is your private working directory. Write intermediate notes, drafts, scratch
work — whatever you need. All files here are preserved for inspection after the run.

## Required Outputs

When you are done, write these files to your workspace:

- {output-name}: workspace/{node-name}/{output-name}.md
- {output-name}: workspace/{node-name}/{output-name}.md

These correspond to your `### Maintains` (or `### Returns`) contract. Each file
should contain your final output for that clause. Check them against your
postconditions before you finish — you police your own contract; no one
re-judges your output after you sign off.

## Constraints

{if shape.prohibited exists: "You must NOT: {prohibited list}"}
{if shape.self exists: "You are responsible for: {self list}"}
{if shape.delegates exists: "You delegate to: {delegates list}"}

## Declared Host Tools

{if tools exist for this node: "The manifest declares these host tools for this node: {tool list}"}
{if no tools exist for this node: "No host tools are declared for this node."}

## Error Signaling

If you cannot satisfy your `### Maintains` postconditions (or `### Returns`
value), signal an error by writing:

  workspace/{node-name}/__error.md

With the format:
  # Error: {error-name}
  {description and any partial data}

The error name must match one of your declared errors:
{list of declared errors from manifest}

## When Complete

Return a confirmation message (not your full output):

  Render complete: {node-name}
  Outputs written:
    - {output-name}: workspace/{node-name}/{output-name}.md
    - {output-name}: workspace/{node-name}/{output-name}.md
  Summary: {1-2 sentence summary}

OR if errored:

  Render error: {node-name}
  Error: {error-name}
  Details: workspace/{node-name}/__error.md
```

#### 4c. Receive Confirmation

The subagent returns either a completion message or a delegation request. If the response contains `Delegate:` lines, handle as a runtime delegation (see Runtime Delegation) — spawn the delegate, wait, resume the render with the response path, and loop back to 4c.

Otherwise, the subagent has completed. The VM:

1. Checks if the render wrote `__error.md` — if so, handle error (see Error Handling)
2. Publishes the node's declared truth via `commit_world_model`: the canonical
   world-model artifact is written from the render's workspace scratch, the
   compiled canonicalizer fingerprints it, and the receipt is signed and
   appended to `receipts/{node-name}.jsonl`. (Functions never reach this step
   as nodes — they are `call`ed inside renders and return their value to the
   caller; see Copy-on-Return for the standalone-function case.)
3. Appends a completion marker to the active backend event store
4. Continues to the next node in execution order

**Critical:** The VM never reads the full output files. It tracks pointers and publishes artifacts. This keeps the VM's context lean.

#### 4d. Parallel Execution

If the manifest notes that nodes can render concurrently (no subscription edges between them), spawn multiple Task calls in a single response:

```
// Nodes with no mutual dependencies — spawn simultaneously
spawn_session({ prompt: "Node: researcher ..." })
spawn_session({ prompt: "Node: critic ..." })
// Wait for all to complete, then continue
```

#### 4e. Apply Manifest Constraints When Present

Current v0 compiled intent does not define a separate pattern-constraint schema.
When a later manifest version or explicit host contract includes runtime
constraints derived from pattern invariants, enforce them during execution:

| Constraint Type          | Enforcement                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Information firewall** | When passing data between nodes that have a firewall constraint, strip internal reasoning and intermediate state before publishing. The downstream node receives only the declared published outputs — no reasoning chains, no scratch work, no internal state. |
| **Termination bound**    | Count iterations in loop-based delegation patterns. If the iteration count reaches the ceiling (e.g., `max_rounds`), terminate the loop regardless of the critic's verdict and return the last output. Log: `N→ {node} ⊘ terminated (max_rounds)`                                  |
| **Monotonicity**         | For ratchet-type patterns, maintain a certified-progress ledger. Each iteration's certified output must be a superset of the previous iteration's. If an iteration would shrink the certified set, discard it and keep the prior state.                                             |
| **Error propagation**    | If a slot node writes `__error.md` during a pattern loop, terminate the pattern instance immediately. Propagate the error as if the pattern instance itself errored. Do not retry or continue the loop.                                                                       |

Constraints are checked at every node boundary within the expanded pattern —
not just at the final output. If a constraint is violated, log the violation to
the active backend event store and continue with the corrected state (e.g., the
stripped output, the terminated loop, the preserved ledger).

### Step 5: Collect Run Output

After all nodes render, the run's declared outputs are published. The manifest's Caller Interface specifies which node produces the final output:

```
returns:
- report (from synthesizer): a critically evaluated research report
```

Read `world-model/synthesizer/report.md` (the terminal node's published truth) and return it to the caller.

### Step 6: Finalize

- Append `---end {ISO8601 timestamp}` to the active backend event store
  (filesystem: `vm.log.md`)
- If this is a top-level run (not nested), present the final output to the user

---

## State Management

### Event Store

The VM appends one record per event to the active backend event store. The
filesystem backend writes those records to `vm.log.md`; SQLite and PostgreSQL
write equivalent records to their database tables. Only the VM writes execution
events.

Filesystem `vm.log.md` format:

```markdown
# run:20260317-143052-a7b3c9 deep-research

upstream: [20260317-120000-f4e5d6] # present when run-typed inputs exist
root: deep-research

1→ [input] question ✓
2→ researcher ✓ rendered
3→ critic ✓ rendered
4→ synthesizer ✓ rendered
---end 2026-03-17T14:35:22Z
```

The header is the block between the `#` heading and the first event marker:

```
# run:{id} {root-name}
upstream: [{comma-separated run IDs}]    # optional, present when run has run-typed inputs
root: {root contract path}                # always present

{event markers follow}
```

The `upstream:` field lists the run IDs of all `run`-typed inputs, written once at binding time (Step 2). On resumption, the VM reads it as context but does not re-process it. The `upstream:` field is omitted when a run has no `run`-typed inputs. The `root:` field is always present.

#### Event Markers

| Marker                                   | Meaning                                       |
| ---------------------------------------- | --------------------------------------------- |
| `N→ [input] name ✓`                      | Caller input bound                            |
| `N→ node ✓ rendered`                     | Render committed a moved world-model          |
| `N→ node ∅ skipped`                      | Reconciler skipped: no fingerprint moved      |
| `N→ ∥start a,b,c`                        | Parallel renders started                      |
| `Na→ a ✓`                                | Parallel render completed                     |
| `N→ ∥done`                               | All parallel renders complete                 |
| `N→ node ✗ error-name`                   | Render signaled an error                      |
| `N→ node ⇒ delegate (delegate: {id})`    | Render yielded to a runtime delegate          |
| `N→   delegate ✓`                        | Runtime delegate completed                    |
| `N→ node ⟳ (resumed)`                    | Render resumed after delegation               |
| `N→ [eval] assertion ✓`                  | Test assertion passed                         |
| `N→ [eval] assertion ✗`                  | Test assertion failed                         |
| `---test PASS`                           | Test passed (all assertions satisfied)        |
| `---test FAIL (N/M assertions)`          | Test failed                                   |
| `---end TIMESTAMP`                       | Run completed successfully                    |
| `---error TIMESTAMP msg`                 | Run failed                                    |

#### Resumption

To resume an interrupted filesystem run:

1. Read the `receipts/` ledger — the append-only chain is the source of truth; find the last committed receipt per node
2. Read the compiled intent — get the topology and propagation edges
3. Scan `world-model/` — confirm published canonical artifacts (and their `.version`)
4. Continue from the next unrendered node in execution order (`vm.log.md` gives the human-readable trace)

For SQLite and PostgreSQL, use the selected backend's event and receipt tables
instead.

---

## Error Handling

When a render signals an error (writes `__error.md` to its workspace):

### Step 1: Read the Error

Read `workspace/{node-name}/__error.md` to get the error name and details.

### Step 2: Check Caller's Contract

Look at the root contract's `### Maintains` (or a function's `### Returns`) for conditional clauses:

```markdown
### Maintains

- `report`: a critically evaluated research report
- if research is unavailable: partial report with explanation
```

If a conditional clause covers this error, the VM can satisfy the degraded clause instead.

### Step 3: Check Downstream Impact

If the errored node has downstream subscribers (nodes that require its outputs), those nodes cannot render. Options:

1. **A conditional postcondition covers it** — produce the degraded output, skip dependents, return
2. **No coverage** — propagate the error. Append `---error` to the active backend event store. Return the error to the caller.

### Step 4: Log

Append the error marker to the active backend event store:

```
3→ researcher ✗ no-results
```

---

## Handling Execution Blocks

A pinned `### Execution` block is **intra-node choreography**: the render body
of the one node that declares it. It runs *inside* the single render session
the VM spawned for that node (Step 4b) — it is not a second way for the VM to
walk the graph, and it never replaces the topology's execution order.
Cross-node composition is always a Forme-wired subscription; `### Execution`
composes work *within* a node.

Inside the render:

- Follow the `let` + `call` sequence exactly as written
- Do NOT reorder or parallelize beyond what the block declares
- Each `call` invokes the named function — an ephemeral, stateless helper
  internal to producing this node's world-model
- `let` bindings name the results for use in subsequent calls
- `return` is the value the render publishes; it must satisfy the enclosing
  contract's `### Maintains` (or `### Returns`), which the render self-polices
  before signing as usual

The execution block uses ProseScript. Its canonical grammar includes `parallel:`,
`loop until`, `for each`, `try/catch`, `if/elif/else`, `choice`, `block`, `do`,
`repeat`, and persistent `agent` definitions. See `prosescript.md` for the full
syntax.

---

## Spawning Sessions

Each node in the manifest renders in a subagent via `spawn_session`:

```
spawn_session({
  description: "OpenProse render: {node-name}",
  prompt: "{the prompt constructed in Step 4b}",
  isolation: "render-session",
  model: "{model from the node's ### Runtime, if specified}"
})
```

Hosts may spell this differently (`Task`, `spawn_agent`, `run_subagent`, or a
dedicated render runner). The required behavior is isolation plus access to the
declared input paths and workspace path.

### Parallel Execution

Start multiple `spawn_session` calls in the same host turn for true concurrency:

```
// Spawn simultaneously
spawn_session({ description: "OpenProse render: researcher", prompt: "..." })
spawn_session({ description: "OpenProse render: fact-checker", prompt: "..." })
// Wait for all to complete
```

### What the Subagent Receives

The subagent receives:

1. Its contract (the full `*.prose.md` content from `sources/`)
2. File paths to its inputs (upstream published world-models and `world-model/caller/`, by reference)
3. Its workspace path
4. Instructions on which output files to write
5. Shape constraints (if any)
6. Error signaling format

The subagent does NOT receive:

- The global manifest
- Other nodes' contracts
- The dependency graph
- The root contract file

Each subagent only knows its own contract.

### What the Subagent Returns

A confirmation message—not the full output:

```
Render complete: researcher
Outputs written:
  - findings: workspace/researcher/findings.md
  - sources: workspace/researcher/sources.md
Summary: Found 5 relevant sources on quantum computing, extracted 12 claims with confidence scores.
```

The VM publishes declared outputs through the active backend, appends to the
event store, and continues.

---

## Runtime Delegation

A running render can trigger another render at runtime via **runtime delegation** — a yield/resume mechanism analogous to `gate()` (which yields to a human), but render-to-render. This is how a persistent responsibility (e.g., a web server) calls an ephemeral function (e.g., a synthesizer) mid-session.

Only nodes whose `### Shape` declares a `delegates` block may delegate. The VM enforces this — a delegation request naming an unlisted target is an error.

### The Yield/Resume Protocol

A render yields by returning a **delegation request** instead of a completion message:

```
Delegate: {delegate-name}
Request: workspace/{node}/__delegate/{delegate}/{id}.md
```

The render writes its request payload to the specified path before yielding. The `{id}` is a caller-chosen identifier (e.g., a timestamp or short hash) scoping this delegation instance.

The VM:

1. Reads the delegation request
2. Spawns the delegate as a new session (same mechanics as Step 4b — the delegate's source, inputs, workspace, and output instructions come from the manifest)
3. Passes the request file as the delegate's input
4. Waits for the delegate to complete normally (writes outputs, returns confirmation)
5. Writes the delegate's output to `workspace/{node}/__delegate/{delegate}/{id}-response.md`
6. Resumes the original render with a pointer to the response:

```
Delegation complete: {delegate-name}/{id}
Response: workspace/{node}/__delegate/{delegate}/{id}-response.md
```

The render reads the response and continues execution.

### Parallel Delegation

A render may request multiple delegates simultaneously by returning multiple `Delegate:` lines in a single yield:

```
Delegate: synthesizer
Request: workspace/server/__delegate/synthesizer/req-001.md
Delegate: validator
Request: workspace/server/__delegate/validator/req-001.md
```

The VM spawns all delegates concurrently, waits for all to complete, and resumes the render once with all response paths.

### State Markers

Runtime delegation appends these markers to the active backend event store
(filesystem: `vm.log.md`):

```
N→ node ⇒ delegate (delegate: {id})
N→   delegate ✓
N→ node ⟳ (resumed)
```

For parallel delegation, each delegate gets its own `⇒` and `✓` lines. The `⟳` (resumed) marker appears once after all delegates complete.

### Filesystem Layout

Delegation state lives in the delegating node's workspace:

```
workspace/{node}/__delegate/{delegate}/
├── {id}.md              # Request payload (written by render before yield)
└── {id}-response.md     # Response payload (written by VM after delegate completes)
```

### Interaction with Persistent Responsibilities

A persistent responsibility that delegates is simply yielding mid-session. Its memory file and segment records are unaffected — the render resumes in the same session with the same conversation state. The delegate runs as an independent ephemeral session and has no access to the delegating render's memory.

### Relationship to gate()

Runtime delegation and `gate()` share the same yield/resume shape:

|                  | gate()                           | Runtime delegation                   |
| ---------------- | -------------------------------- | ------------------------------------ |
| **Yields to**    | A human reviewer                 | Another render                       |
| **Resumes with** | Human response                   | Delegate output file path            |
| **Blocking**     | Indefinite (waits for human)     | Bounded (delegate session completes) |
| **Protocol**     | `await gate(payload)` → response | `Delegate:` line → response path     |

Both are coroutine-style interruptions where the VM mediates between the yielding render and an external actor.

---

## The Copy-on-Return Mechanism

This is the "return" in Prose — the publish path for a **standalone function
run** (see Single-Function Runs), where there is no mounted node and no
world-model. When the function completes:

1. The render writes ALL its work to `workspace/{function-name}/` — intermediate files, notes, drafts, final outputs, everything
2. The VM identifies the declared `### Returns` outputs (from the manifest)
3. The VM copies each declared output: `workspace/{function}/output.md` → `bindings/{function}/output.md`
4. Downstream renders read from `bindings/` paths

**Why this separation:**

- **`workspace/`** is private. The render writes freely. Everything is preserved for post-run inspection and debugging.
- **`bindings/`** is public. Only declared `### Returns` outputs appear here. Downstream renders only see what the contract promises.
- **The copy is the publish step.** A render can write draft findings, revise them, rewrite them—only the final version in workspace gets copied to bindings.

This copy-on-return mechanism governs a single-session `function` run:
a stateless callable that returns a value. A **responsibility node**, which
maintains a standing world-model and is subscribed to by downstreams, publishes
through the richer render-harness seam below — not a dumb copy.

---

## The Render Harness Seam

A **responsibility node** maintains a canonical world-model — its standing,
typed, subscribable truth (`world-model.md` §1). When the reconciler wakes a node
(because its `contract_fingerprint` or an `input_fingerprint` moved), the VM
runs a **render** under this harness contract:

1. **Locate the prior world-model by reference.** The render is *not* handed the
   world-model stuffed into context. The harness tells it *where* the prior truth
   lives (a queryable location — a directory by default, or a derived query index
   for a large truth) and the render reads it *as needed*, the way an agent works
   against a repo. The waking receipt carries the upstream `fingerprints` +
   `semantic_diff` ("3 controls went stale"); the render reaches each upstream
   *published* world-model by reference, never inlined.
2. **Render against the prior truth.** The render writes freely to its private
   `workspace/{node}/` scratch — intermediate reasoning, working notes. **Scratch
   is never fingerprinted and never subscribed to.** It self-polices its
   `### Maintains` postconditions before signing (no separate judge beat).
3. **Commit + sign.** When something semantically material changed, the render
   writes the canonical **published** world-model artifact and emits a receipt via
   `commit_world_model`. The store produces a deterministic canonical
   serialization (stable file ordering, path/encoding normalization), the compiled
   canonicalizer computes the `fingerprints` over it, and the receipt records
   `node`, `contract_fingerprint`, `wake`, `input_fingerprints`, `fingerprints`,
   `semantic_diff`, `prev`, `status`, `cost`, and `sig`.

**Only `rendered` with a moved fingerprint propagates.** If neither the contract
nor any input moved, the reconciler writes a `skipped` receipt (copying the
unchanged `fingerprints` forward, empty `semantic_diff`, zero `cost`) and spawns
no render at all. Immaterial churn (a re-poll that only bumps `fetched_at`) stays
in the workspace and never reaches the published truth, so it never wakes a
downstream.

This harness activates only for mounted responsibility nodes. A standalone
`function` run has no harness imposing it; a standalone responsibility
render applies the compiled canonicalizer locally to fingerprint its own receipt.

---

## Persistent Agents

A responsibility that accumulates truth across wakes is a persistent agent: its persisted state is its world-model. Memory can persist *within a single run* (across the render's own turns) or *across runs* (so the next wake starts where the last one left off). The scope is declared in `### Runtime`. (A genuinely stateful component is a `responsibility`, not a `function`: a function is stateless and carries no world-model.)

```markdown
---
name: captain
kind: responsibility
id: 067NC4KG01RG50R40M30E20918
---

### Runtime

- `persist`: project
```

The example above uses `persist: project`, the common case for a responsibility whose world-model compounds between runs (e.g., a cumulative registry, a high-water mark, a growing classifier). Use `persist: true` when the render only needs session memory that dies with the run.

### Persistence Scoping

| Scope               | Declaration        | Path                              | Lifetime                 |
| ------------------- | ------------------ | --------------------------------- | ------------------------ |
| Execution (default) | `### Runtime` with `persist: true`    | `<openprose-root>/runs/{id}/agents/{name}/` | Dies with run            |
| Project             | `### Runtime` with `persist: project` | `<openprose-root>/state/agents/{name}/`           | Survives runs in project |
| User                | `### Runtime` with `persist: user`    | `~/.agents/prose/state/agents/{name}/`         | Survives across projects |

Pick `persist: project` or `persist: user` whenever the node's contract references prior-run state — cumulative counts, watermarks, deltas, or any field whose value depends on what happened before. `persist: true` alone is *not* enough for that: its memory lives only for the duration of the current run and is discarded when the run ends.

### Invocation

When spawning an agent session, include the selected memory file path in the
prompt. Execution-scoped memory uses the run receipt; durable cross-run memory
uses `state/agents/` under the selected root or user-global root.

```
Your memory is at:
  {memory-path}

Read it first to understand your prior context. When done, update it
with your compacted state following the guidelines in primitives/session.md.

Also write your segment record to:
  {segment-path}
```

The subagent:

1. Reads its memory file
2. Reads its input bindings
3. Processes the task
4. Writes outputs to workspace
5. Updates its memory file
6. Writes a segment file
7. Returns confirmation to the VM

See `primitives/session.md` for memory compaction guidelines.

---

## Caller Input Handling

The manifest's Caller Interface specifies what the run requires from the user.

### Binding Inputs

At run start, the VM resolves each `requires` entry:

| Scenario                                              | Behavior                                            |
| ----------------------------------------------------- | --------------------------------------------------- |
| Value provided via CLI arg (`--question "..."`)       | Bind immediately                                    |
| Value provided via config file                        | Bind immediately                                    |
| Value provided by a calling render (nested invocation) | Bind immediately                                   |
| No value available                                    | Prompt user via `ask_user`, bind response           |

### Writing Input Bindings

Write each input to the active backend binding store. Filesystem runs use
`world-model/caller/{name}.md`:

```markdown
# {name}

binding: input
source: caller

---

{the value}
```

The manifest's input mappings reference these paths: `{input} ← world-model/caller/{name}.md`

### Binding `run`-Typed Inputs

When a `requires` entry uses the keyword `run` or `run[]`, the VM recognizes it as a first-class type and performs additional validation and bookkeeping beyond normal input binding.

#### Single Run (`run`)

The caller provides a run ID or path:

```text
prose run std/evals/inspector -- subject: 20260406-201439-1a3369
```

The VM validates:

1. **Existence.** The referenced run directory exists under `<openprose-root>/runs/`. For resolution rules, see Run ID Resolution below.
2. **Structure.** The directory contains the durable run envelope
   (`root.prose.md`, source snapshots, and the compiled activation/manifest
   record) plus the selected backend's event store. Filesystem runs must
   contain `vm.log.md`.
3. **Completion status.** Read the selected backend's completion marker:
   - completed successfully → bind normally
   - failed → emit a warning but allow binding (failed runs are consumable; an inspector may specifically want to evaluate a failed run)
   - incomplete → error: cannot consume an in-progress run

Filesystem completion is read from `vm.log.md`: `---end` means completed,
`---error` means failed, and neither marker means incomplete.

The VM writes the binding to the active backend binding store. Filesystem runs
use `world-model/caller/{name}.md` with structured metadata:

```markdown
# subject

binding: input
source: caller
type: run

---

run: 20260406-201439-1a3369
path: <openprose-root>/runs/20260406-201439-1a3369
root: customer-discovery
status: complete
```

#### Multiple Runs (`run[]`)

For fan-in, the caller provides comma-separated run IDs:

```text
prose run std/evals/eval-calibrator -- runs: 20260406-201439-1a3369,20260406-202015-c5d6e7,20260406-203300-8f9a0b
```

The VM validates each run independently (same rules as single `run`). It writes a single binding listing all references:

```markdown
# runs

binding: input
source: caller
type: run[]

---

- run: 20260406-201439-1a3369
  path: <openprose-root>/runs/20260406-201439-1a3369
  root: customer-discovery
  status: complete

- run: 20260406-202015-c5d6e7
  path: <openprose-root>/runs/20260406-202015-c5d6e7
  root: competitive-landscape
  status: complete

- run: 20260406-203300-8f9a0b
  path: <openprose-root>/runs/20260406-203300-8f9a0b
  root: grant-radar
  status: complete
```

#### Staleness Detection

When binding a `run` input, the VM compares the run's `root.prose.md` snapshot against the current source file on disk. If they differ semantically (a whitespace change is not staleness; a changed `### Maintains` clause is), the VM emits a warning:

```
[Warning] Stale run: 20260406-201439-1a3369
  Root source 'customer-discovery' has changed since this run.
```

Staleness is informational, not blocking. The caller decides whether to re-run or proceed.

#### Run ID Resolution

Run IDs default to local `<openprose-root>/runs/`. For cross-project references:

| Format                             | Resolves to                                                       |
| ---------------------------------- | ----------------------------------------------------------------- |
| Bare ID (`20260406-201439-1a3369`) | `<openprose-root>/runs/20260406-201439-1a3369` (local project)              |
| `~/{id}`                           | `~/.agents/prose/runs/{id}` (user scope)                                 |
| Absolute path                      | Used as-is                                                        |
| Future: `repo:{repo}#{id}`         | Git-based resolution (team/cloud scenarios — not yet implemented) |

---

## Evaluating Contracts

Intelligence lives inside bounded renders; scheduling and propagation are
deterministic. The division of labor:

### Evaluating Postconditions

The render itself checks its outputs against its `### Maintains` postconditions
(or `### Returns` value) before signing off — self-policing, inside the bounded
session, where the full working context still exists. There is no separate
judge beat: the VM never re-reads a signed render's outputs to second-guess the
commitment, and no model call decides whether a result propagates. Propagation
is the reconciler's job, and it is deterministic — fingerprints moved or they
didn't.

If a render finds its outputs don't satisfy the postconditions:

1. Check whether the contract's `### Strategies` suggest a recovery; apply it within the session
2. If no strategy helps, signal a declared error (`__error.md`) rather than signing unmet work

### Evaluating `each` Postconditions

When a `### Maintains` clause begins with `each`, it expresses a collection postcondition: every item in the named collection must satisfy the stated property. For example:

```markdown
### Maintains

- `articles`: collected articles from the feed
- each article has: a summary, a relevance score (0-1), and key claims extracted
```

The render verifies `each` postconditions the same way it verifies any other postcondition, before signing: the property must hold for every item in the collection — not just some, not just most, but all.

This is a contract-level construct, not an execution directive. The `each` clause says nothing about _how_ the render processes items. The render (or Forme) decides whether to iterate, fan out, or batch. The contract only says: when you are done, every item must have been processed.

### Evaluating Errors

When a render signals an error, verify the error name matches a declared `### Errors` entry. Undeclared errors propagate as unhandled faults.

### Evaluating Invariants

After the run completes (success or failure), check each node's `### Invariants`. These must be true regardless of outcome. If violated, log a warning—but don't fail the run retroactively.

### Evaluating Strategies

Strategies guide judgment calls inside a render. If a render's intermediate state matches a strategy's `when` condition, apply the strategy's guidance.

For intra-render strategies (e.g., "evaluate from multiple perspectives"), these are included in the session prompt and the subagent applies them directly.

### Resolving Environment

`### Environment` declares runtime dependencies provided by the container, not by the caller. The VM resolves these from the host environment (shell env vars, platform secrets, `.env` files). This is distinct from `### Requires`: required values come from callers or upstream nodes, while environment values come from the runtime infrastructure.

The model references environment variables by name — it never reads, logs, or includes their raw values in any output or workspace artifact.

**VM behavior for `### Environment` during execution:**

- When a node declares `### Environment` variables, the VM verifies they are set before spawning the render session. Verification means confirming the variable exists in the host environment — not reading or logging its value.
- The render session can reference env vars via shell expansion (e.g., `$SLACK_WEBHOOK_URL` in a curl command) but must never construct strings containing the values, log them, or write them to workspace files.
- If an environment variable is not set, the VM fails the render with a clear error rather than proceeding with an empty value. The error is logged to the active backend event store (filesystem: `vm.log.md`) as `N→ node ✗ missing-env:{VAR_NAME}`.

### Resolving Tools

`### Tools` declares host capabilities required by a responsibility, function,
or gateway. The compiler resolves these declarations before writing
repository IR, and the compiled Forme manifest carries resolved node
tools as:

```json
{ "kind": "cli", "name": "jq", "requiredBy": ["verifier"] }
```

Responsibility-level tools are carried separately on
`responsibilities[].tools` as `{ "kind": "cli" | "mcp", "name": "capability" }`
records and are included in activation payloads for the render's fulfillment.

Tool declarations are host capability checks. They do not satisfy
`### Requires`, do not create Forme dependency-graph edges, and do not act as
an allowlist. Use `### Shape` to describe render boundaries and prohibited
actions.

**VM behavior for manifest `tools` during execution:**

- Before spawning a render, find manifest tool records whose `requiredBy`
  includes that node's graph id.
- For `kind: "cli"`, verify the executable name is present on host PATH. The
  VM checks presence only; it does not run the executable for version or auth
  checks.
- For `kind: "mcp"`, verify the server name is present in the host MCP
  registry. The VM checks presence only; it does not install, contact, or
  introspect the server during preflight.
- Include declared tool names in the render prompt so the render knows which
  host tools its contract relies on.
- If a required CLI or MCP tool is missing, fail the render before spawning its
  session. Log the failure to the active backend event store as
  `N→ node ✗ missing-tool:{kind}:{name}`.

OpenProse never installs, modifies, upgrades, or removes host tools. Installing
and authenticating tools belongs to the host/user outside the VM.

---

## Executing Tests

When the VM executes a test manifest (produced by Forme for `kind: test` — see `forme.md`, Handling Tests):

1. **Bind fixtures** — same as binding caller inputs, but from `### Fixtures` in the manifest. Never prompt the user — tests are fully self-contained.
2. **Execute the subject** — run the subject responsibility or function exactly as normal (spawn renders, publish outputs, etc.). The subject does not know it is under test.
3. **Evaluate assertions** — after execution completes, evaluate each `### Expects` and `### Expects Not` clause against the subject's published outputs (`world-model/` for a responsibility subject, `bindings/` for a function subject). Use intelligent judgment, not string matching. Test observable behavior and contract satisfaction, not exact phrasing.
4. **Produce test report** — instead of returning subject output to the caller, produce a structured report with every assertion, pass/fail status, and concise observed evidence for failures:

```
# Test Report: {test-name}

Subject: {subject}
Result: PASS | FAIL

## Assertions

✓ summary: mentions authentication or auth handling
✗ summary: does not fabricate function names
  Observed: summary mentions "validate_token" which does not appear in the source

## Negative Assertions

✓ __error.md does not exist
```

5. **Log markers** — test runs use the active backend event store for standard execution markers, plus `N→ [eval] assertion ✓` or `✗` for each assertion, and `---test PASS` or `---test FAIL (N/M assertions)` at the end. Filesystem runs write these markers to `vm.log.md`. Failed assertion markers should identify the target output and the observed mismatch.
6. **Exit behavior** — `prose test` returns exit code 0 if all assertions pass, 1 if any fail. When running a directory of tests, all tests run (no early exit), and a summary is printed at the end.

### Test Suites

When `prose test tests/` is given a directory:

1. Find all `*.prose.md` files with `kind: test` in the directory (non-recursive by default, `--recursive` for deep scan)
2. Run each test independently (separate run IDs, separate state)
3. Print per-test results as they complete
4. Print a summary:

```
Results: 4 passed, 1 failed, 0 errors

test-synthesizer-file ............ PASS (4/4)
test-engine-staleness ............ FAIL (2/3)
  ✗ "detects all 3 stale files" — found 2 of 3
test-browse-contract ............. PASS (contract)
```

---

## Single-Function Runs

For a lone `kind: function` file (no Forme phase):

1. The `*.prose.md` file is the function to run
2. Record a minimal activation record so the run directory has the
   same control-plane shape as a mounted run
3. Bind caller inputs from `### Parameters`
4. Spawn one render with the file as the function definition
5. The render writes to `workspace/` and the VM copies `### Returns` outputs to `bindings/`
6. Return the value

This is the simplest execution path.

---

## Patterns

A pattern is a reusable agent design pattern: slots, config, invariants, and delegation rules for how filled slots interact. By the time you execute, patterns are gone — Forme has expanded them into concrete delegation steps and constraints in the manifest. For pattern authoring syntax and expansion mechanics, see `forme.md`, Pattern Expansion.

### Pattern Contract Sections

A pattern file declares its pattern with Contract Markdown sections. Understanding these sections clarifies where the manifest constraints you enforce come from:

| Section | Purpose |
|---------|---------|
| `### Slots` | Renders the pattern requires; each slot has a name and a contract |
| `### Config` | Pattern-level parameters and defaults |
| `### Invariants` | Guarantees that Forme encodes and the VM enforces at runtime |
| `### Delegation` | ProseScript or pseudocode for how the slots interact |

### Instantiation

Authors instantiate patterns with explicit slot-filling: `pattern:` names the
pattern, `with:` binds slots, and `config:` sets pattern parameters. Instances
are declared in contract files and expanded by Forme at compile time into
concrete nodes. Nested pattern declarations may appear only as
slot values inside a pattern instance's `with:` block.
For instantiation syntax, see `contract-markdown.md` (Patterns) and `forme.md`,
Pattern Expansion. No shorthand pattern syntax is accepted at runtime.

Patterns nest — a slot can be filled by another pattern instantiation. Expansion proceeds inside-out. Recursive patterns are prohibited. For nesting examples, see `forme.md`, Pattern Expansion.

### Patterns in the Manifest

In v0 compiled intent, pattern-backed graphs should compile to ordinary
wiring when they do not require extra runtime rules. If a pattern needs
constraints that the manifest cannot represent, compile should warn rather than
inventing an implicit runtime contract.

---

## Complete Execution Algorithm

```
function execute(manifest, inputs?):
  1. Read manifest — extract caller interface, graph, execution order
  2. Bind caller inputs:
     - From CLI args, config, or a calling render
     - For run-typed inputs (run / run[]): validate existence, structure, completion; emit staleness warning if the root source changed
     - Prompt user (`ask_user`) for any missing required inputs
     - Write each to the active backend binding store (filesystem: world-model/caller/{name}.md with structured metadata for run types)
     - Record upstream in the backend event header for any run-typed inputs
  3. Initialize backend storage for each node (filesystem: workspace/ and world-model/ directories)
  4. Initialize the backend event store with run header (root always; upstream if run-typed inputs were bound)
  5. For each node in execution order:
     a. Verify all input bindings exist (dependencies satisfied)
     b. Build session prompt:
        - Contract (from sources/{name}.prose.md)
        - Input references from the active backend (filesystem: upstream `world-model/` paths, by reference)
        - Writable output location (filesystem: workspace path)
        - Output instructions (declared Maintains / Returns outputs to write)
        - Shape constraints (prohibited, self, delegates)
        - Error signaling format
     c. Spawn render via `spawn_session`
        - If multiple nodes have no mutual dependencies, spawn in parallel
     d. Receive response:
        - If Delegate: lines → runtime delegation:
          i.  Spawn each delegate as a new session
          ii. Wait for all delegates to complete
          iii. Write delegate outputs to the active backend (filesystem: workspace/{name}/__delegate/)
          iv. Resume the render with response references
          v.  Append ⇒, ✓, ⟳ markers to the backend event store
          vi. Loop back to (d)
        - If completion → continue
     e. Check for __error.md:
        - If error: check conditional postconditions, handle or propagate
     f. Apply declared manifest constraints when present
     g. Publish the node's truth via commit_world_model (canonical artifact + signed receipt appended to receipts/{name}.jsonl)
     h. Append completion marker to the backend event store
  6. Collect final output from the active backend per manifest's returns
  7. Evaluate invariants across all nodes
  8. Append ---end to the backend event store
  9. Return final output to caller
```

---

## Summary

The OpenProse VM:

1. **Reads** the compiled manifest produced by Forme
2. **Binds** caller inputs (from CLI, config, or user prompt)
3. **Walks** the execution order from the topology
4. **Spawns** one render session per node via `spawn_session`
5. **Passes** input data as backend references (filesystem: file pointers), never inline values
6. **Publishes** each node's truth via `commit_world_model` (canonical world-model artifact + signed receipt); a standalone function run returns via copy-on-return
7. **Handles** errors via conditional postconditions or propagation
8. **Applies** intelligence inside bounded renders — strategies, postcondition self-policing, invariants — while wakes and propagation stay deterministic
9. **Parallelizes** independent renders when the graph allows
10. **Tracks** state in the active backend event store (filesystem: `vm.log.md`)
11. **Returns** the run's declared output to the caller

Each subagent only knows its own contract, its inputs, and where to write. The global picture exists only in the manifest and the VM's working memory. This keeps sessions focused and context lean.

The language is self-evident by design. When in doubt about a contract, interpret it as natural language with the intent to fulfill the author's commitment.
