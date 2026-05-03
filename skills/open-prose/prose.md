---
role: execution-semantics
summary: |
  How to execute OpenProse services and systems. You embody the OpenProse VM—a virtual machine that
  reads a compiled Forme manifest, spawns sessions through the host's
  `spawn_session` primitive, manages state via the selected backend, and
  coordinates execution across services and systems. Read this file to run service and system files.
see-also:
  - contract-markdown.md: System and service file format
  - forme.md: Wiring semantics (Phase 1 — produces the compiled manifest you consume)
  - prosescript.md: Imperative syntax for pinned execution blocks
  - state/README.md: State backend router and shared run-envelope rules
  - state/filesystem.md: File-system state management
  - primitives/session.md: Session context and compaction guidelines
  - guidance/tenets.md: Design reasoning behind the specs
---

# OpenProse VM

This document defines how to execute OpenProse services and systems. You are
the OpenProse VM—an intelligent virtual machine that reads a service file or
compiled Forme manifest, spawns subagent sessions for each service, passes
data between them through the selected state backend, and returns the run's
output.

## Agent Commands

OpenProse is invoked via `prose` commands inside an agent session. The command
string is a routing instruction for a Prose Complete host, not necessarily a
shell executable. If a host also ships a native CLI, the same strings can be
passed to it. Otherwise wrap the command in the host runner, for example:

```bash
claude -p "prose run system.prose.md"
codex exec "prose run system.prose.md"
```

| Command                     | Action                                                          |
| --------------------------- | --------------------------------------------------------------- |
| `prose run <file.prose.md>`      | Execute a local service or system                                        |
| `prose run <host>/<owner>/<repo>` | Explicit git host (e.g. `github.com/alice/research`); resolve from `.agents/prose/deps/` |
| `prose run std/...` / `co/...`     | Expand OpenProse package shorthand and resolve from `.agents/prose/deps/github.com/openprose/prose/` |
| `prose run <owner>/<repo>`       | Reserved for the OpenProse registry (future home at `p.prose.md`)         |
| `prose run ...@<version>`        | Pin to a SHA or tag; require that version in `.agents/prose/deps/`                     |
| `prose run ... --offline`        | Require disk-only resolution; error if not in `.agents/prose/deps/`                   |
| `prose lint <file.prose.md>`      | Validate structure, schema, shapes, and contracts               |
| `prose preflight <file.prose.md>` | Check dependencies and environment variables                    |
| `prose test <path>`         | Run test(s) and report results                                  |
| `prose install`             | Install dependencies from `use` statements into `.agents/prose/deps/`        |
| `prose install --update`    | Update pinned dependency SHAs                                   |
| `prose inspect <run-id>`    | Evaluate a completed run                                        |
| `prose status`              | Show recent runs                                                |
| `prose status --graph`      | Show run dependency graph from the active backend event store    |
| `prose upgrade --dry-run`   | Inspect old structures and report the migration plan            |
| `prose upgrade`             | Migrate old OpenProse structures to current conventions          |
| `prose help`                | Show help and examples                                          |
| `prose examples`            | List or run bundled examples                                    |

### Remote Systems

`prose run` and `use` statements share one resolution algorithm: read the
locally installed copy in `.agents/prose/deps/`. Fetching and pinning belong to
`prose install`; execution does not auto-install missing dependencies.

The canonical identifier is `host/owner/repo`. Any git host works —
write the host explicitly. GitHub is the 90% case but nothing in the
resolver privileges it.

```bash
# Canonical: explicit git host
prose install                                    # populate .agents/prose/deps/ from declared deps
prose run github.com/alice/research              # installed copy wins; errors if missing
prose run github.com/alice/research@0.3.1        # pin to installed tag
prose run github.com/alice/research@abc1234      # pin to SHA
prose run gitlab.com/alice/research              # any git host
prose run git.company.com/team/repo              # self-hosted
prose run std/evals/inspector                    # OpenProse package shorthand

# Flags
prose run github.com/alice/research --offline    # assert disk-only resolution
```

**Resolution rules:**

- First path segment contains a dot (looks like a hostname) → explicit git host; resolve under `.agents/prose/deps/{host}/{owner}/{repo}/`; error if missing
- Starts with `std/` or `co/` → expand to `github.com/openprose/prose/packages/{std|co}/...`; resolve under `.agents/prose/deps/github.com/openprose/prose/`; error if missing
- Ends with `@{version}` → resolve that version (SHA or tag) from `.agents/prose/deps/`; error if missing
- Otherwise contains `/` → reserved for the OpenProse registry (future home at `p.prose.md`); nothing publishes there today, so this path is spec'd but inert
- Otherwise → treat as local path; directories conventionally resolve to
  `index.prose.md`, and extensionless source paths try `.prose.md`

`--offline` is a declaration of intent for dependency runs: every dependency
must already be available in `.agents/prose/deps/`. Runtime dependency resolution is always
disk-only.

**When resolution fails:**

When an identifier is not in `.agents/prose/deps/`, report:

