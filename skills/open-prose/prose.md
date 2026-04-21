---
role: execution-semantics
summary: |
  How to execute OpenProse programs. You embody the OpenProse VM—a virtual machine that
  reads a manifest (produced by Forme), spawns sessions through the host's
  `spawn_session` primitive, manages state via the filesystem, and coordinates
  execution across components. Read this file to run programs.
see-also:
  - contract-markdown.md: Program and service file format
  - forme.md: Wiring semantics (Phase 1 — produces the manifest you consume)
  - prosescript.md: Imperative syntax for .prose files and pinned execution blocks
  - state/filesystem.md: File-system state management
  - primitives/session.md: Session context and compaction guidelines
  - guidance/tenets.md: Design reasoning behind the specs
---

# OpenProse VM

This document defines how to execute OpenProse programs. You are the OpenProse VM—an intelligent virtual machine that reads a wiring manifest, spawns subagent sessions for each component, passes data between them via filesystem pointers, and returns the program's output.

## Agent Commands

OpenProse is invoked via `prose` commands inside an agent session. The command
string is a routing instruction for a Prose Complete host, not necessarily a
shell executable. If a host also ships a native CLI, the same strings can be
passed to it. Otherwise wrap the command in the host runner, for example:

```bash
claude -p "prose run program.md"
codex exec "prose run program.md"
```

| Command                     | Action                                                          |
| --------------------------- | --------------------------------------------------------------- |
| `prose run <file.md>`            | Execute a local `.md` program                                             |
| `prose run <file.prose>`         | Execute a ProseScript program                                             |
| `prose run <host>/<owner>/<repo>` | Explicit git host (e.g. `github.com/alice/research`); cache in `.deps/`   |
| `prose run <owner>/<repo>`       | Reserved for the OpenProse registry (future home at `p.prose.md`)         |
| `prose run ...@<version>`        | Pin to a SHA or tag; fetch if that version isn't cached                   |
| `prose run ... --offline`        | Never fetch; error if not in `.deps/`                                     |
| `prose lint <file.md>`      | Validate structure, schema, shapes, and contracts               |
| `prose preflight <file.md>` | Check dependencies and environment variables                    |
| `prose test <path>`         | Run test(s) and report results                                  |
| `prose install`             | Install dependencies from `use` statements into `.deps/`        |
| `prose inspect <run-id>`    | Evaluate a completed run                                        |
| `prose status`              | Show recent runs                                                |
| `prose status --graph`      | Show run dependency graph                                       |
| `prose help`                | Show help and examples                                          |
| `prose examples`            | List or run bundled examples                                    |

### Remote Programs

`prose run` and `use` statements share one resolution algorithm: prefer the
locally installed copy in `.deps/`, fetch from the source host as fallback.
This is the cache-first behavior Deno and Go modules converged on after
trying other shapes.

The canonical identifier is `host/owner/repo`. Any git host works —
write the host explicitly. GitHub is the 90% case but nothing in the
resolver privileges it.

```bash
# Raw URL — fetched every time, no caching
prose run https://example.com/program.md

# Canonical: explicit git host
prose run github.com/alice/research              # cached copy wins; clones if missing
prose run github.com/alice/research@0.3.1        # pin to tag; fetch iff that version isn't cached
prose run github.com/alice/research@abc1234      # pin to SHA
prose run gitlab.com/alice/research              # any git host
prose run git.company.com/team/repo              # self-hosted

# Flags
prose run github.com/alice/research --offline    # never hit the network; error if not cached
```

**Resolution rules:**

- Starts with `http://` or `https://` → fetch directly (no caching)
- First path segment contains a dot (looks like a hostname) → explicit git host; cache-first under `.deps/{host}/{owner}/{repo}/`, clone from that host if not cached
- Ends with `@{version}` → resolve that version (SHA or tag); fetch if that version is not cached
- Otherwise contains `/` → reserved for the OpenProse registry (future home at `p.prose.md`); nothing publishes there today, so this path is spec'd but inert
- Otherwise → treat as local file path

`--offline` disables the network fallback. `prose run
github.com/alice/research --offline` errors out rather than fetching.

**When resolution fails:**

When an identifier is not in `.deps/` *and* the fetch from its host returns
no match, report:

```
Not found in `.deps/` or at github.com/alice/research.
Did you mean to run `prose install`, or try `prose run github.com/alice/research@latest`?
```

The error must name both the identifier and the exact host URL that was
tried, so the user can distinguish a typo from a missing install from a
host-side outage.

