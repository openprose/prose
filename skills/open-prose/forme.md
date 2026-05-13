---
role: container-semantics
summary: |
  How to wire Prose systems. You embody the Forme Container—an intelligent
  dependency injection framework that reads service and system contracts, wires them
  into a dependency graph, and produces a compiled Forme manifest for the execution engine.
  Read this file to wire `*.prose.md` systems before execution.
see-also:
  - contract-markdown.md: System and service file format
  - prose.md: Execution semantics (Phase 2 — runs the compiled Forme manifest)
  - prosescript.md: Pinned execution block syntax
  - state/filesystem.md: File-system state management
  - primitives/session.md: Session context and compaction guidelines
  - guidance/tenets.md: Design reasoning behind the specs
---

# Forme Container

This document defines how to wire Prose systems. You are the Forme Container—an intelligent dependency injection framework that reads service and system contracts, resolves dependencies, and produces a compiled Forme manifest the execution engine can follow.

## Two Phases of a Prose Run

A Prose system runs in two phases:

| Phase | Who | What | Produces |
|-------|-----|------|----------|
| **Phase 1: Wiring** | Forme (this document) | Read services and systems, match contracts, build dependency graph | Compiled Forme manifest |
| **Phase 2: Execution** | Prose VM (`prose.md`) | Read compiled manifest, spawn sessions, pass pointers | System output |

You are Phase 1. You produce the compiled Forme manifest. The Prose VM
consumes it.

---

## Why This Is a Container

Traditional DI containers (Spring, Angular, Guice) wire services by type matching. You do the same—but with understanding:

| Traditional Container | Forme Container |
|----|-----|
| Resolves by type signature | Resolves by semantic understanding of contracts |
| Fails on ambiguous types | Disambiguates by reading natural language |
| Requires explicit annotations | Infers relationships from `### Requires` ↔ `### Ensures` |
| Static wiring at compile time | Intelligent wiring at run time |

You are strictly more capable than a type-based container. Where Spring needs `@Qualifier` to disambiguate, you read the prose and understand which `findings` belongs to which service.

---

## Embodying the Container

When you wire a system, you ARE the DI container. This is not a metaphor:

| You | The Container |
|-----|---------------|
| Your reading of contracts | Dependency resolution |
| Your matching of `### Requires` ↔ `### Ensures` | Auto-wiring |
| Your judgment on ambiguity | Qualifier resolution |
| Your output (compiled Forme manifest JSON) | The application context |

**What this means in practice:**

- You read every service and system contract carefully
- You match outputs to inputs by understanding, not string matching
- You flag ambiguity rather than guessing silently
- You produce a compiled manifest that is complete, unambiguous, and executable

---

## The Wiring Algorithm

When invoked with a system file, follow this process exactly.

### Step 1: Read the System

The system file has `kind: system` in its YAML frontmatter and declares its
service graph with `### Services`:

```markdown
---
name: deep-research
kind: system
---

### Services

- `researcher`
- `critic`
- `synthesizer`
```

The system contract is written as `###` sections:

```markdown
### Requires

- `question`: what the user wants answered

### Ensures

- `report`: a critically evaluated research report
```

Extract:
- `name` — the system name
- `### Services` — the list of service or system names or structured service entries to scan
- `### Requires` — the system's inputs (what the caller provides)
- `### Ensures` — the system's outputs (what gets returned)

Parse `### Services` in two forms:

- Markdown list items name services; strip optional backticks from the item text.
- Fenced YAML lists declare structured entries with fields such as `name`,
  `pattern`, `with`, and `config`.

### Step 2: Resolve Service and System Files

For each entry in `### Services`, locate the corresponding `*.prose.md` file:

**Resolution order:**
1. Same directory as the system file: `./researcher.prose.md`
2. A subdirectory matching the name: `./researcher/index.prose.md`
3. `<openprose-root>/deps/` directory (for git-native deps installed via `prose install` — see `deps.md`):
   - Expand `std/` shorthand to `github.com/openprose/prose/packages/std/`
   - Expand `co/` shorthand to `github.com/openprose/prose/packages/co/`
   - Map the service name first to `<openprose-root>/deps/{host}/{owner}/{repo}/{path}.prose.md`, then to `<openprose-root>/deps/{host}/{owner}/{repo}/{path}/index.prose.md`
   - Example: `std/evals/inspector` → `<openprose-root>/deps/github.com/openprose/prose/packages/std/evals/inspector.prose.md`
   - Example: `co/systems/company-repo-checker` → `<openprose-root>/deps/github.com/openprose/prose/packages/co/systems/company-repo-checker/index.prose.md`
   - Example: `github.com/alice/tools/formatter` → `<openprose-root>/deps/github.com/alice/tools/formatter.prose.md`
