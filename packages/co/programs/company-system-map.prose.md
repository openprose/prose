---
name: company-system-map
kind: program
---

# Company System Map

Turns a company context and repository source inventory into a system-first
Company as Code map. Use this before scaffolding a new company repo, promoting
shared capabilities, or deciding which workflows should become recurring runs.

This is intentionally reusable: it captures the operating pattern, not
OpenProse, Inc. private systems or customer assumptions.

### Services

- `source-inventory-builder`
- `company-system-boundary-mapper`
- `workflow-surface-planner`
- `company-starter-reporter`

### Requires

- `company_context`: Markdown<CompanyContext> - company mission, operating model, target users, current teams, and near-term responsibilities
- `repo_path`: Path<RepositoryRoot> - local repository root to inspect for existing source, docs, records, and runtime state
- `system_hints`: Json<SystemHint[]> - seed systems, ownership hints, or known boundaries supplied by the caller

### Ensures

- `starter_map`: Json<CompanyStarterMap> - composed starter map containing source inventory, system boundaries, workflow surface, records boundary, runtime boundary, and unresolved decisions
- `starter_next_actions`: Markdown<CompanyStarterNextActions> - concise setup plan for the next repo changes and evals

### Errors

- `repo_unreadable`: the repository path cannot be inspected
- `boundary_ambiguous`: a responsibility or adapter cannot be assigned without a human decision
- `workflow_overfit`: a proposed workflow bakes in a channel, vendor, or cadence before the responsibility boundary is clear

### Effects

- `read_external`: reads repository source under `repo_path`

### Strategies

- treat systems as durable business subsystems, not departments or file kinds
- keep responsibilities outcome-shaped and channel-independent
- promote shared capabilities only when reuse, external IO, or independent eval coverage justifies it
- separate executable source, curated records, and runtime state
- describe workflow cadences and gates as runtime configuration, not as hidden behavior inside leaf services
- return specific repo-grounded evidence for each proposed boundary

---

## source-inventory-builder

### Requires

- `repo_path`: Path<RepositoryRoot> - local repository root to inspect
- `system_hints`: Json<SystemHint[]> - caller-supplied seed systems or known boundaries

### Ensures

- `source_inventory`: Json<CompanySourceInventory> - repository evidence grouped into source roots, existing systems, shared capabilities, records, and runtime state

### Effects

- `read_external`: reads bounded repository source under `repo_path`

### Strategies

- inspect docs, package manifests, `.prose.md` contracts, evals, records, and committed runtime directories
- distinguish source roots from runtime state even when both are committed
- preserve file paths and component names so later nodes can cite evidence
- treat missing roots as useful evidence rather than immediate failure

---

## company-system-boundary-mapper

### Requires

- `company_context`: Markdown<CompanyContext> - company mission, operating model, target users, current teams, and near-term responsibilities
- `source_inventory`: Json<CompanySourceInventory> - repository evidence grouped into source roots, systems, shared capabilities, records, and runtime state
- `system_hints`: Json<SystemHint[]> - caller-supplied seed systems or known boundaries

### Ensures

- `company_system_map`: Json<CompanySystemMap> - proposed system boundaries, responsibilities, shared capabilities, adapters, records, and ownership rules

### Effects

- `pure`: maps context and source inventory without reading additional external state

### Strategies

- prefer a small number of systems with durable feedback loops
- keep one-consumer helpers inside their owning system until they earn promotion
- put external IO behind adapters and environment requirements
- mark ambiguous boundaries explicitly for human review
- cite the source inventory evidence behind each proposed system

---

## workflow-surface-planner

### Requires

- `company_system_map`: Json<CompanySystemMap> - proposed system boundaries, responsibilities, shared capabilities, adapters, records, and ownership rules

### Ensures

- `workflow_surface`: Json<WorkflowSurface> - candidate workflows with cadence, triggers, gates, input artifacts, and output artifacts

### Effects

- `pure`: derives workflow candidates from the accepted system map

### Strategies

- bind cadence, trigger, and delivery only after the responsibility is clear
- keep human gates explicit when a workflow mutates a repo, sends messages, or publishes externally
- identify which workflows can run through deterministic fixtures first
- identify which workflows need live Pi evidence or hosted runtime confidence

---

## company-starter-reporter

### Requires

- `source_inventory`: Json<CompanySourceInventory> - repository evidence grouped into source roots, systems, shared capabilities, records, and runtime state
- `company_system_map`: Json<CompanySystemMap> - proposed system boundaries, responsibilities, shared capabilities, adapters, records, and ownership rules
- `workflow_surface`: Json<WorkflowSurface> - candidate workflows with cadence, triggers, gates, input artifacts, and output artifacts

### Ensures

- `starter_map`: Json<CompanyStarterMap> - composed starter map containing source inventory, system boundaries, workflow surface, records boundary, runtime boundary, and unresolved decisions
- `starter_next_actions`: Markdown<CompanyStarterNextActions> - concise setup plan for the next repo changes and evals

### Effects

- `pure`: reports over accepted upstream artifacts only

### Strategies

- merge upstream artifacts without dropping file-grounded evidence
- list the first three repo changes before lower-priority refinements
- include the first eval or fixture that should protect each proposed system
- separate source cleanup, runtime evidence, and hosted deployment follow-up
- keep the output useful for a maintainer reviewing a pull request