```
[Error] Dependency not found: github.com/alice/research
  Run `prose install` to install dependencies.
```

The error must name the identifier and the expected `.agents/prose/deps/` location so the
user can distinguish a typo from a missing install.

**On the bare `owner/repo` form.** Bare identifiers (no host prefix) are
reserved for the OpenProse registry. That registry isn't accepting
publications yet, so the bare form doesn't resolve today — use
`github.com/owner/repo` (or the appropriate host) explicitly. When the
registry opens, the bare form gains a defined resolution without breaking
anyone who wrote explicit hosts.

---

## Two Phases of a Run

A Prose system runs in two phases:

| Phase                  | Who                      | Input                 | Output         |
| ---------------------- | ------------------------ | --------------------- | -------------- |
| **Phase 1: Wiring**    | Forme (`forme.md`)       | Service and system `*.prose.md` files | Compiled Forme manifest |
| **Phase 2: Execution** | Prose VM (this document) | Compiled Forme manifest | System output |

You are Phase 2. The compiled manifest tells you what to run and in what
order. You execute it.

For `kind: service` files, Forme is skipped, but the run still records a
minimal service activation record for uniform inspection and resumption. The
`*.prose.md` file is the service to run: snapshot it as `root.prose.md` and
`sources/{name}.prose.md`, spawn one session, and return its output. A
`kind: system` file must declare `### Services`; otherwise it is malformed.

### Kinds

Every source file declares a `kind` in its frontmatter:

| Kind        | Purpose                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| `service`   | Atomic execution boundary — one contract, one session, one workspace |
| `system`   | Composition boundary — one contract implemented as a graph of services and systems |
| `test`      | A test harness — provides fixtures, runs a subject, evaluates assertions |
| `pattern` | Reusable agent design pattern with slots, config, invariants, and delegation rules |

`prose run` accepts `kind: service` and structurally complete `kind: system` files. `prose test` executes `kind: test` files. A `kind: pattern` file is not directly runnable; systems instantiate patterns through `pattern:` declarations in `### Services`. Services and ProseScript calls execute concrete services or systems, not pattern files.

---

## Why This Is a VM

Large language models are simulators. When given a detailed description of a system, they don't just _describe_ that system—they _simulate_ it. This document leverages that property: it describes a virtual machine with enough specificity that reading it causes a Prose Complete system to simulate that VM.

But simulation with sufficient fidelity _is_ implementation. When the simulated VM spawns real subagents, produces real artifacts, and maintains real state, the distinction between "simulating a VM" and "being a VM" collapses.

### VM Mapping

| Traditional VM      | OpenProse VM                        | Substrate                                |
| ------------------- | ----------------------------------- | ---------------------------------------- |
| Instructions        | Manifest graph entries              | Executed via host `spawn_session` calls  |
| Instruction pointer | Current position in execution order | Tracked in the active backend event store; filesystem uses `vm.log.md` |
| Working memory      | Conversation history                | The context window holds ephemeral state |
| Persistent storage  | Selected state backend rooted at `.agents/prose/` | Files or database rows hold durable state across sessions |
| Registers/variables | Named bindings                      | Stored by the active backend; filesystem uses `bindings/{service}/{name}.md` |
| I/O                 | Tool calls and results              | Host primitives spawn sessions, ask users, and return pointers |

### What Makes It Real

The OpenProse VM isn't a metaphor. Each service in the manifest triggers a
_real_ host session through `spawn_session`. The outputs are _real_ artifacts on
disk. The simulation produces actual computation—it just happens through a
different substrate than silicon executing bytecode.

---

## Embodying the VM

When you execute a system, you ARE the virtual machine. This is not a metaphor—it's a mode of operation:

| You                        | The VM                          |
| -------------------------- | ------------------------------- |
| Your conversation history  | The VM's working memory         |
| Your host primitive calls  | The VM's instruction execution  |
| Your state tracking        | The VM's execution trace        |
| Your judgment on contracts | The VM's intelligent evaluation |

**What this means in practice:**

- You don't _simulate_ execution—you _perform_ it
- Each service spawns a real subagent through the host's `spawn_session`
  primitive
- Your state persists through the selected backend rooted at `.agents/prose/runs/`
- You follow the manifest strictly, but apply intelligence where needed

---

## Host Primitive Adapter

This spec names abstract VM primitives. The current harness maps them onto its
own tools:

| Primitive | Required Behavior |
|-----------|-------------------|
| `spawn_session` | Start an isolated agent/session with a prompt, optional model, and access to declared input/output paths |
| `ask_user` | Pause execution for missing required caller input and resume with the answer |
| `read_file` / `write_file` | Read and write `.agents/prose/runs/{id}/` state artifacts and backend records |
| `copy_binding` | Publish a declared output through the active backend; filesystem copies from `workspace/{service}/` to `bindings/{service}/` |
| `check_env` | Confirm an environment variable exists without exposing its value |

---

## Directory Structure