4. Bare `owner/repo` identifiers (no host prefix): reserved for the OpenProse registry (future home at `p.prose.md`); inert today

**Pattern resolution:**

When a structured `### Services` entry in a `kind: system` file includes `pattern:` (e.g., `pattern: std/patterns/worker-critic`), resolve the pattern file using the same resolution rules above. Patterns are `*.prose.md` files with `kind: pattern` in their frontmatter. Resolve the pattern definition first, then resolve each slot binding in `with:`.

**Recursive resolution for `kind: system` entries:**

When a resolved entry has `kind: system` (with its own `### Services` section) rather than `kind: service`, Forme recursively invokes the wiring algorithm on that subsystem. The subsystem's entire service graph becomes a single node in the parent's manifest. The subsystem's `### Ensures` become the node's outputs. The subsystem's `### Requires` — minus any satisfied by its own internal services — become the node's inputs. This is how delivery systems (like `fleet-ops-daily`) reference core systems (like `customer-discovery`) inside larger systems.

**Pattern slot resolution:** Values in `with:` blocks are resolved using the same rules as top-level services, even if not listed separately in `### Services`. A slot value may be a service, a subsystem, or a nested pattern declaration. `with:` binds slots only. `config:` binds pattern parameters. This means a system can declare only the pattern instance in `### Services` — the slot-filling services will be resolved from the `with:` entries automatically. A service, test, or ProseScript `call` must not instantiate a pattern directly.

If a service or system cannot be resolved, emit an error:

```
[Error] Service or system not found: 'researcher'
  Searched:
    - ./researcher.prose.md
    - ./researcher/index.prose.md
    - <openprose-root>/deps/ (no matching path)
  System file: ./research-system.prose.md
```

### Step 3: Read Each Contract

For each resolved service or system, extract from its `*.prose.md` file:

- **Frontmatter:** `name`, `kind`
- **Sections:** `### Services`, `### Requires`, `### Ensures`, `### Errors`, `### Invariants`, `### Strategies`, `### Environment`, `### Runtime`, `### Memory`, `### Skills`, `### Tools`, `### Shape`

**Header hierarchy:**

| Header | Meaning |
|--------|---------|
| `#` | Optional human title |
| `##` | Inline service boundary in a multi-service file |
| `###` | Section inside the current service or system |

Inline services take their service name from the `##` heading and their
behavior from subsequent `###` sections.

When a structured `### Services` entry uses `pattern:`, the resolved file must
have `kind: pattern`. Extract:
- `### Slots` — slot definitions (`name`, `primary` flag, contract with Requires/Ensures)
- `### Config` — config parameters (names, types, defaults)
- `### Invariants` — runtime guarantees the pattern enforces
- `### Delegation` — ProseScript or pseudocode describing how slots interact at runtime

If a bare Markdown service list item resolves to a `kind: pattern` file, emit an
error. Patterns must be instantiated through the structured `pattern:` shape so
their slots and config are explicit.

A service has this structure:

```markdown
---
name: researcher
kind: service
---

### Shape

- `self`: evaluate sources, score confidence
- `delegates`:
  - `summarizer`: compression
- `prohibited`: direct web scraping

### Requires

- `topic`: a research question to investigate

### Ensures

- `findings`: sourced claims from 3+ distinct sources, each with confidence 0-1
- `sources`: all URLs consulted with relevance ratings

### Errors

- `no-results`: no relevant sources found for this topic

### Strategies

- when few sources found: broaden search terms
```

### Step 3b: Expand Patterns

Before auto-wiring, expand any `pattern:` declarations into concrete graph
entries. After expansion, the pattern is gone — the manifest sees only services,
systems, and delegation constraints.

**Expansion procedure:**

For each structured `### Services` entry that includes `pattern:`:

1. **Load the pattern definition** from the resolved path.
2. **Bind slots** — for each `with:` entry that matches a slot name, bind the named service, subsystem, or nested pattern instance to that slot.
3. **Bind config** — for each `config:` entry that matches a config parameter, bind the value. Apply defaults for unspecified config.
4. **Validate slot contracts** — for each bound slot, verify the service's contract satisfies the slot's contract:
   - The service's `ensures` must cover what the slot's contract `ensures`
   - The service's `requires` must be satisfiable from the pattern's inputs or other slots' outputs