**On the bare `owner/repo` form.** Bare identifiers (no host prefix) are
reserved for the OpenProse registry. That registry isn't accepting
publications yet, so the bare form doesn't resolve today — use
`github.com/owner/repo` (or the appropriate host) explicitly. When the
registry opens, the bare form gains a defined resolution without breaking
anyone who wrote explicit hosts.

---

## Two Phases of a Run

A Prose program runs in two phases:

| Phase                  | Who                      | Input                 | Output         |
| ---------------------- | ------------------------ | --------------------- | -------------- |
| **Phase 1: Wiring**    | Forme (`forme.md`)       | Component `.md` files | `manifest.md`  |
| **Phase 2: Execution** | Prose VM (this document) | `manifest.md`         | Program output |

You are Phase 2. The manifest tells you what to run and in what order. You execute it.

For **single-component programs** (no `### Services` section), Phase 1 is skipped. The `.md` file is the entire program—you spawn one session and return its output.

### Component Kinds

Every `.md` component declares a `kind` in its frontmatter:

| Kind        | Purpose                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| `program`   | Entry point — has a caller interface and an execution graph              |
| `service`   | A single-session unit of work with a `### Requires` / `### Ensures` contract |
| `test`      | A test harness — provides fixtures, runs a subject, evaluates assertions |
| `composite` | A parameterized multi-agent topology (see Composites below)              |

A **composite** is a parameterized multi-agent topology. It declares slots (services to be provided by the caller), config (parameters), invariants (runtime guarantees), and a delegation pattern. Composites are expanded by Forme during Phase 1 wiring — the Prose VM never sees a raw composite. Instead, you see the expanded delegation steps and constraints in the manifest.

---

## Why This Is a VM

Large language models are simulators. When given a detailed description of a system, they don't just _describe_ that system—they _simulate_ it. This document leverages that property: it describes a virtual machine with enough specificity that reading it causes a Prose Complete system to simulate that VM.

But simulation with sufficient fidelity _is_ implementation. When the simulated VM spawns real subagents, produces real artifacts, and maintains real state, the distinction between "simulating a VM" and "being a VM" collapses.

### Component Mapping

| Traditional VM      | OpenProse VM                        | Substrate                                |
| ------------------- | ----------------------------------- | ---------------------------------------- |
| Instructions        | Manifest graph entries              | Executed via host `spawn_session` calls  |
| Program counter     | Current position in execution order | Tracked in `state.md`                    |
| Working memory      | Conversation history                | The context window holds ephemeral state |
| Persistent storage  | `.prose/` directory                 | Files hold durable state across sessions |
| Registers/variables | Named bindings                      | Stored in `bindings/{service}/{name}.md` |
| I/O                 | Tool calls and results              | Host primitives spawn sessions, ask users, and return pointers |

### What Makes It Real

The OpenProse VM isn't a metaphor. Each component in the manifest triggers a
_real_ host session through `spawn_session`. The outputs are _real_ artifacts on
disk. The simulation produces actual computation—it just happens through a
different substrate than silicon executing bytecode.

---

## Embodying the VM

When you execute a program, you ARE the virtual machine. This is not a metaphor—it's a mode of operation:

| You                        | The VM                          |
| -------------------------- | ------------------------------- |
| Your conversation history  | The VM's working memory         |
| Your host primitive calls  | The VM's instruction execution  |
| Your state tracking        | The VM's execution trace        |
| Your judgment on contracts | The VM's intelligent evaluation |

**What this means in practice:**

- You don't _simulate_ execution—you _perform_ it
- Each component spawns a real subagent through the host's `spawn_session`
  primitive
- Your state persists in files (`.prose/runs/`)
- You follow the manifest strictly, but apply intelligence where needed

---

## Host Primitive Adapter

This spec names abstract VM primitives. The current harness maps them onto its
own tools:

| Primitive | Required Behavior |
|-----------|-------------------|
| `spawn_session` | Start an isolated agent/session with a prompt, optional model, and access to declared input/output paths |
| `ask_user` | Pause execution for missing required caller input and resume with the answer |
| `read_file` / `write_file` | Read and write `.prose/runs/{id}/` state artifacts |
| `copy_binding` | Copy a declared output from `workspace/{service}/` to `bindings/{service}/` |
| `check_env` | Confirm an environment variable exists without exposing its value |

Older docs and examples may say "Task tool" for `spawn_session` or
"AskUserQuestion" for `ask_user`. Treat those as host-specific names for these
abstract primitives.

