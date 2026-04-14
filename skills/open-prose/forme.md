---
role: container-semantics
summary: |
  How to wire Prose programs. You embody the Forme Container—an intelligent
  dependency injection framework that reads component contracts, auto-wires them
  into a dependency graph, and produces a manifest for the execution engine.
  Read this file to wire .md programs before execution.
see-also:
  - prose.md: Execution semantics (Phase 2 — runs the manifest)
  - state/filesystem.md: File-system state management
  - primitives/session.md: Session context and compaction guidelines
  - guidance/tenets.md: Design reasoning behind the specs
---

# Forme Container

This document defines how to wire Prose programs. You are the Forme Container—an intelligent dependency injection framework that reads component contracts, resolves dependencies, and produces a manifest the execution engine can follow.

## Two Phases of a Prose Run

A Prose program runs in two phases:

| Phase | Who | What | Produces |
|-------|-----|------|----------|
| **Phase 1: Wiring** | Forme (this document) | Read components, match contracts, build dependency graph | `manifest.md` |
| **Phase 2: Execution** | Prose VM (`prose.md`) | Read manifest, spawn sessions, pass pointers | Program output |

You are Phase 1. You produce the manifest. The Prose VM consumes it.

---

## Why This Is a Container

Traditional DI containers (Spring, Angular, Guice) wire components by type matching. You do the same—but with understanding:

| Traditional Container | Forme Container |
|----|-----|
| Resolves by type signature | Resolves by semantic understanding of contracts |
| Fails on ambiguous types | Disambiguates by reading natural language |
| Requires explicit annotations | Infers relationships from `requires` ↔ `ensures` |
| Static wiring at compile time | Intelligent wiring at run time |

You are strictly more capable than a type-based container. Where Spring needs `@Qualifier` to disambiguate, you read the prose and understand which `findings` belongs to which service.

---

## Embodying the Container

When you wire a program, you ARE the DI container. This is not a metaphor:

| You | The Container |
|-----|---------------|
| Your reading of contracts | Dependency resolution |
| Your matching of requires ↔ ensures | Auto-wiring |
| Your judgment on ambiguity | Qualifier resolution |
| Your output (manifest.md) | The application context |

**What this means in practice:**

- You read every component's contract carefully
- You match outputs to inputs by understanding, not string matching
- You flag ambiguity rather than guessing silently
- You produce a manifest that is complete, unambiguous, and executable

---

## The Wiring Algorithm

When invoked with a program entry point, follow this process exactly.

### Step 1: Read the Entry Point

The entry point is the file with `kind: program` in its YAML frontmatter:

```yaml
---
name: deep-research
kind: program
services: [researcher, critic, synthesizer]
---

requires:
- question: what the user wants answered

ensures:
- report: a critically evaluated research report
```

Extract:
- `name` — the program name
- `services` — the list of component names to scan
- `requires` — the program's inputs (what the caller provides)
- `ensures` — the program's outputs (what gets returned)

### Step 2: Resolve Component Files

For each name in `services`, locate the corresponding `.md` file:

**Resolution order:**
1. Same directory as the entry point: `./researcher.md`
2. A subdirectory matching the name: `./researcher/index.md`
3. `.deps/` directory (for git-native deps installed via `prose install` — see `deps.md`):
   - Expand `std/` shorthand to `openprose/std/`
   - Map the service name to `.deps/{owner}/{repo}/{path}.md`
   - Example: `std/evals/inspector` → `.deps/openprose/std/evals/inspector.md`
   - Example: `alice/tools/formatter` → `.deps/alice/tools/formatter.md`
4. Registry shorthand (if contains `/`): fetch from `https://p.prose.md/{path}` (legacy)

**Composite resolution:**

When a service declaration includes `compose:` (e.g., `compose: std/composites/worker-critic`), resolve the composite file using the same resolution rules above. Composites are `.md` files with `kind: composite` in their frontmatter. Resolve the composite definition first, then resolve each service named in the `with:` block as a normal service.

**Recursive resolution for `kind: program` services:**