5. **Expand the delegation pattern** — replace slot references in the pattern's Delegation Loop with the bound service names. The expanded pattern becomes delegation steps in the manifest.
6. **Compute derived contract** — the pattern instance's `requires` is the set of inputs needed that aren't satisfied internally between slots. Its `ensures` is the pattern's output contract.
7. **Handle nesting** — if a `with:` slot value is itself a `pattern:` declaration, expand inside-out (innermost first). Detect and error on cycles:

```
[Error] Cycle in pattern nesting:
  worker-critic → stochastic-probe → worker-critic
  Patterns cannot reference themselves, directly or transitively.
```

### Step 4: Auto-Wire

This is the core of your role. Match each service or subsystem's `requires` entries to another service or subsystem's `ensures` entries or to the system's `requires` (caller inputs).

**Matching rules:**

1. **Exact name match.** If `critic` requires `findings` and `researcher` ensures `findings`, wire them.

2. **Semantic equivalence.** If the system requires `question` and `researcher` requires `topic`, understand these as equivalent based on context. Wire them.

3. **Shape-informed matching.** If a service's `shape.delegates` names another service, that's a strong signal they should be wired together.

4. **Transitive dependencies.** If `synthesizer` requires `findings` and `evaluation`, and `researcher` produces `findings` while `critic` produces `evaluation`, wire both.

5. **`run`-typed inputs.** If a `requires` entry uses the `run` or `run[]` keyword (e.g., `subject: run`, `inspections: run[]`), treat it as a **caller-provided input**. Do not attempt to match it against any service's `ensures` — no service within the system produces a run. The run already exists; it was produced by a prior execution. This is the same treatment as any other caller input like a `question` or `topic`, except the `run` keyword is preserved in the manifest so the VM knows to apply run-specific binding behavior.

6. **No match found.** If a service or subsystem's `requires` entry cannot be satisfied by any other service or subsystem's `ensures` or the caller's inputs, emit a warning:

```
[Warning] Unresolved dependency: critic.requires.raw_data
  No service or subsystem ensures 'raw_data' or a semantic equivalent.
  Consider: Does 'researcher.ensures.findings' satisfy this?
```

**Ambiguity resolution:**

If multiple services or subsystems ensure something that could match a `requires` entry, prefer:
1. The service explicitly named in the requiring service's `shape.delegates`
2. The service or subsystem whose `ensures` description most closely matches the `requires` description
3. If still ambiguous, emit a warning and pick the most likely match:

```
[Warning] Ambiguous wiring: synthesizer.requires.findings
  Could be satisfied by: researcher.ensures.findings OR validator.ensures.findings
  Selected: researcher.ensures.findings (closer semantic match)
  Pin this in a Wiring declaration if this is wrong.
```

Use two ambiguity levels:

- **Soft ambiguity** — one match is more likely after reading the contract
  language. Warn, record the selected binding in the manifest, and proceed.
- **Hard ambiguity** — two or more matches remain equally plausible and the
  downstream behavior would materially differ. Emit an error and do not produce
  a manifest until the author pins the edge in `### Wiring` or clarifies the
  contracts.

Do not fail merely because a match is semantic rather than exact. Fail only when
the semantic evidence is insufficient to choose a responsible binding.

### Step 4b: Recognize `each` in Ensures

When a service or system's `ensures` section contains an `each` clause (e.g., `each article has: a summary and a relevance score`), Forme treats the associated output as a collection. This affects wiring: downstream services that receive this output should expect a collection of items, each satisfying the stated properties.

No special manifest notation is needed — the `each` clause in the source service or system's `ensures` description carries forward into the manifest's output description. Forme's role is recognition, not transformation: it understands that `each` signals a collection output and wires accordingly.

### Step 5: Build the Dependency Graph

From the wiring, derive:

- **Execution order:** Topological sort of the dependency graph. Nodes with no unresolved dependencies can run first.
- **Parallelization opportunities:** Nodes with no dependencies on each other can run concurrently.
- **The critical path:** The longest dependency chain determines minimum execution time.
- **Pattern-internal ordering:** Expanded patterns introduce ordering constraints between bound services (e.g., in worker-critic, worker runs before critic in each iteration). These become edges in the dependency graph. Pattern-internal ordering is distinct from system-level execution order — the pattern's delegation rules define an internal loop that the VM executes as one graph entry.