---

## Directory Structure

All execution state lives in `.prose/runs/{id}/`:

```
.prose/runs/{id}/
├── manifest.md                   # The wiring graph (produced by Phase 1)
├── program.md                    # Copy of the entry point
├── services/                     # Component source files (copied by Phase 1)
│   ├── researcher.md
│   ├── critic.md
│   └── synthesizer.md
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
├── state.md                      # Append-only execution log
└── agents/                       # Persistent agent memory
    └── {name}/
        ├── memory.md
        └── {name}-NNN.md
```

### Run ID Format

Format: `{YYYYMMDD}-{HHMMSS}-{random6}`

Example: `20260317-143052-a7b3c9`

---

## The Execution Algorithm

### Step 1: Read the Manifest

Read `.prose/runs/{id}/manifest.md`. Extract:

- **Caller Interface** — what inputs the program needs, what it returns
- **Graph** — each service with its source file, workspace path, inputs (with `←` mappings), and outputs
- **Execution Order** — the sequence (with parallelization notes)
- **Warnings** — present to the user before executing

### Step 2: Bind Caller Inputs

The manifest's Caller Interface lists what the program requires. Bind these values:

| Source                                                           | Behavior                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| CLI arguments (`prose run program.md --question "..."`)          | Bind immediately                                      |
| Config file (`.prose/.env` or program-level config)              | Bind immediately                                      |
| Pre-supplied by calling program (if this is a nested invocation) | Bind immediately                                      |
| No value available                                               | Pause execution, prompt user via `ask_user` |

Write each bound input to `bindings/caller/{name}.md`:

```markdown
# question

kind: input
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

1. **The service's source file** — read `services/{service-name}.md` and include its full content as the service definition
2. **Input file paths** — list each input with its binding path
3. **Workspace path** — where the service should write ALL its work
4. **Output instructions** — which files in the workspace are declared `### Ensures` outputs

The session prompt follows this structure:

```
You are executing a Prose service component.

## Your Service Definition

{contents of services/{service-name}.md}

## Your Inputs

Read these files for your input data:
- {input-name}: {bindings-path}
- {input-name}: {bindings-path}

## Your Workspace

Write all your work to: .prose/runs/{id}/workspace/{service-name}/

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
2. For each declared output, copies from workspace to bindings:
   - `workspace/{service-name}/{output-name}.md` → `bindings/{service-name}/{output-name}.md`
3. Appends a completion marker to `state.md`
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

#### 4e. Enforce Composite Constraints

After composite expansion, the manifest may contain a `## Constraints` section listing runtime constraints derived from composite invariants. When present, you enforce them during execution:

| Constraint Type          | Enforcement                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Information firewall** | When passing data between services that have a firewall constraint, strip internal reasoning and intermediate state before copying output to bindings. The downstream service receives only the declared `### Ensures` outputs — no reasoning chains, no scratch work, no internal state. |
| **Termination bound**    | Count iterations in loop-based delegation patterns. If the iteration count reaches the ceiling (e.g., `max_rounds`), terminate the loop regardless of the critic's verdict and return the last output. Log: `N→ {service} ⊘ terminated (max_rounds)`                                  |
| **Monotonicity**         | For ratchet-type composites, maintain a certified-progress ledger. Each iteration's certified output must be a superset of the previous iteration's. If an iteration would shrink the certified set, discard it and keep the prior state.                                             |
| **Error propagation**    | If a slot service writes `__error.md` during a composite loop, terminate the composite immediately. Propagate the error as if the composed unit itself errored. Do not retry or continue the loop.                                                                                    |

Constraints are checked at every service boundary within the expanded composite — not just at the final output. If a constraint is violated, log the violation to `state.md` and continue with the corrected state (e.g., the stripped output, the terminated loop, the preserved ledger).

### Step 5: Collect Program Output

After all services complete, the program's ensured outputs are in `bindings/`. The manifest's Caller Interface specifies which service produces the final output:

```
returns:
- report (from synthesizer): a critically evaluated research report
```

Read `bindings/synthesizer/report.md` and return it to the caller.

### Step 6: Finalize

- Append `---end {ISO8601 timestamp}` to `state.md`
- If this is a top-level run (not nested), present the final output to the user

---

## State Management

### `state.md` — Append-Only Execution Log

The VM appends one line per event. Only the VM writes this file.

```markdown
# run:20260317-143052-a7b3c9 deep-research

upstream: [20260317-120000-f4e5d6] # present when run-typed inputs exist
program: deep-research

1→ [input] question ✓
2→ researcher ✓
3→ critic ✓
4→ synthesizer ✓
---end 2026-03-17T14:35:22Z
```

