---
name: company-repo-checker
kind: program
---

# Company Repo Checker

Ensures a company-as-code repository is still organized as an
OpenProse-native package before runtime evals, scheduled workflows, or hosted
fleet monitors do more expensive work.

This is a reusable public contract. It describes what a company-native source
tree should preserve; the runtime provider supplies the concrete read/search
operations.

### Services

- `repo-structure-inspector`
- `contract-eval-drift-inspector`
- `dependency-graph-inspector`
- `repo-readiness-reporter`

### Requires

- `repo_path`: Path<RepositoryRoot> - local path to the company-as-code repository root
- `source_roots`: Path[] - optional source roots; default `["systems","shared"]`
- `legacy_roots`: Path[] - optional deprecated roots; default `["responsibilities","services","delivery","evals","planning"]`
- `ignored_roots`: Path[] - optional roots ignored by the default check; default `[".prose","customers"]`
- `external_prefixes`: string[] - optional dependency prefixes resolved outside this package; default `["std/","co/","github.com/","gitlab.com/","registry://"]`

### Ensures

- `report`: Json<RepoReadinessReport> - structured readiness report containing:
  - source_layout: legacy source roots empty, source under declared roots
  - contract_surface: executable components declare Requires and Ensures
  - eval_pairing: every program or service has a paired eval subject when expected
  - eval_metadata: evals declare subject, tier, contract_version, expectations, and tracked metrics
  - dependency_graph: service references resolve without crossing system-private boundaries
  - counts: executable component count, eval count, dependency edge count, and warning count
- `passed`: boolean - true only when all hard failures are empty
- `failures`: Json<RepoFailure[]> - file-grounded failures, empty when passed

### Effects

- `read_external`: reads repository source and eval files from `repo_path`

### Errors

- `parse_failed`: a Contract Markdown file cannot be read or parsed
- `unresolved_service`: a Services entry does not resolve in the package walk
- `eval_drift`: a component lacks a paired eval or an eval subject does not resolve
- `source_layout_violation`: source appears under a deprecated flat root
- `ownership_violation`: shared code depends on system-private code, or one system depends directly on another system's private source

### Strategies

- inspect the repo as a bounded package walk rooted at `repo_path`
- apply defaults when optional root inputs are empty
- ignore `.prose/runs/` and nested customer packages unless explicitly asked
- fail on stale architecture vocabulary when it affects executable metadata
- treat cross-system private dependencies as source ownership bugs
- produce file-grounded failures that a maintainer can act on directly
- avoid probabilistic quality scoring here; runtime fleet evals own semantic judgments

### Execution

```prose
parallel:
  let source_layout = call repo-structure-inspector
    repo_path: repo_path
    source_roots: source_roots
    legacy_roots: legacy_roots
    ignored_roots: ignored_roots

  let contract_surface = call contract-eval-drift-inspector
    repo_path: repo_path
    source_roots: source_roots
    ignored_roots: ignored_roots

  let dependency_graph = call dependency-graph-inspector
    repo_path: repo_path
    source_roots: source_roots
    ignored_roots: ignored_roots
    external_prefixes: external_prefixes

let report = call repo-readiness-reporter
  source_layout: source_layout
  source_layout_failures: source_layout_failures
  contract_surface: contract_surface
  contract_surface_failures: contract_surface_failures
  dependency_graph: dependency_graph
  dependency_graph_failures: dependency_graph_failures

return report
```

---

## repo-structure-inspector

### Requires

- `repo_path`: Path<RepositoryRoot> - local path to inspect
- `source_roots`: Path[] - optional source roots to treat as package-owned source
- `legacy_roots`: Path[] - optional deprecated roots that should not accumulate source files
- `ignored_roots`: Path[] - optional roots to skip in default scope

### Ensures

- `source_layout`: Json<RepoSourceLayoutReport> - source layout report containing:
  - source_roots: status for each declared source root
  - legacy_roots: status for each deprecated root
  - ignored_roots: roots excluded from the default check
  - stale_vocabulary: file-grounded findings for obsolete executable vocabulary