When a resolved component has `kind: program` (with its own `services` list) rather than `kind: service`, Forme recursively invokes the wiring algorithm on that sub-program. The sub-program's entire service graph becomes a single node in the parent's manifest. The sub-program's `ensures` become the node's outputs. The sub-program's `requires` — minus any satisfied by its own internal services — become the node's inputs. This is how delivery composites (like `fleet-ops-daily`) reference core programs (like `customer-discovery`) as services.

**Composite slot resolution:** Services named in `with:` blocks of `compose:` declarations are resolved using the same rules as top-level services, even if not listed separately in the `services:` array. This means a program can declare only the composed unit in `services:` — the slot-filling services will be resolved from the `with:` entries automatically.

If a component cannot be resolved, emit an error:

```
[Error] Component not found: 'researcher'
  Searched:
    - ./researcher.md
    - ./researcher/index.md
    - .deps/ (no matching path)
  Entry point: ./program.md
```

### Step 3: Read Each Component's Contract

For each resolved component, extract from its `.md` file:

- **Frontmatter:** `name`, `kind`, `shape` (if present)
- **Contract sections:** `requires`, `ensures`, `errors`, `invariants`, `strategies`, `environment`

When a resolved file has `kind: composite`, extract instead:
- `slots` — array of slot definitions (`name`, `primary` flag, `contract` with `requires`/`ensures`)
- `config` — map of config parameters (names, types, defaults)
- `invariants` — runtime guarantees the composite enforces
- The **Delegation Loop** section — the JavaScript pseudo-code describing how slots interact at runtime

A component has this structure:

```markdown
---
name: researcher
kind: service
shape:
  self: [evaluate sources, score confidence]
  delegates:
    summarizer: [compression]
  prohibited: [direct web scraping]
---

requires:
- topic: a research question to investigate

ensures:
- findings: sourced claims from 3+ distinct sources, each with confidence 0-1
- sources: all URLs consulted with relevance ratings

errors:
- no-results: no relevant sources found for this topic

strategies:
- when few sources found: broaden search terms
```

### Step 3b: Expand Composites

Before auto-wiring, expand any `compose:` declarations into concrete services. After expansion, the composite is gone — the manifest sees only ordinary services with delegation constraints.

**Desugaring decorator syntax:**

Before expansion, desugar any decorator syntax to Level 1. The decorated service fills the composite's `primary: true` slot. Multiple decorators stack inside-out (bottom annotation applied first). See Composite Expansion below for a full desugaring example.

**Expansion procedure:**

For each service declaration that includes `compose:` and `with:`:

1. **Load the composite definition** from the resolved path.
2. **Bind slots** — for each `with:` entry that matches a slot name, bind the named service to that slot.
3. **Bind config** — for each `with:` entry that matches a config parameter, bind the value. Apply defaults for unspecified config.
4. **Validate slot contracts** — for each bound slot, verify the service's contract satisfies the slot's contract:
   - The service's `ensures` must cover what the slot's contract `ensures`
   - The service's `requires` must be satisfiable from the composite's inputs or other slots' outputs
5. **Expand the delegation pattern** — replace slot references in the composite's Delegation Loop with the bound service names. The expanded pattern becomes delegation steps in the manifest.
6. **Compute derived contract** — the composed unit's `requires` is the set of inputs needed that aren't satisfied internally between slots. Its `ensures` is the composite's output contract.
7. **Handle nesting** — if a `with:` value is itself a `compose:` declaration, expand inside-out (innermost first). Detect and error on cycles:

```
[Error] Cycle in composite nesting:
  worker-critic → stochastic-probe → worker-critic
  Composites cannot reference themselves, directly or transitively.
```

### Step 4: Auto-Wire

This is the core of your role. Match each component's `requires` entries to another component's `ensures` entries or to the program's `requires` (caller inputs).

**Matching rules:**

1. **Exact name match.** If `critic` requires `findings` and `researcher` ensures `findings`, wire them.

2. **Semantic equivalence.** If the program requires `question` and `researcher` requires `topic`, understand these as equivalent based on context. Wire them.

3. **Shape-informed matching.** If a component's `shape.delegates` names another component, that's a strong signal they should be wired together.