### Step 5b: Collect Environment Declarations

After building the dependency graph, collect all `### Environment` declarations from every service in the graph:

1. **Gather** — for each service, extract its `### Environment` section (if present). Each entry names a runtime variable the service needs (e.g., `SLACK_WEBHOOK_URL`, `OPENAI_API_KEY`).
2. **Propagate** — merge all environment declarations up to the manifest so that preflight can check them all from the system file, without needing to read individual service files.
3. **Attribute** — the manifest should include a section listing all required environment variables across all services, with which service requires each one. If multiple services require the same variable, list it once with all requiring services noted.

**Security:** The model references environment variables by name only — it must never read, log, or include their raw values in any output, workspace artifact, or manifest content.

This enables `prose preflight` to verify the entire environment from the top-level system without traversing the dependency graph at runtime.

### Step 5c: Collect Tool Declarations

Collect all `### Tools` declarations from every system and service in the
graph. Tool declarations are host capability requirements. They do not satisfy
`### Requires`, do not create dependency-graph edges, and do not make a tool an
allowed or prohibited action.

For repository compile, consume the compiler program's `tools_resolution`
output. The compiler resolves only supported declarations before Forme emits a
manifest:

1. **Gather** -- for each system and service, extract its `### Tools` section
   if present.
2. **Inherit** -- system-level declarations apply to every sub-service in that
   system; service-level declarations are additive.
3. **Resolve** -- supported `cli:<name>` declarations must resolve to an
   executable on host PATH before the manifest is emitted.
4. **Attribute** -- emit one manifest entry per resolved CLI tool with the graph
   nodes that require it:

```json
{ "kind": "cli", "name": "jq", "requiredBy": ["verifier"] }
```

Only resolved CLI tools are emitted. Invalid, unsupported, or unresolved tool
declarations are compile errors and prevent `manifest.next.json` from being
written.

### Step 6: Validate

Before producing the manifest, check:

**Errors (block the run):**

| Check | Error |
|-------|-------|
| Circular dependency | `[Error] Circular dependency: A → B → C → A` |
| Missing service or system file | `[Error] Service or system not found: 'missing-service'` |
| System has no `ensures` | `[Error] System declares no ensures — nothing to produce` |
| Service/system `requires` completely unresolvable | `[Error] No source for critic.requires.raw_data` |
| Bare pattern reference | `[Error] Pattern 'worker-critic' must be instantiated with pattern:, with:, and optional config:` |
| Pattern instance outside system services | `[Error] Patterns may only be instantiated by kind: system files in ### Services` |
| Pattern slot missing binding | `[Error] Pattern worker-critic slot 'critic' has no binding and no default` |
| Slot contract mismatch | `[Error] Service 'my-svc' does not satisfy slot 'worker': ensures missing 'output'` |
| Config value placed under `with:` | `[Error] Pattern config 'max_rounds' belongs under config:, not with:` |
| Cycle in nested patterns | `[Error] Cycle in pattern nesting: A → B → A` |
| Slot name collides with config parameter name | `[Error] Pattern '{name}' has slot '{slot}' that collides with config parameter '{param}'. Slot and config names must be disjoint.` |
| Malformed tool declaration | `[Error] Invalid tool declaration: 'gh' (expected cli:<executable-name>)` |
| Unsupported tool namespace | `[Error] Unsupported tool kind: 'mcp:github'` |
| Unresolved declared CLI tool | `[Error] Declared tool not found on PATH: 'cli:gh'` |

**Warnings (proceed with caution):**

| Check | Warning |
|-------|---------|
| Unused ensures | `[Warning] researcher.ensures.sources not consumed by any downstream service or subsystem` |
| Semantic match (not exact) | `[Warning] Wired caller.question → researcher.topic (semantic match, not exact)` |
| Service/system declares `errors` but no downstream handles them | `[Warning] researcher.errors.no-results has no recovery path` |
| Shape declares delegate not in `### Services` | `[Warning] researcher.shape.delegates.summarizer not declared in system services` |
| `run`-typed input on a service (not the system) | `[Warning] analyzer.requires.subject uses run type — run inputs are typically system-level, not service-level` |
| Config parameter type mismatch | `[Warning] Pattern worker-critic config 'max_rounds' expects integer, got string` |
| Declared service never referenced | `[Warning] Service '{name}' is declared in ### Services but never called in ### Execution and no service or subsystem requires its outputs` |

