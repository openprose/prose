---
name: company-repo-checker
kind: program
---


### Services

- `repo-structure-inspector`
- `contract-eval-drift-inspector`
- `dependency-graph-inspector`
- `repo-readiness-reporter`


# Company Repo Checker

Ensures a company-as-prose repository is still organized as an OpenProse-native
package before runtime evals or fleet monitors do more expensive work.

This is a reusable public contract. It describes what a company-native repo
should preserve; the agent host executing `prose run` supplies the concrete
read/search operations.

### Requires

- `repo_path`: Path<RepositoryRoot> - local path to the company-as-prose repository root
- `source_roots`: Path[] - optional list of source roots; default `["systems","shared"]`
- `legacy_roots`: Path[] - optional list of deprecated flat roots; default
  `["responsibilities","services","delivery","evals","planning"]`
- `ignored_roots`: Path[] - optional list of roots ignored by the default check; default
  `[".prose","customers"]`
- `external_prefixes`: string[] - optional service-reference prefixes that are resolved
  outside this package; default `["std/","github.com/","gitlab.com/"]`

### Ensures

- `report`: RepoReadinessReport - structured readiness report containing:
    - `source_layout`: legacy source roots empty, source under declared roots
    - `contract_surface`: executable components declare Requires and Ensures
    - `eval_pairing`: every program or service has a paired eval subject
    - `eval_metadata`: evals declare subject, tier, contract_version, Expects,
      Expects Not, and Performance Tracked Over Time
    - `dependency_graph`: Services references resolve and do not cross
      system-private boundaries
    - `counts`: executable component count, eval count, dependency edge count
- `passed`: boolean - true only when all hard failures are empty
- `failures`: RepoFailure[] - array of specific file-grounded failures, empty when passed

### Effects

- `read_external`: reads repository source and eval files from `repo_path`

### Strategies

- inspect the repo as a bounded package walk rooted at `repo_path`
- ignore `.prose/runs/` and nested customer packages unless explicitly asked;
  runtime traces and customer packages have their own migration tracks
- fail on stale architecture vocabulary when it affects executable metadata,
  such as `kind: delivery` or `tier: delivery`
- treat cross-system private dependencies as source ownership bugs; promote the
  shared primitive or keep the helper local
- produce file-grounded failures that a maintainer can act on directly
- avoid quality scoring here; runtime fleet evals own probabilistic and
  semantic judgments

### Errors

- `parse_failed`: a Contract Markdown file cannot be read or parsed
- `unresolved_service`: a Services entry does not resolve in the package walk
- `eval_drift`: a component lacks a paired eval or an eval subject does not
  resolve
- `source_layout_violation`: source appears under a deprecated flat root
- `ownership_violation`: shared code depends on system-private code, or one
  system depends directly on another system's private source

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
  contract_surface: contract_surface
  dependency_graph: dependency_graph

return report
```


## repo-structure-inspector

### Requires

- `repo_path`: Path<RepositoryRoot> - local path to inspect
- `source_roots`: Path[] - source roots to treat as package-owned source
- `legacy_roots`: Path[] - deprecated roots that should not accumulate source files
- `ignored_roots`: Path[] - roots to skip in default scope

### Ensures

- `source_layout`: RepoSourceLayoutReport - report with:
    - `legacy_roots`: status for each deprecated root
    - `source_roots`: status for each declared source root
    - `stale_vocabulary`: file-grounded findings for source metadata that uses
      obsolete executable vocabulary
- `failures`: RepoFailure[] - array of source layout violations

### Effects

- `read_external`: reads repository source layout under `repo_path`

### Strategies

- use the package root as the boundary
- allow historical migration maps in docs to mention old roots; fail only when
  executable source or eval metadata reintroduces old roots or kinds
- flag any committed source file under a deprecated flat root


## contract-eval-drift-inspector

### Requires

- `repo_path`: Path<RepositoryRoot> - local path to inspect
- `source_roots`: Path[] - source roots to treat as package-owned source
- `ignored_roots`: Path[] - roots to skip in default scope

### Ensures

- `contract_surface`: ContractSurfaceReport - report with:
    - `executable_components`: every top-level `kind: program` and
      `kind: service` found under source roots
    - `missing_contract_sections`: components missing `### Requires` or
      `### Ensures`
    - `eval_pairing`: paired eval subject status for each executable component
    - `eval_metadata`: subject, tier, contract_version, Expects, Expects Not,
      and Performance Tracked Over Time status for each eval
    - `counts`: executable component count and eval count
- `failures`: RepoFailure[] - array of contract or eval drift violations

### Effects

- `read_external`: reads component and eval source under `repo_path`

### Strategies

- parse Contract Markdown according to the OpenProse spec: frontmatter for
  identity, `###` sections for contracts, `#` headings as human titles
- treat `kind: service` plus `### Services` as a kind mismatch; the component
  should be a program or inline components should be used
- require workflow evals to use `tier: workflow`, not `tier: delivery`
- require eval subjects to resolve to a component in the same system or shared
  package
- allow shared capabilities to use `tier: service`, `tier: responsibility`, or
  `tier: capability` depending on the component's role


## dependency-graph-inspector

### Requires

- `repo_path`: Path<RepositoryRoot> - local path to inspect
- `source_roots`: Path[] - source roots to treat as package-owned source
- `ignored_roots`: Path[] - roots to skip in default scope
- `external_prefixes`: string[] - service-reference prefixes resolved outside this package

### Ensures

- `dependency_graph`: DependencyGraphReport - report with:
    - `component_names`: globally unique component names under source roots
    - `edges`: resolved `### Services` dependency edges
    - `unresolved`: service references that do not resolve by component name or
      explicit external path
    - `ownership_violations`: shared-to-system-private or
      system-to-system-private dependencies
    - `counts`: dependency edge count
- `failures`: RepoFailure[] - array of dependency graph violations

### Effects

- `read_external`: reads component dependency references under `repo_path`

### Strategies

- resolve plain service names by component `name:` across the bounded package
  walk
- treat `std/...`, host-qualified dependency paths, explicit relative paths,
  and explicit `.prose.md` paths as external references rather than unresolved local
  names
- fail when a shared component depends on a system-private component
- fail when one system depends directly on another system's private source
- if a cross-system dependency is intentional, require promotion into shared or
  an explicit path plus TODO naming the promotion condition


## repo-readiness-reporter

### Requires

- `source_layout`: RepoSourceLayoutReport - output from repo-structure-inspector
- `contract_surface`: ContractSurfaceReport - output from contract-eval-drift-inspector
- `dependency_graph`: DependencyGraphReport - output from dependency-graph-inspector

### Ensures

- `report`: RepoReadinessReport - merged readiness report with sections for source_layout,
  contract_surface, eval_pairing, eval_metadata, dependency_graph, and counts
- `passed`: boolean - true only when all failure arrays are empty
- `failures`: RepoFailure[] - concatenated file-grounded failures from all inspectors

### Effects

- `pure`: deterministic synthesis over inspector outputs

### Strategies

- keep the summary short enough for CI or PR review
- list failures before counts
- preserve exact file paths and component names from inspector outputs
- do not downgrade hard failures to warnings