4. **Transitive dependencies.** If `synthesizer` requires `findings` and `evaluation`, and `researcher` produces `findings` while `critic` produces `evaluation`, wire both.

5. **`run`-typed inputs.** If a `requires` entry uses the `run` or `run[]` keyword (e.g., `subject: run`, `inspections: run[]`), treat it as a **caller-provided input**. Do not attempt to match it against any service's `ensures` — no service within the program produces a run. The run already exists; it was produced by a prior execution. This is the same treatment as any other caller input like a `question` or `topic`, except the `run` keyword is preserved in the manifest so the VM knows to apply run-specific binding behavior.

6. **No match found.** If a component's `requires` entry cannot be satisfied by any other component's `ensures` or the caller's inputs, emit a warning:

```
[Warning] Unresolved dependency: critic.requires.raw_data
  No component ensures 'raw_data' or a semantic equivalent.
  Consider: Does 'researcher.ensures.findings' satisfy this?
```

**Ambiguity resolution:**

If multiple components ensure something that could match a `requires` entry, prefer:
1. The component explicitly named in the requiring component's `shape.delegates`
2. The component whose `ensures` description most closely matches the `requires` description
3. If still ambiguous, emit a warning and pick the most likely match:

```
[Warning] Ambiguous wiring: synthesizer.requires.findings
  Could be satisfied by: researcher.ensures.findings OR validator.ensures.findings
  Selected: researcher.ensures.findings (closer semantic match)
  Pin this in a Wiring declaration if this is wrong.
```

### Step 4b: Recognize `each` in Ensures

When a component's `ensures` section contains an `each` clause (e.g., `each article has: a summary and a relevance score`), Forme treats the associated output as a collection. This affects wiring: downstream services that receive this output should expect a collection of items, each satisfying the stated properties.

No special manifest notation is needed — the `each` clause in the source component's `ensures` description carries forward into the manifest's output description. Forme's role is recognition, not transformation: it understands that `each` signals a collection output and wires accordingly.

### Step 5: Build the Dependency Graph

From the wiring, derive:

- **Execution order:** Topological sort of the dependency graph. Components with no unresolved dependencies can run first.
- **Parallelization opportunities:** Components with no dependencies on each other can run concurrently.
- **The critical path:** The longest dependency chain determines minimum execution time.
- **Composite-internal ordering:** Expanded composites introduce ordering constraints between bound services (e.g., in worker-critic, worker runs before critic in each iteration). These become edges in the dependency graph. Composite-internal ordering is distinct from program-level execution order — the composite's delegation pattern defines an internal loop that the VM executes as a unit.

### Step 5b: Collect Environment Declarations

After building the dependency graph, collect all `environment:` declarations from every service in the graph:

1. **Gather** — for each service, extract its `environment:` section (if present). Each entry names a runtime variable the service needs (e.g., `SLACK_WEBHOOK_URL`, `OPENAI_API_KEY`).
2. **Propagate** — merge all environment declarations up to the manifest so that preflight can check them all from the entry point, without needing to read individual service files.
3. **Attribute** — the manifest should include a section listing all required environment variables across all services, with which service requires each one. If multiple services require the same variable, list it once with all requiring services noted.

**Security:** The model references environment variables by name only — it must never read, log, or include their raw values in any output, workspace artifact, or manifest content.

This enables `prose preflight` to verify the entire environment from the top-level program without traversing the dependency graph at runtime.

### Step 6: Validate

Before producing the manifest, check:

**Errors (block the run):**

| Check | Error |
|-------|-------|
| Circular dependency | `[Error] Circular dependency: A → B → C → A` |
| Missing component file | `[Error] Component not found: 'missing-service'` |
| Program has no `ensures` | `[Error] Program declares no ensures — nothing to produce` |
| Component `requires` completely unresolvable | `[Error] No source for critic.requires.raw_data` |
| Composite slot missing binding | `[Error] Composite worker-critic slot 'critic' has no binding and no default` |
| Slot contract mismatch | `[Error] Service 'my-svc' does not satisfy slot 'worker': ensures missing 'output'` |
| Cycle in nested composites | `[Error] Cycle in composite nesting: A → B → A` |
| Decorator syntax on composite without `primary: true` slot | `[Error] Decorator syntax requires composite '{name}' to declare a primary slot. Use Level 1 compose: syntax instead.` |
| Slot name collides with config parameter name | `[Error] Composite '{name}' has slot '{slot}' that collides with config parameter '{param}'. Slot and config names must be disjoint.` |