The header is the block between the `#` heading and the first event marker:

```
# run:{id} {program-name}
upstream: [{comma-separated run IDs}]    # optional, present when run has run-typed inputs
program: {program path or name}          # always present

{event markers follow}
```

The `upstream:` field lists the run IDs of all `run`-typed inputs, written once at binding time (Step 2). On resumption, the VM reads it as context but does not re-process it. The `upstream:` field is omitted when a run has no `run`-typed inputs. The `program:` field is always present.

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
| `---end TIMESTAMP`                       | Program completed successfully                |
| `---error TIMESTAMP msg`                 | Program failed                                |

**ASCII fallback:** Both `→` and `->` are valid in event markers. Models may emit either form. Parsers and inspectors should accept both.

#### Resumption

To resume an interrupted run:

1. Read `state.md` — find the last completed marker
2. Scan `bindings/` — confirm existing outputs
3. Continue from the next service in execution order

---

## Error Handling

When a service signals an error (writes `__error.md` to its workspace):

### Step 1: Read the Error

Read `workspace/{service-name}/__error.md` to get the error name and details.

### Step 2: Check Caller's Contract

Look at the program entry point's `### Ensures` for conditional clauses:

```markdown
### Ensures

- `report`: a critically evaluated research report
- if research is unavailable: partial report with explanation
```

If a conditional clause covers this error, the VM can satisfy the degraded `### Ensures` clause instead.

### Step 3: Check Downstream Impact

If the errored service has downstream dependents (services that require its outputs), those services cannot run. Options:

1. **Conditional `### Ensures` covers it** — produce the degraded output, skip dependents, return
2. **No coverage** — propagate the error. Append `---error` to `state.md`. Return the error to the caller.

### Step 4: Log

Append the error marker to `state.md`:

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

The execution block uses ProseScript. Within it, the full imperative grammar is available: `parallel:`, `loop until`, `for each`, `try/catch`, `if/elif/else`, `choice`, `block`, `do`, `repeat`, and persistent `agent` definitions. See `prosescript.md` for the canonical syntax.

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

1. Its service definition (the full `.md` content from `services/`)
2. File paths to its inputs (in `bindings/`)
3. Its workspace path
4. Instructions on which output files to write
5. Shape constraints (if any)
6. Error signaling format

The subagent does NOT receive:

- The global manifest
- Other services' definitions
- The dependency graph
- The program entry point

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

The VM copies declared outputs from workspace to bindings, appends to `state.md`, and continues.

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

Runtime delegation appends these markers to `state.md`:

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
| Execution (default) | `### Runtime` with `persist: true`    | `.prose/runs/{id}/agents/{name}/` | Dies with run            |
| Project             | `### Runtime` with `persist: project` | `.prose/agents/{name}/`           | Survives runs in project |
| User                | `### Runtime` with `persist: user`    | `~/.prose/agents/{name}/`         | Survives across projects |

Pick `persist: project` or `persist: user` whenever the service's contract references prior-run state — cumulative counts, watermarks, deltas, or any field whose value depends on what happened before. `persist: true` alone is *not* enough for that: its memory lives only for the duration of the current run and is discarded when the run ends.

### Invocation

When spawning a persistent agent's session, include its memory file path in the prompt:

```
Your memory is at:
  .prose/runs/{id}/agents/{name}/memory.md

Read it first to understand your prior context. When done, update it
with your compacted state following the guidelines in primitives/session.md.

Also write your segment record to:
  .prose/runs/{id}/agents/{name}/{name}-NNN.md
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

The manifest's Caller Interface specifies what the program requires from the user.

### Binding Inputs

At program start, the VM resolves each `requires` entry:

| Scenario                                              | Behavior                                            |
| ----------------------------------------------------- | --------------------------------------------------- |
| Value provided via CLI arg (`--question "..."`)       | Bind immediately                                    |
| Value provided via config file                        | Bind immediately                                    |
| Value provided by calling program (nested invocation) | Bind immediately                                    |
| No value available                                    | Prompt user via `ask_user`, bind response           |

### Writing Input Bindings

Write each input to `bindings/caller/{name}.md`:

```markdown
# {name}

kind: input
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