### Step 7: Copy Source Files

Copy each resolved service, subsystem, and pattern source `*.prose.md` file into the run directory:

```
<openprose-root>/runs/{id}/sources/{name}.prose.md
```

This ensures the execution engine has a stable snapshot of the system as it was at wiring time, even if the source files change during execution.

### Step 8: Emit the Compiled Manifest

Emit the compiled Forme manifest as structured JSON. In repository compile, it
lives inside `dist/manifest.next.json` under `formeManifests`. During a
run, a filesystem backend may snapshot it as `forme.manifest.json`, but the
JSON object is the canonical runtime contract.

---

## Manifest Format

The compiled Forme manifest is a JSON object the execution engine reads to run
the system. It must be complete and unambiguous: the execution engine should
not need to re-read original source files to understand wiring.

```json
{
  "id": "{system-name}",
  "systemName": "{system-name}",
  "sourcePath": "{path to system file}",
  "caller": {
    "requires": [{ "name": "{input}", "description": "{description}" }],
    "returns": [{ "name": "{output}", "source": "{service-name}" }]
  },
  "graph": [
    {
      "id": "{service-name}",
      "sourcePath": "{path to service source}",
      "workspacePath": "workspace/{service-name}/",
      "inputs": [
        {
          "name": "{local-name}",
          "from": "service",
          "sourceNodeId": "{source-service}",
          "sourceOutput": "{output-name}",
          "path": "bindings/{source-service}/{output-name}.md"
        }
      ],
      "outputs": [
        {
          "name": "{output-name}",
          "workspacePath": "workspace/{service-name}/{output-name}.md",
          "bindingPath": "bindings/{service-name}/{output-name}.md",
          "public": true
        }
      ],
      "errors": [],
      "delegates": []
    }
  ],
  "executionOrder": [
    { "nodeId": "{service-name}", "dependsOn": ["caller"] }
  ],
  "environment": [],
  "tools": [
    { "kind": "cli", "name": "jq", "requiredBy": ["draft-risk-brief"] }
  ],
  "warnings": []
}
```

**Constraints.** Current v0 repository IR does not carry a separate constraint
section. Compile pattern-backed systems into ordinary graph wiring when the
pattern can be expanded without extra runtime rules; otherwise emit a warning
and keep the source explicit. A future manifest version may encode pattern
constraints such as firewalls, termination bounds, ratchets, and exhaustion
behavior.

Constraint types emitted:

- Information firewall: downstream service receives only declared `ensures` outputs, not internal reasoning or workspace intermediaries.
- Termination: the loop terminates after `max_rounds` or when the critic accepts.
- Monotonicity (ratchet): certified_progress array only grows. Each iteration's certified output is appended, never removed or modified. The VM maintains a ledger and rejects any state update that shrinks it.

**Error propagation:** If a slot service signals an error during a pattern delegation loop (writes `__error.md`), the pattern terminates immediately and propagates the error to the parent system. The pattern's exhaustion/retry behavior does not apply to errors — only to budget exhaustion or rejection. The VM treats a slot error as a pattern-level error.

### Manifest Sections Explained

**Caller Interface.** What the system needs from the user and what it returns. The execution engine uses this to bind inputs at system start and collect outputs at system end. When a caller input has the `run` or `run[]` keyword, preserve that in the field description or metadata so the VM applies run-specific validation and binding (see `prose.md`).

**Graph.** One node per service. Contains:
- `sourcePath` — path to the copied source file or compiled source snapshot
- `workspacePath` — path to the service's private working directory
- `inputs` — each input mapped to a specific binding path and source
- `outputs` — each declared `ensures` output, with the workspace path (where the service writes) and the bindings path (where it gets copied to for downstream consumption)
- `errors` — the service's declared error conditions
- `delegates` — valid runtime delegation targets for this service (from `shape.delegates`), with paths to their source files. Only present if the service has `shape.delegates`.

**Execution Order.** A numbered list showing which services run in what order, derived from the dependency graph. Includes parallelization notes. Delegates are not in the static execution order — they run on-demand when requested by their parent service via runtime delegation (see `prose.md`, Runtime Delegation).

**Tools.** Host executable requirements collected from `### Tools`. Each record
has `kind: "cli"`, the executable `name`, and `requiredBy` graph node ids. Tool
records do not create graph edges.

**Warnings.** Any warnings from the validation step. The execution engine can present these to the user before running.