- `source_layout_failures`: Json<RepoFailure[]> - source layout violations

### Effects

- `read_external`: reads repository source layout under `repo_path`

### Strategies

- use the package root as the boundary
- apply the program defaults when optional root inputs are empty
- allow historical migration maps in docs to mention old roots
- fail only when executable source or eval metadata reintroduces old roots or kinds
- flag committed `.prose.md` source files under deprecated flat roots

---

## contract-eval-drift-inspector

### Requires

- `repo_path`: Path<RepositoryRoot> - local path to inspect
- `source_roots`: Path[] - optional source roots to treat as package-owned source
- `ignored_roots`: Path[] - optional roots to skip in default scope

### Ensures

- `contract_surface`: Json<ContractSurfaceReport> - contract surface report containing:
  - executable_components: every top-level `kind: program` and `kind: service`
  - missing_contract_sections: components missing `### Requires` or `### Ensures`
  - eval_pairing: paired eval subject status for each executable component
  - eval_metadata: subject, tier, contract_version, expectations, and tracked metrics
  - counts: executable component count and eval count
- `contract_surface_failures`: Json<RepoFailure[]> - contract or eval drift violations

### Effects

- `read_external`: reads component and eval source under `repo_path`

### Strategies

- parse Contract Markdown according to the OpenProse spec
- apply the program defaults when optional root inputs are empty
- treat `kind: service` plus `### Services` as a kind mismatch
- require workflow evals to use `tier: workflow`
- require eval subjects to resolve to a component in the same system or shared package
- allow shared capabilities to use the tier that matches their component role

---

## dependency-graph-inspector

### Requires

- `repo_path`: Path<RepositoryRoot> - local path to inspect
- `source_roots`: Path[] - optional source roots to treat as package-owned source
- `ignored_roots`: Path[] - optional roots to skip in default scope
- `external_prefixes`: string[] - optional dependency prefixes resolved outside this package

### Ensures

- `dependency_graph`: Json<DependencyGraphReport> - dependency graph report containing:
  - component_names: globally unique component names under source roots
  - edges: resolved `### Services` dependency edges
  - unresolved: service references that do not resolve locally or externally
  - ownership_violations: shared-to-system-private or system-to-system-private dependencies
  - counts: dependency edge count
- `dependency_graph_failures`: Json<RepoFailure[]> - dependency graph violations

### Effects

- `read_external`: reads component dependency references under `repo_path`

### Strategies

- resolve plain service names by component `name:` across the bounded package walk
- apply the program defaults when optional root inputs are empty
- treat `std/...`, `co/...`, registry refs, host-qualified paths, and explicit `.prose.md` paths as external references
- fail when a shared component depends on a system-private component
- fail when one system depends directly on another system's private source
- require cross-system reuse to move into `shared/` unless explicitly documented as a transition

---

## repo-readiness-reporter

### Requires

- `source_layout`: Json<RepoSourceLayoutReport> - output from repo-structure-inspector
- `source_layout_failures`: Json<RepoFailure[]> - source layout failures
- `contract_surface`: Json<ContractSurfaceReport> - output from contract-eval-drift-inspector
- `contract_surface_failures`: Json<RepoFailure[]> - contract surface failures
- `dependency_graph`: Json<DependencyGraphReport> - output from dependency-graph-inspector
- `dependency_graph_failures`: Json<RepoFailure[]> - dependency graph failures

### Ensures

- `report`: Json<RepoReadinessReport> - merged readiness report with source layout, contract surface, eval metadata, dependency graph, counts, and recommendation
- `passed`: boolean - true only when all failure arrays are empty
- `failures`: Json<RepoFailure[]> - concatenated file-grounded failures from all inspectors

### Effects

- `pure`: deterministic synthesis over inspector outputs

### Strategies

- keep the summary short enough for CI, PR review, or hosted registry checks
- list failures before counts
- preserve exact file paths and component names from inspector outputs
- do not downgrade hard failures to warnings
- return a single JSON report suitable for eval acceptance and platform display