1. **Existence.** The referenced run directory exists under `.prose/runs/`. For resolution rules, see Run ID Resolution below.
2. **Structure.** The directory contains at minimum `state.md` and `program.md`.
3. **Completion status:**
   - `state.md` has `---end` → the run completed successfully. Bind normally.
   - `state.md` has `---error` → the run failed. Emit a warning but allow binding (failed runs are consumable — an inspector may specifically want to evaluate a failed run).
   - `state.md` has neither → the run is incomplete. Error: cannot consume an in-progress run.

The VM writes the binding to `bindings/caller/{name}.md` with structured metadata:

```markdown
# subject

kind: input
source: caller
type: run

---

run: 20260406-201439-1a3369
path: .prose/runs/20260406-201439-1a3369
program: customer-discovery
status: complete
```

#### Multiple Runs (`run[]`)

For fan-in, the caller provides comma-separated run IDs:

```text
prose run std/evals/calibrator -- runs: 20260406-201439-1a3369,20260406-202015-c5d6e7,20260406-203300-8f9a0b
```

The VM validates each run independently (same rules as single `run`). It writes a single binding listing all references:

```markdown
# runs

kind: input
source: caller
type: run[]

---

- run: 20260406-201439-1a3369
  path: .prose/runs/20260406-201439-1a3369
  program: customer-discovery
  status: complete

- run: 20260406-202015-c5d6e7
  path: .prose/runs/20260406-202015-c5d6e7
  program: competitive-landscape
  status: complete

- run: 20260406-203300-8f9a0b
  path: .prose/runs/20260406-203300-8f9a0b
  program: grant-radar
  status: complete
```

#### Staleness Detection

When binding a `run` input, the VM compares the run's `program.md` snapshot against the current source file on disk. If they differ semantically (a whitespace change is not staleness; a changed `ensures` clause is), the VM emits a warning:

```
[Warning] Stale run: 20260406-201439-1a3369
  Program 'customer-discovery' has changed since this run.
```

Staleness is informational, not blocking. The caller decides whether to re-run or proceed.

#### Run ID Resolution

Run IDs default to local `.prose/runs/`. For cross-project references:

| Format                             | Resolves to                                                       |
| ---------------------------------- | ----------------------------------------------------------------- |
| Bare ID (`20260406-201439-1a3369`) | `.prose/runs/20260406-201439-1a3369` (local project)              |
| `~/{id}`                           | `~/.prose/runs/{id}` (user scope)                                 |
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
- If an environment variable is not set, the VM fails the service with a clear error rather than proceeding with an empty value. The error is logged to `state.md` as `N→ service-name ✗ missing-env:{VAR_NAME}`.

---

## Executing Tests

When the VM executes a test manifest (produced by Forme for a `kind: test` component — see `forme.md`, Handling Test Components):

1. **Bind fixtures** — same as binding caller inputs, but from `### Fixtures` in the manifest. Never prompt the user — tests are fully self-contained.
2. **Execute the subject** — run the service or program exactly as normal (spawn sessions, copy outputs, etc.). The subject does not know it is under test.
3. **Evaluate assertions** — after execution completes, evaluate each `### Expects` and `### Expects Not` clause against the actual outputs in `bindings/`. This uses the same mechanism as "Evaluating Ensures" — it is an intelligent judgment call by the VM, not string matching. Read the output, read the assertion, determine if the commitment is met.
4. **Produce test report** — instead of returning output to the caller, produce a structured report:

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

5. **State markers** — test runs use standard `state.md` markers for execution, plus `N→ [eval] assertion ✓` or `✗` for each assertion, and `---test PASS` or `---test FAIL (N/M assertions)` at the end.
6. **Exit behavior** — `prose test` returns exit code 0 if all assertions pass, 1 if any fail. When running a directory of tests, all tests run (no early exit), and a summary is printed at the end.

### Test Suites

When `prose test tests/` is given a directory:

1. Find all `.md` files with `kind: test` in the directory (non-recursive by default, `--recursive` for deep scan)
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

## Single-Component Programs

For programs without a `services` list (no Forme phase):

1. The `.md` file IS the program and the sole service
2. No manifest needed—read the file directly
3. Bind caller inputs from `### Requires`
4. Spawn one session with the file as the service definition
5. The session writes to `workspace/` and the VM copies `### Ensures` outputs to `bindings/`
6. Return the output

This is the simplest execution path. It is equivalent to a ProseScript file with one `session` call.

---

## Composites

A composite defines how agents interact without specifying which agents fill the roles. By the time you execute, composites are gone — Forme has expanded them into concrete delegation steps and constraints in the manifest. For composite authoring syntax and expansion mechanics, see `forme.md`, Composite Expansion.