---

## Directory Structure

After wiring, the run directory looks like:

```
<openprose-root>/runs/{id}/
├── forme.manifest.json               # Optional filesystem snapshot of compiled Forme manifest
├── root.prose.md                        # Copy of the root service or system file
├── sources/                       # Copied service, system, and pattern source files
│   ├── researcher.prose.md
│   ├── critic.prose.md
│   └── synthesizer.prose.md
├── workspace/                    # Private working directories (created at execution time)
│   ├── researcher/
│   ├── critic/
│   └── synthesizer/
├── bindings/                     # Public outputs (copied from workspace at execution time)
│   ├── researcher/
│   ├── critic/
│   └── synthesizer/
├── vm.log.md                      # Execution log (written by Phase 2)
└── agents/                       # Persistent agent memory
```

**You create:** the compiled Forme manifest object, plus `root.prose.md` and
`sources/` snapshots when using the filesystem backend.

**Phase 2 creates:** `workspace/`, `bindings/`, `vm.log.md`, `agents/`.

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

The author writes only `### Requires`, `### Ensures`, and optionally
`### Shape` on each service. No wiring declaration, no execution block. You
auto-wire everything.

**Your job:** Full auto-wiring. Build the complete dependency graph from contract matching. The manifest contains the full graph, execution order, and all file path mappings.

### Level 2: Wiring Declaration

The author includes a `### Wiring` section in the system file that explicitly maps outputs to inputs:

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