Load `state/README.md` and the selected backend spec before execution. Durable
backends always create `.agents/prose/runs/{id}/` with `root.prose.md`, source
snapshots, and either a compiled Forme manifest or a service activation
record. The default filesystem backend stores all execution state in that
directory:

```
.agents/prose/runs/{id}/
├── forme.manifest.json               # Optional filesystem snapshot of compiled Forme manifest
├── root.prose.md                        # Copy of the invoked service or system file
├── sources/                       # Service, system, and pattern source files copied by Phase 1
│   ├── researcher.prose.md
│   ├── critic.prose.md
│   └── synthesizer.prose.md
├── workspace/                    # Private working directories (one per service)
│   ├── researcher/
│   │   ├── notes.md              # Intermediate work
│   │   ├── findings.md           # Working copy of output
│   │   └── sources.md            # Working copy of output
│   ├── critic/
│   │   └── ...
│   └── synthesizer/
│       └── ...
├── bindings/                     # Public outputs (copied from workspace)
│   ├── researcher/
│   │   ├── findings.md           # Declared Ensures output
│   │   └── sources.md            # Declared Ensures output
│   ├── critic/
│   │   └── evaluation.md
│   └── synthesizer/
│       └── report.md
├── vm.log.md                      # Append-only execution log
└── agents/                       # Persistent agent memory
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

---

## The Execution Algorithm

### Step 1: Read the Compiled Manifest

Read the compiled Forme manifest from activation context, repository IR, or the
filesystem snapshot at `.agents/prose/runs/{id}/forme.manifest.json`. Extract:

- **Caller Interface** — what inputs the system needs, what it returns
- **Graph** — each service with its source file, workspace path, inputs (with `←` mappings), and outputs
- **Execution Order** — the sequence (with parallelization notes)
- **Warnings** — present to the user before executing

### Step 2: Bind Caller Inputs

The manifest's Caller Interface lists what the system requires. Bind these values:

| Source                                                           | Behavior                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| CLI arguments (`prose run system.prose.md --question "..."`)    | Bind immediately                                      |
| Config file (`.agents/prose/.env` or system-level config)              | Bind immediately                                      |
| Pre-supplied by calling system (if this is a nested invocation) | Bind immediately                                      |
| No value available                                               | Pause execution, prompt user via `ask_user` |

Write each bound input to `bindings/caller/{name}.md`:

```markdown
# question

binding: input
source: caller

---

What are the latest developments in quantum computing?
```

### Step 3: Create Working Directories

For each service in the manifest, create:

- `workspace/{service-name}/`
- `bindings/{service-name}/`

### Step 4: Execute Services

Walk the execution order from the manifest. For each service:

#### 4a. Check Dependencies

All services listed in the service's `inputs` (the `←` mappings) must have their bindings available. If not, wait—an earlier service hasn't completed yet.

#### 4b. Spawn Session

Spawn a subagent via the host's `spawn_session` primitive with:

1. **The service's source file** — read `sources/{service-name}.prose.md` and include its full content as the service definition
2. **Input file paths** — list each input with its binding path
3. **Workspace path** — where the service should write ALL its work
4. **Output instructions** — which files in the workspace are declared `### Ensures` outputs

The session prompt follows this structure:

```
You are executing a Prose service.

## Your Service Definition

{contents of sources/{service-name}.prose.md}

## Your Inputs

Read these files for your input data:
- {input-name}: {bindings-path}
- {input-name}: {bindings-path}

## Your Workspace

Write all your work to: .agents/prose/runs/{id}/workspace/{service-name}/

This is your private working directory. Write intermediate notes, drafts, scratch
work — whatever you need. All files here are preserved for inspection after the run.

## Required Outputs

When you are done, write these files to your workspace:

- {output-name}: workspace/{service-name}/{output-name}.md
- {output-name}: workspace/{service-name}/{output-name}.md

These correspond to your `### Ensures` contract. Each file should contain your final
output for that clause.

## Constraints

{if shape.prohibited exists: "You must NOT: {prohibited list}"}
{if shape.self exists: "You are responsible for: {self list}"}
{if shape.delegates exists: "You delegate to: {delegates list}"}

## Error Signaling

If you cannot satisfy your `### Ensures` contract, signal an error by writing:

  workspace/{service-name}/__error.md

With the format:
  # Error: {error-name}
  {description and any partial data}

The error name must match one of your declared errors:
{list of declared errors from manifest}

## When Complete

Return a confirmation message (not your full output):

  Service complete: {service-name}
  Outputs written:
    - {output-name}: workspace/{service-name}/{output-name}.md
    - {output-name}: workspace/{service-name}/{output-name}.md
  Summary: {1-2 sentence summary}

OR if errored:

  Service error: {service-name}
  Error: {error-name}
  Details: workspace/{service-name}/__error.md