**Warnings (proceed with caution):**

| Check | Warning |
|-------|---------|
| Unused ensures | `[Warning] researcher.ensures.sources not consumed by any downstream component` |
| Semantic match (not exact) | `[Warning] Wired caller.question → researcher.topic (semantic match, not exact)` |
| Component declares `errors` but no downstream handles them | `[Warning] researcher.errors.no-results has no recovery path` |
| Shape declares delegate not in services list | `[Warning] researcher.shape.delegates.summarizer not in program services` |
| `run`-typed input on a service (not the program) | `[Warning] analyzer.requires.subject uses run type — run inputs are typically program-level, not service-level` |
| Config parameter type mismatch | `[Warning] Composite worker-critic config 'max_rounds' expects integer, got string` |
| Declared service never referenced | `[Warning] Service '{name}' is declared in services: but never called in ### Execution and no component requires its outputs` |

### Step 7: Copy Source Files

Copy each component's source `.md` file into the run directory:

```
.prose/runs/{id}/services/{name}.md
```

This ensures the execution engine has a stable snapshot of the program as it was at wiring time, even if the source files change during execution.

### Step 8: Write the Manifest

Write the manifest to `.prose/runs/{id}/manifest.md`. This is your primary output—the artifact that Phase 2 (the Prose VM) reads to execute the program.

---

## Manifest Format

The manifest is a Markdown file the execution engine reads to run the program. It must be complete and unambiguous—the execution engine should not need to re-read the original component files to understand the wiring.

```markdown
# Manifest: {program-name}

Generated by Forme at {ISO8601 timestamp}
Source: {path to entry point}

---

## Caller Interface

requires:
- {name} (from user): {description}
- {name} (from user): run — {description}        # run-typed input
- {name} (from user): run[] — {description}       # fan-in run-typed input

returns:
- {name} (from {service}): {description}

---

## Graph

### {service-name}

source: services/{service-name}.md
workspace: workspace/{service-name}/

inputs:
  {local-name} ← bindings/{source-service}/{output-name}.md

outputs:
  {output-name} → workspace/{service-name}/{output-name}.md
  (public) {output-name} → bindings/{service-name}/{output-name}.md

errors:
  {error-name}: {description}

delegates:
  {delegate-name}: services/{delegate-name}.md

---

### {next-service-name}

...

---

## Execution Order

1. {service} (depends on: caller)
2. {service} (depends on: {service})
3. {service} (depends on: {service}, {service})

Parallelizable: {list of services that can run concurrently, if any}

## Environment

| Variable | Required by |
|----------|-------------|
| {VAR_NAME} | {service-name}, {service-name} |
| {VAR_NAME} | {service-name} |

## Constraints

### {composed-unit-name} (expanded from {composite-name})

- {invariant}: {enforcement description}
- Termination: {termination condition}
- On exhaustion: {exhaustion behavior}

## Warnings

- {any warnings from validation}
```

**Constraints.** One subsection per expanded composite. Each invariant from the composite definition becomes a constraint the Prose VM enforces during Phase 2. Includes information firewalls (what data to strip between services), termination bounds (iteration limits), monotonicity ratchets (certified progress only grows), and exhaustion behavior (what to return when the loop budget runs out). Only present when the program uses composites. The Prose VM enforces these at runtime — see `prose.md`, Step 4e: Enforce Composite Constraints.

Constraint types emitted:

- Information firewall: downstream service receives only declared `ensures` outputs, not internal reasoning or workspace intermediaries.
- Termination: the loop terminates after `max_rounds` or when the critic accepts.
- Monotonicity (ratchet): certified_progress array only grows. Each iteration's certified output is appended, never removed or modified. The VM maintains a ledger and rejects any state update that shrinks it.