**Your job:** Validate the declared wiring against the service and system contracts. Check that the mappings are consistent with `### Requires` and `### Ensures`. Emit warnings if the author's wiring contradicts a contract. Produce the manifest using the author's wiring (don't override it).

### Level 3: Execution Block

The author includes a `### Execution` section with explicit ProseScript `let` + `call` statements:

````markdown
### Execution

```prose
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
````

**Your job:** The execution block IS the wiring. Extract the dependency graph from the `call` sequence. Validate against contracts. Produce the manifest with the execution order exactly as written — the Prose VM will follow it literally. Note in the manifest that this is a pinned execution (no reordering or parallelization).

**Patterns and author control levels:** Pattern expansion (Step 3b) occurs regardless of which author control level is used. At Level 1 (contracts only), pattern instances participate in auto-wiring like any service. At Level 2 (wiring declaration), the pattern instance's name can appear in `receives:` mappings. At Level 3 (execution block), the pattern instance can be invoked via `call` like any service. The expansion is always completed before wiring or execution begins.

---

## Handling Services with Shapes

When a service has a `### Shape` section, treat it as a **binding constraint** — not a hint, not a suggestion.

```markdown
### Shape

- `self`: evaluate progress, select strategy
- `delegates`:
  - `researcher`: source discovery, claim extraction
  - `critic`: quality evaluation
- `prohibited`: direct web search
```

**`delegates`** has both wiring-time and runtime meaning. At wiring time, it is a constraint: this service MUST delegate to `researcher` and `critic`. If these are in `### Services`, wire them as dependencies of this service. If a declared delegate is not in `### Services`, emit a warning — the author likely forgot to include it. At runtime, the VM uses the manifest's `delegates` block to validate runtime delegation requests — a service can only delegate to targets listed in its manifest entry (see `prose.md`, Runtime Delegation).

**`prohibited`** is a hard constraint. Include this in the manifest so the execution engine passes it to the session prompt. The subagent must not perform any prohibited action.

**`self`** is a boundary constraint. This service handles ONLY these responsibilities directly. Everything else must be delegated. Include in the manifest so the execution engine can contextualize the session and detect collapse (the service doing work it should delegate).

---

## Handling Multi-Service Files

A single `*.prose.md` file can contain multiple services delimited by `##` headings:

```markdown
---
name: content-pipeline
kind: system
---

### Services

- `review`
- `polish`
- `fact-check`

## review

### Requires

- `draft`: a piece of writing to review

### Ensures

- `feedback`: specific, actionable editorial notes

## polish

### Requires

- `draft`: the original text
- `feedback`: editorial notes to incorporate

### Ensures

- `final`: polished text incorporating all feedback

## fact-check

### Requires

- `text`: content containing factual claims

### Ensures

- `claims`: each factual claim with verification status
```

When you encounter a multi-service file:
1. Extract each `##` section as a separate service.
2. Parse each service's `###` sections exactly as if it came from a standalone service file.
3. Wire them using the same algorithm.
4. In the manifest, reference them as `{filename}.{section-name}` or by section name if unambiguous.
5. Copy the full source file to `sources/` — don't split it.

---

## Pattern Expansion

Patterns are reusable agent design patterns: slots, config, invariants, and delegation rules for how filled services interact. Forme expands patterns before auto-wiring. After expansion, the manifest contains only ordinary services and systems with delegation constraints; the pattern definition itself is not a standalone runtime node.

**Scoping:** Each `pattern:` declaration creates an independent pattern instance. If two pattern instances reference the same service (e.g., both use `quality-reviewer` as critic), the service source file is shared but each pattern instance creates an independent execution context. In the manifest, each pattern instance's delegation entries are scoped within that instance's graph entry — they do not become top-level graph entries.

#### Worked Example: worker-critic

**System file:**

````markdown
---
name: radar-report
kind: system
---

### Services

```yaml
- name: quality-checked-output
  pattern: std/patterns/worker-critic
  with:
    worker: radar-compiler
    critic: quality-reviewer
  config:
    max_rounds: 3
- radar-compiler
- quality-reviewer
```

### Requires

- `brief`: the radar compilation task

### Ensures

- `report`: a quality-reviewed radar report
````

**Expansion steps:**

1. Resolve `std/patterns/worker-critic` -> read its `### Slots`, `### Config`, `### Invariants`, and `### Delegation` sections.
2. Bind slots: `worker` → `radar-compiler`, `critic` → `quality-reviewer`.
3. Bind config: `max_rounds` → `3`.
4. Validate: `radar-compiler.ensures` covers the worker slot's contract (`output`). `quality-reviewer.ensures` covers the critic slot's contract (`verdict`, `reasoning`, `suggestions`).
5. Expand `### Delegation`: replace `worker` with `radar-compiler`, `critic` with `quality-reviewer`, `max_rounds` with `3`.
6. Compute derived contract: `quality-checked-output.requires` = `brief` (from `radar-compiler.requires`). `quality-checked-output.ensures` = `report` (the pattern's output).

**Conceptual expansion notes:**

These notes show what the compiler must preserve semantically. Current v0
repository IR should emit plain graph wiring when possible; it should warn
rather than invent a hidden constraints schema.

```markdown
### quality-checked-output (expanded from worker-critic)

source: sources/worker-critic.prose.md
delegation:
  worker: sources/radar-compiler.prose.md
  critic: sources/quality-reviewer.prose.md
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
  pattern: std/patterns/stochastic-probe
  with:
    probe:
      pattern: std/patterns/worker-critic
      with:
        worker: radar-compiler
        critic: quality-reviewer
      config:
        max_rounds: 3
    analyst: variance-analyst
  config:
    sample_size: 3
```

Expansion proceeds inside-out:

1. **Inner:** Expand `worker-critic(radar-compiler, quality-reviewer)` → produces a pattern instance with its own delegation steps and constraints.
2. **Outer:** Expand `stochastic-probe(inner-instance, variance-analyst, sample_size: 3)` → the probe slot is filled by the inner instance. The outer delegation runs the inner instance 3 times with identical inputs, then passes all results to `variance-analyst`.

The manifest contains delegation steps for both layers. The inner constraints (information firewall, termination) apply within each probe run. The outer constraints (identical inputs across runs) apply across the sample.

#### Error Cases

**Missing slot binding:**

```
[Error] Pattern worker-critic slot 'critic' has no binding and no default
  In service declaration: quality-checked-output
  Provide a service for the 'critic' slot in the with: block.
```

**Contract mismatch:**

```
[Error] Service 'my-formatter' does not satisfy slot 'critic' in worker-critic
  Slot expected outputs: [verdict, reasoning, suggestions]
  Service outputs: [formatted_text]
  The bound service's contract is incompatible with the slot.
```

**Cycle in nested patterns:**

```
[Error] Cycle in pattern nesting:
  worker-critic → stochastic-probe → worker-critic
  Patterns cannot reference themselves, directly or transitively.
```

---

## Handling Errors and Edge Cases

### Single-Service Runs

If the file being run has `kind: service`, Forme is not needed:

- The file is the sole service for this run
- No wiring is needed; the Prose VM validates the contract and records a
  minimal service activation record for uniform run state
- The Prose VM spawns one session for this service

### Empty `### Services`

If a file declares `kind: system` but `### Services` is empty or absent:

- Emit an error: a system must declare the graph it composes
- If the author intended one session, change `kind: system` to `kind: service`

### Services with Execution Blocks

If an individual service inside a system contains an `### Execution` block, it has internal logic. You don't need to wire its internals — treat it as a black box with `### Requires` and `### Ensures`. The execution engine will handle the internal execution.

### Circular Dependencies

If the dependency graph contains a cycle, emit an error and do not produce a manifest:

```
[Error] Circular dependency detected:
  researcher requires evaluation (from critic)
  critic requires findings (from researcher)

This system cannot be wired. Consider:
  - Breaking the cycle by removing one dependency
  - Using an iterative pattern (Forme pattern) instead
```

---

## Handling Tests

When Forme encounters `kind: test`, it wires a test: a subject service or
system, fixed fixtures, and evaluated assertions. Test files have this shape:

```yaml
---
name: test-synthesizer-file
kind: test
subject: synthesizer
---
```

The body contains `### Fixtures` (pre-supplied caller inputs), `### Expects`
(positive semantic assertions), and optionally `### Expects Not` (negative
semantic assertions). Assertions describe observable behavior in `bindings/`,
not exact phrasing.

### Wiring Process

1. **Resolve the subject.** First resolve `subject:` as a service or system path using standard service/system resolution. If that fails and the subject is a bare name, scan the test file's directory and nearest OpenProse source/package root for `*.prose.md` files whose frontmatter `name:` matches the subject. A test does not execute a pattern directly.
2. **Bind fixtures as caller inputs.** `### Fixtures` entries become the caller inputs. No `ask_user` prompting — tests are fully self-contained.
3. **Produce a test manifest.** Same structured manifest shape as a regular
   Forme manifest, with an additional evaluation payload containing the
   `### Expects` and `### Expects Not` clauses. Preserve assertion text and
   target output names so the VM can report each assertion separately.
4. **Wire the subject's dependencies.** If the subject is a system with its own services, wire those normally. If the subject is a single service, produce a minimal service activation record.

The test manifest's additional evaluation payload:

```markdown
## Evaluation

### Expects

- `summary`: mentions authentication or auth handling
- `summary`: is under 200 words

### Expects Not

- `__error.md` exists
```

The Prose VM handles execution and assertion evaluation — see `prose.md`, Executing Tests.

---

## Invocation

Forme is invoked as Phase 1 of a `prose run` command:

```
prose run ./<openprose-root>/src/research-system/index.prose.md
```

The runtime:
1. Detects `kind: system` with `### Services` -> triggers Forme (Phase 1)
2. Loads this document (`forme.md`) into the agent's context
3. The agent performs the wiring algorithm
4. The agent emits the compiled Forme manifest and snapshots source files
5. The runtime loads `prose.md` into the agent's context (Phase 2)
6. The agent reads the compiled Forme manifest and executes the system

No frontmatter field triggers system wiring.

For `kind: service` files, Phase 1 is skipped. The file is passed directly to
the Prose VM, which creates the run directory, snapshots the source, and writes
a minimal service activation record before spawning the service session.

Wiring is part of `prose run`: when the runtime detects a multi-service system,
it invokes this algorithm automatically before execution. Any future wire-only
helper should call this same algorithm rather than defining a second one.

---

## Summary

The Forme Container:

1. **Reads** the system file and its `### Services` section
2. **Resolves** each service name to a `*.prose.md` file (including pattern definitions)
3. **Extracts** contracts (`### Requires`, `### Ensures`, `### Errors`, `### Invariants`, `### Strategies`, `### Environment`, `### Tools`), shapes, and pattern slot/config definitions
4. **Expands patterns** — binds slots from `with:` and parameters from `config:`, validates slot contracts, expands delegation patterns, computes derived contracts (inside-out for nested patterns)
5. **Auto-wires** by matching `### Requires` ↔ `### Ensures` using semantic understanding
6. **Validates** the dependency graph for errors and warnings (including pattern-specific checks)
7. **Copies** source files into the run directory (`sources/`)
8. **Emits** the compiled Forme manifest with the complete wiring graph and warnings
9. **Hands off** to the Prose VM for execution

The manifest is complete, unambiguous, and structured. It can be rendered for
debugging, pinned by the author for determinism, or generated fresh each run
for maximum adaptability.

The language is self-evident by design. When in doubt about a contract match, flag the ambiguity rather than guessing silently. The author can always pin the wiring if your auto-wiring doesn't match their intent.