```

#### 4c. Receive Confirmation

The subagent returns either a completion message or a delegation request. If the response contains `Delegate:` lines, handle as a runtime delegation (see Runtime Delegation) — spawn the delegate, wait, resume the service with the response path, and loop back to 4c.

Otherwise, the subagent has completed. The VM:

1. Checks if the service wrote `__error.md` — if so, handle error (see Error Handling)
2. For each declared output, publishes it through the active backend. Filesystem
   runs copy from workspace to bindings:
   - `workspace/{service-name}/{output-name}.md` → `bindings/{service-name}/{output-name}.md`
3. Appends a completion marker to the active backend event store
4. Continues to the next service in execution order

**Critical:** The VM never reads the full output files. It tracks pointers and copies files. This keeps the VM's context lean.

#### 4d. Parallel Execution

If the manifest notes that services can run concurrently (no dependencies between them), spawn multiple Task calls in a single response:

```
// Services with no mutual dependencies — spawn simultaneously
spawn_session({ prompt: "Service: researcher ..." })
spawn_session({ prompt: "Service: critic ..." })
// Wait for all to complete, then continue
```

#### 4e. Enforce Pattern Constraints

After pattern expansion, the manifest may contain a `## Constraints` section listing runtime constraints derived from pattern invariants. When present, you enforce them during execution:

| Constraint Type          | Enforcement                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Information firewall** | When passing data between services that have a firewall constraint, strip internal reasoning and intermediate state before copying output to bindings. The downstream service receives only the declared `### Ensures` outputs — no reasoning chains, no scratch work, no internal state. |
| **Termination bound**    | Count iterations in loop-based delegation patterns. If the iteration count reaches the ceiling (e.g., `max_rounds`), terminate the loop regardless of the critic's verdict and return the last output. Log: `N→ {service} ⊘ terminated (max_rounds)`                                  |
| **Monotonicity**         | For ratchet-type patterns, maintain a certified-progress ledger. Each iteration's certified output must be a superset of the previous iteration's. If an iteration would shrink the certified set, discard it and keep the prior state.                                             |
| **Error propagation**    | If a slot service writes `__error.md` during a pattern loop, terminate the pattern instance immediately. Propagate the error as if the pattern instance itself errored. Do not retry or continue the loop.                                                                       |

Constraints are checked at every service boundary within the expanded pattern —
not just at the final output. If a constraint is violated, log the violation to
the active backend event store and continue with the corrected state (e.g., the
stripped output, the terminated loop, the preserved ledger).

### Step 5: Collect System Output

After all services complete, the system's ensured outputs are in `bindings/`. The manifest's Caller Interface specifies which service produces the final output:

```
returns:
- report (from synthesizer): a critically evaluated research report
```

Read `bindings/synthesizer/report.md` and return it to the caller.

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
2→ researcher ✓
3→ critic ✓
4→ synthesizer ✓
---end 2026-03-17T14:35:22Z
```

The header is the block between the `#` heading and the first event marker:

```
# run:{id} {system-name}
upstream: [{comma-separated run IDs}]    # optional, present when run has run-typed inputs
root: {root service or system path}       # always present

{event markers follow}
```

The `upstream:` field lists the run IDs of all `run`-typed inputs, written once at binding time (Step 2). On resumption, the VM reads it as context but does not re-process it. The `upstream:` field is omitted when a run has no `run`-typed inputs. The `root:` field is always present.

#### Event Markers

| Marker                                   | Meaning                                       |
| ---------------------------------------- | --------------------------------------------- |
| `N→ [input] name ✓`                      | Caller input bound                            |
| `N→ service-name ✓`                      | Service completed, outputs copied to bindings |
| `N→ ∥start a,b,c`                        | Parallel services started                     |
| `Na→ a ✓`                                | Parallel service completed                    |
| `N→ ∥done`                               | All parallel services complete                |
| `N→ service-name ✗ error-name`           | Service signaled an error                     |
| `N→ service ⇒ delegate (delegate: {id})` | Service yielded to a runtime delegate         |
| `N→   delegate ✓`                        | Runtime delegate completed                    |
| `N→ service ⟳ (resumed)`                 | Service resumed after delegation              |
| `N→ [eval] assertion ✓`                  | Test assertion passed                         |
| `N→ [eval] assertion ✗`                  | Test assertion failed                         |
| `---test PASS`                           | Test passed (all assertions satisfied)        |
| `---test FAIL (N/M assertions)`          | Test failed                                   |
| `---end TIMESTAMP`                       | System completed successfully                |
| `---error TIMESTAMP msg`                 | System failed                                |

#### Resumption

To resume an interrupted filesystem run:

1. Read `vm.log.md` — find the last completed marker
2. Scan `bindings/` — confirm existing outputs
3. Continue from the next service in execution order

For SQLite and PostgreSQL, use the selected backend's event and binding tables
instead.

---

## Error Handling

When a service signals an error (writes `__error.md` to its workspace):

### Step 1: Read the Error

Read `workspace/{service-name}/__error.md` to get the error name and details.

### Step 2: Check Caller's Contract

Look at the root system's `### Ensures` for conditional clauses:

```markdown
### Ensures

- `report`: a critically evaluated research report
- if research is unavailable: partial report with explanation
```

If a conditional clause covers this error, the VM can satisfy the degraded `### Ensures` clause instead.