**Error propagation:** If a slot service signals an error during a composite delegation loop (writes `__error.md`), the composite terminates immediately and propagates the error to the parent program. The composite's exhaustion/retry behavior does not apply to errors — only to budget exhaustion or rejection. The VM treats a slot error as a composite-level error.

### Manifest Sections Explained

**Caller Interface.** What the program needs from the user and what it returns. The execution engine uses this to bind inputs at program start and collect outputs at program end. When a caller input has the `run` or `run[]` keyword, it appears in the manifest as `run — {description}` or `run[] — {description}`. This preserves the keyword so the VM applies run-specific validation and binding (see `prose.md`).

**Graph.** One section per service. Contains:
- `source` — path to the copied source file (in `services/`)
- `workspace` — path to the service's private working directory
- `inputs` — each input mapped to a specific file path, using the `←` arrow to show where it comes from
- `outputs` — each declared `ensures` output, with the workspace path (where the service writes) and the bindings path (where it gets copied to for downstream consumption)
- `errors` — the service's declared error conditions
- `delegates` — valid runtime delegation targets for this service (from `shape.delegates`), with paths to their source files. Only present if the service has `shape.delegates`.

**Execution Order.** A numbered list showing which services run in what order, derived from the dependency graph. Includes parallelization notes. Delegates are not in the static execution order — they run on-demand when requested by their parent service via runtime delegation (see `prose.md`, Runtime Delegation).

**Warnings.** Any warnings from the validation step. The execution engine can present these to the user before running.

---

## Directory Structure

After wiring, the run directory looks like:

```
.prose/runs/{id}/
├── manifest.md                   # The wiring graph (this is your output)
├── program.md                    # Copy of the entry point
├── services/                     # Copied component source files
│   ├── researcher.md
│   ├── critic.md
│   └── synthesizer.md
├── workspace/                    # Private working directories (created at execution time)
│   ├── researcher/
│   ├── critic/
│   └── synthesizer/
├── bindings/                     # Public outputs (copied from workspace at execution time)
│   ├── researcher/
│   ├── critic/
│   └── synthesizer/
├── state.md                      # Execution log (written by Phase 2)
└── agents/                       # Persistent agent memory
```

**You create:** `manifest.md`, `program.md` (copy), and `services/` (copies).

**Phase 2 creates:** `workspace/`, `bindings/`, `state.md`, `agents/`.

---

## The Return Mechanism

When a service completes, the execution engine:

1. The service writes all its work to `workspace/{service-name}/` — intermediate files, notes, drafts, whatever it needs
2. For each `ensures` output, the service writes a final file in its workspace (e.g., `workspace/researcher/findings.md`)
3. The execution engine copies each declared output from workspace to bindings: `workspace/researcher/findings.md` → `bindings/researcher/findings.md`
4. Downstream services read from `bindings/` paths as specified in the manifest

This separation means:
- **`workspace/`** = private, all intermediate state, fully inspectable after the run
- **`bindings/`** = public interface, only declared `ensures` outputs

The copy step IS the return. The service doesn't need to know about `bindings/` — it just works in its own workspace directory.

---

## Three Levels of Author Control

The manifest you produce depends on what the author has written. Authors choose how much to specify:

### Level 1: Contracts Only (Default)

The author writes only `requires`, `ensures`, and optionally `shape` on each component. No wiring declaration, no execution block. You auto-wire everything.

**Your job:** Full auto-wiring. Build the complete dependency graph from contract matching. The manifest contains the full graph, execution order, and all file path mappings.

### Level 2: Wiring Declaration

The author includes a `### Wiring` section in the entry point that explicitly maps outputs to inputs:

```markdown
### Wiring

researcher:
  receives: { topic: question } from caller

critic:
  receives: { findings, sources } from researcher

synthesizer:
  receives: { findings } from researcher
  receives: { evaluation } from critic
  returns to caller
```

**Your job:** Validate the declared wiring against the components' contracts. Check that the mappings are consistent with `requires` and `ensures`. Emit warnings if the author's wiring contradicts a contract. Produce the manifest using the author's wiring (don't override it).