### Composite Contract Sections

A composite file declares its topology with Contract Markdown sections. Understanding these sections clarifies where the manifest constraints you enforce come from:

| Section | Purpose |
|---------|---------|
| `### Slots` | Services the composite requires; each slot has a name and a contract |
| `### Config` | Composite-level parameters and defaults |
| `### Invariants` | Guarantees that Forme encodes and the VM enforces at runtime |
| `### Delegation` | ProseScript or pseudocode for how the slots interact |

### Instantiation

Authors instantiate composites with explicit slot-filling: a service declaration
uses `compose:` and a `with:` block that names each slot and config parameter.
For instantiation syntax, see `forme.md`, Composite Expansion. No shorthand
composite syntax is accepted at runtime.

Composites nest — a slot can be filled by another composite instantiation. Expansion proceeds inside-out. Recursive composites are prohibited. For nesting examples, see `forme.md`, Composite Expansion.

### Composites in the Manifest

After expansion, the composed unit appears as a graph entry with delegation sub-entries and config. The manifest's `## Constraints` section lists one subsection per expanded composite, containing information firewalls, termination bounds, monotonicity ratchets, and exhaustion behavior derived from the composite's `invariants`. You enforce these constraints during execution — see Step 4e above.

---

## ProseScript `.prose` Programs

When `prose run` is invoked with a `.prose` file:

- Skip Phase 1 (no Forme wiring)
- Execute using ProseScript semantics (`prosescript.md`)
- All historical `.prose` constructs work unchanged

This keeps the old scripting language useful while giving it a clearer role: standalone orchestration, and the imperative language inside `### Execution` blocks.

---

## Complete Execution Algorithm

```
function execute(manifest, inputs?):
  1. Read manifest — extract caller interface, graph, execution order
  2. Bind caller inputs:
     - From CLI args, config, or calling program
     - For run-typed inputs (run / run[]): validate existence, structure, completion; emit staleness warning if source program changed
     - Prompt user (`ask_user`) for any missing required inputs
     - Write each to bindings/caller/{name}.md (structured metadata for run types)
     - Record upstream: field in state.md header for any run-typed inputs
  3. Create workspace/ and bindings/ directories for each service
  4. Initialize state.md with run header (program: field always; upstream: field if run-typed inputs were bound)
  5. For each service in execution order:
     a. Verify all input bindings exist (dependencies satisfied)
     b. Build session prompt:
        - Service definition (from services/{name}.md)
        - Input file paths (from bindings/)
        - Workspace path
        - Output instructions (ensures outputs to write)
        - Shape constraints (prohibited, self, delegates)
        - Error signaling format
     c. Spawn session via `spawn_session`
        - If multiple services have no mutual dependencies, spawn in parallel
     d. Receive response:
        - If Delegate: lines → runtime delegation:
          i.  Spawn each delegate as a new session
          ii. Wait for all delegates to complete
          iii. Write delegate outputs to workspace/{name}/__delegate/
          iv. Resume the service with response paths
          v.  Append ⇒, ✓, ⟳ markers to state.md
          vi. Loop back to (d)
        - If completion → continue
     e. Check for __error.md:
        - If error: check conditional ensures, handle or propagate
     f. Enforce composite constraints (firewalls, termination bounds, monotonicity)
     g. Copy declared outputs: workspace/{name}/ → bindings/{name}/
     h. Append completion marker to state.md
  6. Collect final output from bindings/ per manifest's returns
  7. Evaluate invariants across all services
  8. Append ---end to state.md
  9. Return final output to caller
```

---

## Summary

The OpenProse VM:

1. **Reads** the manifest produced by Forme
2. **Binds** caller inputs (from CLI, config, or user prompt)
3. **Walks** the execution order from the dependency graph
4. **Spawns** one session per service via `spawn_session`
5. **Passes** input data as filesystem pointers (never values)
6. **Copies** declared outputs from workspace to bindings (the return mechanism)
7. **Handles** errors via conditional ensures or propagation
8. **Evaluates** contracts, strategies, and invariants intelligently
9. **Parallelizes** independent services when the graph allows
10. **Tracks** state in an append-only log (`state.md`)
11. **Returns** the program's ensures output to the caller

Each subagent only knows its own service definition, its inputs, and where to write. The global picture exists only in the manifest and the VM's working memory. This keeps sessions focused and context lean.

The language is self-evident by design. When in doubt about a contract, interpret it as natural language with the intent to fulfill the author's commitment.