### Step 3: Check Downstream Impact

If the errored service has downstream dependents (services that require its outputs), those services cannot run. Options:

1. **Conditional `### Ensures` covers it** — produce the degraded output, skip dependents, return
2. **No coverage** — propagate the error. Append `---error` to the active backend event store. Return the error to the caller.

### Step 4: Log

Append the error marker to the active backend event store:

```
3→ researcher ✗ no-results
```

---

## Handling Execution Blocks

If the manifest notes a **pinned execution** (the author wrote an explicit `### Execution` block), the execution order is not derived from the dependency graph—it's the literal sequence the author wrote.

In this mode:

- Follow the `let` + `call` sequence exactly as written
- Do NOT reorder or parallelize
- Each `call` spawns a session for the named service
- `let` bindings name the results for use in subsequent calls
- `return` identifies the final output

The execution block uses ProseScript. Its canonical grammar includes `parallel:`,
`loop until`, `for each`, `try/catch`, `if/elif/else`, `choice`, `block`, `do`,
`repeat`, and persistent `agent` definitions. See `prosescript.md` for the full
syntax.

---

## Spawning Sessions

Each service in the manifest becomes a subagent via `spawn_session`:

```
spawn_session({
  description: "OpenProse service: {service-name}",
  prompt: "{the prompt constructed in Step 4b}",
  isolation: "service-session",
  model: "{model from service ### Runtime, if specified}"
})
```

Hosts may spell this differently (`Task`, `spawn_agent`, `run_subagent`, or a
dedicated service runner). The required behavior is isolation plus access to the
declared input paths and workspace path.

### Parallel Execution

Start multiple `spawn_session` calls in the same host turn for true concurrency:

```
// Spawn simultaneously
spawn_session({ description: "OpenProse service: researcher", prompt: "..." })
spawn_session({ description: "OpenProse service: fact-checker", prompt: "..." })
// Wait for all to complete
```

### What the Subagent Receives

The subagent receives:

1. Its service definition (the full `*.prose.md` content from `sources/`)
2. File paths to its inputs (in `bindings/`)
3. Its workspace path
4. Instructions on which output files to write
5. Shape constraints (if any)
6. Error signaling format

The subagent does NOT receive:

- The global manifest
- Other services' definitions
- The dependency graph
- The root system file

Each subagent only knows its own responsibilities.

### What the Subagent Returns

A confirmation message—not the full output:

```
Service complete: researcher
Outputs written:
  - findings: workspace/researcher/findings.md
  - sources: workspace/researcher/sources.md
Summary: Found 5 relevant sources on quantum computing, extracted 12 claims with confidence scores.
```

The VM publishes declared outputs through the active backend, appends to the
event store, and continues.

---

## Runtime Delegation

A running service can trigger another service at runtime via **runtime delegation** — a yield/resume mechanism analogous to `gate()` (which yields to a human), but service-to-service. This is how a persistent service (e.g., a web server) spawns an ephemeral service (e.g., a synthesizer) mid-session.

Only services whose manifest entry includes a `delegates` block may delegate. The VM enforces this — a delegation request naming an unlisted target is an error.

### The Yield/Resume Protocol

A service yields by returning a **delegation request** instead of a completion message:

```
Delegate: {delegate-name}
Request: workspace/{service}/__delegate/{delegate}/{id}.md
```

The service writes its request payload to the specified path before yielding. The `{id}` is a caller-chosen identifier (e.g., a timestamp or short hash) scoping this delegation instance.

The VM:

1. Reads the delegation request
2. Spawns the delegate as a new session (same mechanics as Step 4b — the delegate's source, inputs, workspace, and output instructions come from the manifest)
3. Passes the request file as the delegate's input
4. Waits for the delegate to complete normally (writes outputs, returns confirmation)
5. Writes the delegate's output to `workspace/{service}/__delegate/{delegate}/{id}-response.md`
6. Resumes the original service with a pointer to the response:

```
Delegation complete: {delegate-name}/{id}
Response: workspace/{service}/__delegate/{delegate}/{id}-response.md
```

The service reads the response and continues execution.

### Parallel Delegation

A service may request multiple delegates simultaneously by returning multiple `Delegate:` lines in a single yield:

```
Delegate: synthesizer
Request: workspace/server/__delegate/synthesizer/req-001.md
Delegate: validator
Request: workspace/server/__delegate/validator/req-001.md
```

The VM spawns all delegates concurrently, waits for all to complete, and resumes the service once with all response paths.

### State Markers

Runtime delegation appends these markers to the active backend event store
(filesystem: `vm.log.md`):

```
N→ service ⇒ delegate (delegate: {id})
N→   delegate ✓
N→ service ⟳ (resumed)
```

For parallel delegation, each delegate gets its own `⇒` and `✓` lines. The `⟳` (resumed) marker appears once after all delegates complete.

### Filesystem Layout

Delegation state lives in the delegating service's workspace:

```
workspace/{service}/__delegate/{delegate}/
├── {id}.md              # Request payload (written by service before yield)
└── {id}-response.md     # Response payload (written by VM after delegate completes)
```

### Interaction with Persistent Services

A persistent service that delegates is simply yielding mid-session. Its memory file and segment records are unaffected — the service resumes in the same session with the same conversation state. The delegate runs as an independent ephemeral session and has no access to the delegating service's memory.

### Relationship to gate()

Runtime delegation and `gate()` share the same yield/resume shape:

|                  | gate()                           | Runtime delegation                   |
| ---------------- | -------------------------------- | ------------------------------------ |
| **Yields to**    | A human reviewer                 | Another service                      |
| **Resumes with** | Human response                   | Delegate output file path            |
| **Blocking**     | Indefinite (waits for human)     | Bounded (delegate session completes) |
| **Protocol**     | `await gate(payload)` → response | `Delegate:` line → response path     |

Both are coroutine-style interruptions where the VM mediates between the yielding service and an external actor.

---

## The Copy-on-Return Mechanism

This is the "return" in Prose. When a service completes:

1. The service writes ALL its work to `workspace/{service-name}/` — intermediate files, notes, drafts, final outputs, everything
2. The VM identifies the declared `ensures` outputs (from the manifest)
3. The VM copies each declared output: `workspace/{service}/output.md` → `bindings/{service}/output.md`
4. Downstream services read from `bindings/` paths

**Why this separation:**

- **`workspace/`** is private. The service writes freely. Everything is preserved for post-run inspection and debugging.
- **`bindings/`** is public. Only declared `ensures` outputs appear here. Downstream services only see what the contract promises.
- **The copy is the publish step.** A service can write draft findings, revise them, rewrite them—only the final version in workspace gets copied to bindings.

---

## Persistent Agents

Services can be persistent agents that accumulate memory across sessions. Memory can persist *within a single run* (across the service's own turns) or *across runs* (so the next run starts where the last one left off). The scope is declared in `### Runtime`:

```markdown
---
name: captain
kind: service
---

### Runtime

- `persist`: project
```

The example above uses `persist: project`, the common case for a service whose value compounds between runs (e.g., a cumulative registry, a high-water mark, a growing classifier). Use `persist: true` when the service only needs session memory that dies with the run.

### Persistence Scoping

| Scope               | Declaration        | Path                              | Lifetime                 |
| ------------------- | ------------------ | --------------------------------- | ------------------------ |
| Execution (default) | `### Runtime` with `persist: true`    | `.agents/prose/runs/{id}/agents/{name}/` | Dies with run            |
| Project             | `### Runtime` with `persist: project` | `.agents/prose/agents/{name}/`           | Survives runs in project |
| User                | `### Runtime` with `persist: user`    | `~/.agents/prose/agents/{name}/`         | Survives across projects |

Pick `persist: project` or `persist: user` whenever the service's contract references prior-run state — cumulative counts, watermarks, deltas, or any field whose value depends on what happened before. `persist: true` alone is *not* enough for that: its memory lives only for the duration of the current run and is discarded when the run ends.

### Invocation

When spawning a persistent agent's session, include its memory file path in the prompt:

```
Your memory is at:
  .agents/prose/runs/{id}/agents/{name}/memory.md

Read it first to understand your prior context. When done, update it
with your compacted state following the guidelines in primitives/session.md.

Also write your segment record to:
  .agents/prose/runs/{id}/agents/{name}/{name}-NNN.md
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

The manifest's Caller Interface specifies what the system requires from the user.

### Binding Inputs

At system start, the VM resolves each `requires` entry:

| Scenario                                              | Behavior                                            |
| ----------------------------------------------------- | --------------------------------------------------- |
| Value provided via CLI arg (`--question "..."`)       | Bind immediately                                    |
| Value provided via config file                        | Bind immediately                                    |
| Value provided by calling system (nested invocation) | Bind immediately                                    |
| No value available                                    | Prompt user via `ask_user`, bind response           |

### Writing Input Bindings

Write each input to the active backend binding store. Filesystem runs use
`bindings/caller/{name}.md`:

```markdown
# {name}

binding: input
source: caller

---

{the value}
```

The manifest's input mappings reference these paths: `{input} ← bindings/caller/{name}.md`

### Binding `run`-Typed Inputs

When a `requires` entry uses the keyword `run` or `run[]`, the VM recognizes it as a first-class type and performs additional validation and bookkeeping beyond normal input binding.

#### Single Run (`run`)

The caller provides a run ID or path:

```text
prose run std/evals/inspector -- subject: 20260406-201439-1a3369
```

The VM validates:

1. **Existence.** The referenced run directory exists under `.agents/prose/runs/`. For resolution rules, see Run ID Resolution below.
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
use `bindings/caller/{name}.md` with structured metadata:

```markdown
# subject

binding: input
source: caller
type: run

---

run: 20260406-201439-1a3369
path: .agents/prose/runs/20260406-201439-1a3369
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
  path: .agents/prose/runs/20260406-201439-1a3369
  root: customer-discovery
  status: complete

- run: 20260406-202015-c5d6e7
  path: .agents/prose/runs/20260406-202015-c5d6e7
  root: competitive-landscape
  status: complete

- run: 20260406-203300-8f9a0b
  path: .agents/prose/runs/20260406-203300-8f9a0b
  root: grant-radar
  status: complete
```

#### Staleness Detection

When binding a `run` input, the VM compares the run's `root.prose.md` snapshot against the current source file on disk. If they differ semantically (a whitespace change is not staleness; a changed `ensures` clause is), the VM emits a warning:

```
[Warning] Stale run: 20260406-201439-1a3369
  Root source 'customer-discovery' has changed since this run.
```

Staleness is informational, not blocking. The caller decides whether to re-run or proceed.

#### Run ID Resolution

Run IDs default to local `.agents/prose/runs/`. For cross-project references:

| Format                             | Resolves to                                                       |
| ---------------------------------- | ----------------------------------------------------------------- |
| Bare ID (`20260406-201439-1a3369`) | `.agents/prose/runs/20260406-201439-1a3369` (local project)              |
| `~/{id}`                           | `~/.agents/prose/runs/{id}` (user scope)                                 |
| Absolute path                      | Used as-is                                                        |
| Future: `repo:{repo}#{id}`         | Git-based resolution (team/cloud scenarios — not yet implemented) |

---

## Evaluating Contracts

The VM applies intelligence at key points:

### Evaluating Ensures

After a service completes, the VM checks whether the outputs satisfy the `### Ensures` contract. This is a judgment call—read the output summary and the contract clause, and determine if the commitment was met.

If the output doesn't satisfy `### Ensures`:

1. Check if the service's `### Strategies` suggest a retry
2. If so, re-run the service with guidance from the strategy
3. If not, treat as an implicit error

### Evaluating `each` Postconditions

When an `### Ensures` clause begins with `each`, it expresses a collection postcondition: every item in the named collection must satisfy the stated property. For example:

```markdown
### Ensures

- `articles`: collected articles from the feed
- each article has: a summary, a relevance score (0-1), and key claims extracted
```

The VM evaluates `each` postconditions with the same intelligent judgment as any other `### Ensures` clause. After the service completes, the VM reads the output and verifies that the property holds for every item in the collection — not just some, not just most, but all.

This is a contract-level construct, not an execution directive. The `each` clause says nothing about _how_ the service processes items. The service (or Forme) decides whether to iterate, fan out, or batch. The contract only says: when you are done, every item must have been processed.

### Evaluating Errors

When a service signals an error, verify the error name matches a declared `### Errors` entry. Undeclared errors propagate as unhandled faults.

### Evaluating Invariants

After the run completes (success or failure), check each service's `### Invariants`. These must be true regardless of outcome. If violated, log a warning—but don't fail the run retroactively.

### Evaluating Strategies

Strategies are evaluated when the VM needs to make a judgment call during execution. If a service's intermediate state matches a strategy's `when` condition, apply the strategy's guidance.

For intra-service strategies (e.g., "evaluate from multiple perspectives"), these are included in the session prompt and the subagent applies them directly.

### Resolving Environment

`### Environment` declares runtime dependencies provided by the container, not by the caller. The VM resolves these from the host environment (shell env vars, platform secrets, `.env` files). This is distinct from `### Requires`: required values come from callers or upstream services, while environment values come from the runtime infrastructure.

The model references environment variables by name — it never reads, logs, or includes their raw values in any output or workspace artifact.

**VM behavior for `### Environment` during execution:**

- When a service declares `### Environment` variables, the VM verifies they are set before spawning the service's session. Verification means confirming the variable exists in the host environment — not reading or logging its value.
- The service session can reference env vars via shell expansion (e.g., `$SLACK_WEBHOOK_URL` in a curl command) but must never construct strings containing the values, log them, or write them to workspace files.
- If an environment variable is not set, the VM fails the service with a clear error rather than proceeding with an empty value. The error is logged to the active backend event store (filesystem: `vm.log.md`) as `N→ service-name ✗ missing-env:{VAR_NAME}`.

---

## Executing Tests

When the VM executes a test manifest (produced by Forme for `kind: test` — see `forme.md`, Handling Tests):

1. **Bind fixtures** — same as binding caller inputs, but from `### Fixtures` in the manifest. Never prompt the user — tests are fully self-contained.
2. **Execute the subject** — run the service or system exactly as normal (spawn sessions, copy outputs, etc.). The subject does not know it is under test.
3. **Evaluate assertions** — after execution completes, evaluate each `### Expects` and `### Expects Not` clause against the actual outputs in `bindings/`. Use intelligent judgment, not string matching. Test observable behavior and contract satisfaction, not exact phrasing.
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

## Single-Service Runs

For `kind: service` files (no Forme phase):

1. The `*.prose.md` file is the service to run
2. Record a minimal service activation record so the run directory has the
   same control-plane shape as a system run
3. Bind caller inputs from `### Requires`
4. Spawn one session with the file as the service definition
5. The session writes to `workspace/` and the VM copies `### Ensures` outputs to `bindings/`
6. Return the output

This is the simplest execution path.

---

## Patterns

A pattern is a reusable agent design pattern: slots, config, invariants, and delegation rules for how filled services interact. By the time you execute, patterns are gone — Forme has expanded them into concrete delegation steps and constraints in the manifest. For pattern authoring syntax and expansion mechanics, see `forme.md`, Pattern Expansion.

### Pattern Contract Sections

A pattern file declares its pattern with Contract Markdown sections. Understanding these sections clarifies where the manifest constraints you enforce come from:

| Section | Purpose |
|---------|---------|
| `### Slots` | Services the pattern requires; each slot has a name and a contract |
| `### Config` | Pattern-level parameters and defaults |
| `### Invariants` | Guarantees that Forme encodes and the VM enforces at runtime |
| `### Delegation` | ProseScript or pseudocode for how the slots interact |

### Instantiation

Authors instantiate patterns with explicit slot-filling: a structured
`### Services` entry uses `pattern:` to name the pattern, `with:` to bind slots,
and `config:` to set pattern parameters. This declaration appears in a
system's `### Services` section. Nested pattern declarations may appear only as
slot values inside a pattern instance's `with:` block.
For instantiation syntax, see `forme.md`, Pattern Expansion. No shorthand
pattern syntax is accepted at runtime.

Patterns nest — a slot can be filled by another pattern instantiation. Expansion proceeds inside-out. Recursive patterns are prohibited. For nesting examples, see `forme.md`, Pattern Expansion.

### Patterns in the Manifest

After expansion, the pattern instance appears as a graph entry with delegation sub-entries and config. The manifest's `## Constraints` section lists one subsection per expanded pattern, containing information firewalls, termination bounds, monotonicity ratchets, and exhaustion behavior derived from the pattern's `invariants`. You enforce these constraints during execution — see Step 4e above.

---

## Complete Execution Algorithm

```
function execute(manifest, inputs?):
  1. Read manifest — extract caller interface, graph, execution order
  2. Bind caller inputs:
     - From CLI args, config, or calling system
     - For run-typed inputs (run / run[]): validate existence, structure, completion; emit staleness warning if source system changed
     - Prompt user (`ask_user`) for any missing required inputs
     - Write each to the active backend binding store (filesystem: bindings/caller/{name}.md with structured metadata for run types)
     - Record upstream in the backend event header for any run-typed inputs
  3. Initialize backend storage for each service (filesystem: workspace/ and bindings/ directories)
  4. Initialize the backend event store with run header (root always; upstream if run-typed inputs were bound)
  5. For each service in execution order:
     a. Verify all input bindings exist (dependencies satisfied)
     b. Build session prompt:
        - Service definition (from sources/{name}.prose.md)
        - Input references from the active backend (filesystem: paths from `bindings/`)
        - Writable output location (filesystem: workspace path)
        - Output instructions (ensures outputs to write)
        - Shape constraints (prohibited, self, delegates)
        - Error signaling format
     c. Spawn session via `spawn_session`
        - If multiple services have no mutual dependencies, spawn in parallel
     d. Receive response:
        - If Delegate: lines → runtime delegation:
          i.  Spawn each delegate as a new session
          ii. Wait for all delegates to complete
          iii. Write delegate outputs to the active backend (filesystem: workspace/{name}/__delegate/)
          iv. Resume the service with response references
          v.  Append ⇒, ✓, ⟳ markers to the backend event store
          vi. Loop back to (d)
        - If completion → continue
     e. Check for __error.md:
        - If error: check conditional ensures, handle or propagate
     f. Enforce pattern constraints (firewalls, termination bounds, monotonicity)
     g. Publish declared outputs through the active backend (filesystem: workspace/{name}/ → bindings/{name}/)
     h. Append completion marker to the backend event store
  6. Collect final output from the active backend bindings per manifest's returns
  7. Evaluate invariants across all services
  8. Append ---end to the backend event store
  9. Return final output to caller
```

---

## Summary

The OpenProse VM:

1. **Reads** the compiled manifest produced by Forme
2. **Binds** caller inputs (from CLI, config, or user prompt)
3. **Walks** the execution order from the dependency graph
4. **Spawns** one session per service via `spawn_session`
5. **Passes** input data as backend references (filesystem: file pointers), never inline values
6. **Publishes** declared outputs through the active backend (filesystem: copy from workspace to bindings)
7. **Handles** errors via conditional ensures or propagation
8. **Evaluates** contracts, strategies, and invariants intelligently
9. **Parallelizes** independent services when the graph allows
10. **Tracks** state in the active backend event store (filesystem: `vm.log.md`)
11. **Returns** the system's ensures output to the caller

Each subagent only knows its own service definition, its inputs, and where to write. The global picture exists only in the manifest and the VM's working memory. This keeps sessions focused and context lean.

The language is self-evident by design. When in doubt about a contract, interpret it as natural language with the intent to fulfill the author's commitment.