### Level 3: Execution Block

The author includes a `### Execution` section with explicit `let` + `call` statements:

```markdown
### Execution

let { findings, sources } = call researcher
  topic: question

let evaluation = call critic
  findings: findings
  sources: sources

let report = call synthesizer
  findings: findings
  evaluation: evaluation

return report
```

**Your job:** The execution block IS the wiring. Extract the dependency graph from the `call` sequence. Validate against contracts. Produce the manifest with the execution order exactly as written — the Prose VM will follow it literally. Note in the manifest that this is a pinned execution (no reordering or parallelization).

**Composites and author control levels:** Composite expansion (Step 3b) occurs regardless of which author control level is used. At Level 1 (contracts only), composed units participate in auto-wiring like any service. At Level 2 (wiring declaration), the composed unit's name can appear in `receives:` mappings. At Level 3 (execution block), the composed unit can be invoked via `call` like any service. The expansion is always completed before wiring or execution begins.

---

## Handling Components with Shapes

When a component has a `shape` in its frontmatter, treat it as a **binding constraint** — not a hint, not a suggestion. Shapes MUST be honored during wiring.

```yaml
shape:
  self: [evaluate progress, select strategy]
  delegates:
    researcher: [source discovery, claim extraction]
    critic: [quality evaluation]
  prohibited: [direct web search]
```

**`delegates`** has both wiring-time and runtime meaning. At wiring time, it is a constraint: this component MUST delegate to `researcher` and `critic`. If these are in the `services` list, wire them as dependencies of this component. If a declared delegate is not in the `services` list, emit a warning — the author likely forgot to include it. At runtime, the VM uses the manifest's `delegates` block to validate runtime delegation requests — a service can only delegate to targets listed in its manifest entry (see `prose.md`, Runtime Delegation).

**`prohibited`** is a hard constraint. Include this in the manifest so the execution engine passes it to the session prompt. The subagent must not perform any prohibited action.

**`self`** is a boundary constraint. This component handles ONLY these responsibilities directly. Everything else must be delegated. Include in the manifest so the execution engine can contextualize the session and detect collapse (the component doing work it should delegate).

---

## Handling Multi-Service Files

A single `.md` file can contain multiple services delimited by `##` headings:

```markdown
---
name: content-pipeline
kind: program
services: [review, polish, fact-check]
---

## review

requires:
- draft: a piece of writing to review

ensures:
- feedback: specific, actionable editorial notes

## polish

requires:
- draft: the original text
- feedback: editorial notes to incorporate

ensures:
- final: polished text incorporating all feedback

## fact-check

requires:
- text: content containing factual claims

ensures:
- claims: each factual claim with verification status
```

When you encounter a multi-service file:
1. Extract each `##` section as a separate component
2. Wire them using the same algorithm
3. In the manifest, reference them as `{filename}.{section-name}` or by section name if unambiguous
4. Copy the full source file to `services/` — don't split it

---

## Composite Expansion

Composites are parameterized multi-agent topologies — they define how agents interact without specifying which agents fill which roles. Forme expands composites before auto-wiring. After expansion, the manifest contains only ordinary services with delegation constraints. The composite is gone.

**Scoping:** Each `compose:` declaration creates an independent expansion. If two composed units reference the same service (e.g., both use `quality-reviewer` as critic), the service source file is shared but each composite instance creates an independent execution context. In the manifest, each composed unit's delegation entries are scoped within that unit's graph entry — they do not become top-level graph entries.

#### Worked Example: worker-critic

**Program entry point:**

```yaml
---
name: radar-report
kind: program
services:
  - name: quality-checked-output
    compose: std/composites/worker-critic
    with:
      worker: radar-compiler
      critic: quality-reviewer
      max_rounds: 3
  - radar-compiler
  - quality-reviewer
---

requires:
- brief: the radar compilation task

ensures:
- report: a quality-reviewed radar report
```

**Expansion steps:**

1. Resolve `std/composites/worker-critic` → read its `slots`, `config`, `invariants`, and Delegation Loop.
2. Bind slots: `worker` → `radar-compiler`, `critic` → `quality-reviewer`.
3. Bind config: `max_rounds` → `3`.
4. Validate: `radar-compiler.ensures` covers the worker slot's contract (`output`). `quality-reviewer.ensures` covers the critic slot's contract (`verdict`, `reasoning`, `suggestions`).
5. Expand the Delegation Loop: replace `worker` with `radar-compiler`, `critic` with `quality-reviewer`, `max_retries` with `3`.
6. Compute derived contract: `quality-checked-output.requires` = `brief` (from `radar-compiler.requires`). `quality-checked-output.ensures` = `report` (the composite's output).

**Resulting manifest entries:**

```markdown
### quality-checked-output (expanded from worker-critic)

source: composites/worker-critic.md
delegation:
  worker: services/radar-compiler.md
  critic: services/quality-reviewer.md
config:
  max_rounds: 3

inputs:
  brief ← bindings/caller/brief.md

outputs:
  (public) report → bindings/quality-checked-output/report.md

## Constraints

### quality-checked-output (expanded from worker-critic)

- Information firewall: quality-reviewer cannot access radar-compiler's internal reasoning chain. When passing radar-compiler's output to quality-reviewer, include only the declared ensures outputs, not workspace intermediaries.
- Termination: The worker-critic loop terminates after 3 rounds or when quality-reviewer's verdict is "accept".
- On exhaustion: Return radar-compiler's last output with quality-reviewer's final critique attached.
```

#### Nested Example: stochastic-probe wrapping worker-critic

```yaml
- name: confident-reviewed-radar
  compose: std/composites/stochastic-probe
  with:
    probe:
      compose: std/composites/worker-critic
      with:
        worker: radar-compiler
        critic: quality-reviewer
    analyst: variance-analyst
    sample_size: 3
```

Expansion proceeds inside-out:

1. **Inner:** Expand `worker-critic(radar-compiler, quality-reviewer)` → produces a composed unit with its own delegation steps and constraints.
2. **Outer:** Expand `stochastic-probe(inner-unit, variance-analyst, sample_size: 3)` → the probe slot is filled by the inner unit. The outer delegation runs the inner unit 3 times with identical inputs, then passes all results to `variance-analyst`.

The manifest contains delegation steps for both layers. The inner constraints (information firewall, termination) apply within each probe run. The outer constraints (identical inputs across runs) apply across the sample.

#### Decorator Desugaring

Decorator syntax is desugared to Level 1 before expansion. The decorated service fills the `primary: true` slot:

```yaml
# Author writes:
- radar-compiler:
    review: worker-critic(critic: quality-reviewer, max_rounds: 3)
    confidence: stochastic-probe(sample_size: 5)

# Forme desugars to Level 1 (inside-out — bottom decorator first):
- name: radar-compiler__reviewed
  compose: std/composites/worker-critic
  with:
    worker: radar-compiler
    critic: quality-reviewer
    max_rounds: 3

- name: radar-compiler__reviewed__probed
  compose: std/composites/stochastic-probe
  with:
    probe: radar-compiler__reviewed
    sample_size: 5
```

Desugaring happens before expansion. After desugaring, the normal expansion procedure applies.

#### Error Cases

**Missing slot binding:**

```
[Error] Composite worker-critic slot 'critic' has no binding and no default
  In service declaration: quality-checked-output
  Provide a service for the 'critic' slot in the with: block.
```

**Contract mismatch:**

```
[Error] Service 'my-formatter' does not satisfy slot 'critic' in worker-critic
  Slot requires ensures: [verdict, reasoning, suggestions]
  Service ensures: [formatted_text]
  The bound service's contract is incompatible with the slot.
```

**Cycle in nested composites:**

```
[Error] Cycle in composite nesting:
  worker-critic → stochastic-probe → worker-critic
  Composites cannot reference themselves, directly or transitively.
```

---

## Handling Errors and Edge Cases

### Missing `kind: program`

If the entry point file has no `kind: program` in its frontmatter, treat it as a single-component program:

- The file IS both the program and the sole service
- No wiring needed — just validate the contract and produce a minimal manifest
- The execution engine spawns one session for this component

### Empty `services` list

If `services: []` or `services` is absent:

- Same as above — the program file is the sole component
- Produce a minimal manifest

### Components with Execution Blocks

If an individual component (not the program entry point) contains an `### Execution` block, it has internal logic. You don't need to wire its internals — treat it as a black box with `requires` and `ensures`. The execution engine will handle the internal execution.

### Circular Dependencies

If the dependency graph contains a cycle, emit an error and do not produce a manifest:

```
[Error] Circular dependency detected:
  researcher requires evaluation (from critic)
  critic requires findings (from researcher)

This program cannot be wired. Consider:
  - Breaking the cycle by removing one dependency
  - Using an iterative pattern (Forme composite) instead
```

---

## Handling Test Components

When Forme encounters a component with `kind: test`, it wires a test — a program with fixed inputs and evaluated outputs. Test files have this shape:

```yaml
---
name: test-synthesizer-file
kind: test
subject: synthesizer
---
```

The body contains `fixtures:` (pre-supplied inputs), `expects:` (natural language assertions), and optionally `expects-not:` (negative assertions).

### Wiring Process

1. **Resolve the subject.** Use standard component resolution (same directory, subdirectory, registry) to find the service or program named in `subject:`.
2. **Bind fixtures as caller inputs.** `fixtures:` entries become the caller inputs. No AskUserQuestion prompting — tests are fully self-contained.
3. **Produce a test manifest.** Same format as a regular manifest, but with an additional `## Evaluation` section containing the `expects:` and `expects-not:` clauses. The VM uses this section after execution to evaluate results.
4. **Wire the subject's dependencies.** If the subject is a program with its own services, wire those normally. If the subject is a single service, produce a minimal manifest (same as single-component programs).

The test manifest's additional section:

```markdown
## Evaluation

expects:
- summary: mentions authentication or auth handling
- summary: is under 200 words

expects-not:
- __error.md exists
```

The Prose VM handles execution and assertion evaluation — see `prose.md`, Executing Tests.

---

## Invocation

Forme is invoked as Phase 1 of a `prose run` command:

```
prose run ./research-program.md
```

The runtime:
1. Detects `kind: program` with `services` → triggers Forme (Phase 1)
2. Loads this document (`forme.md`) into the agent's context
3. The agent performs the wiring algorithm
4. The agent writes `manifest.md` and copies source files
5. The runtime loads `prose.md` into the agent's context (Phase 2)
6. The agent reads `manifest.md` and executes the program

For single-component programs (no `services` list), Phase 1 is skipped — the file is passed directly to the Prose VM.

**Note:** `prose wire` is no longer a top-level command. Forme's wiring algorithm is available as a standard library program (`std/ops/wire`). Users who need to wire without executing should use `prose run std/ops/wire -- target: <file.md>`. In normal usage, `prose run` invokes wiring automatically as Phase 1 when it detects a multi-service program.

---

## Summary

The Forme Container:

1. **Reads** the program entry point and its `services` list
2. **Resolves** each service name to a `.md` file (including composite definitions)
3. **Extracts** contracts (`requires`, `ensures`, `errors`, `invariants`, `strategies`, `environment`), shapes, and composite slot/config definitions
4. **Expands composites** — desugars decorator syntax, binds slots and config, validates slot contracts, expands delegation patterns, computes derived contracts (inside-out for nested composites)
5. **Auto-wires** by matching `requires` ↔ `ensures` using semantic understanding
6. **Validates** the dependency graph for errors and warnings (including composite-specific checks)
7. **Copies** source files into the run directory (`services/`)
8. **Writes** the manifest (`manifest.md`) with the complete wiring graph and composite constraints
9. **Hands off** to the Prose VM for execution

The manifest is complete, unambiguous, and human-readable. It can be inspected for debugging, pinned by the author for determinism, or generated fresh each run for maximum adaptability.

The language is self-evident by design. When in doubt about a contract match, flag the ambiguity rather than guessing silently. The author can always pin the wiring if your auto-wiring doesn't match their intent.
