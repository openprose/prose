---
name: company-repo-checker
kind: system
---


### Services

- `repo-structure-inspector`
- `contract-test-drift-inspector`
- `dependency-graph-inspector`
- `repo-readiness-reporter`


# Company Repo Checker

Ensures a company-as-prose repository is still organized as an OpenProse-native
package before runtime tests or fleet monitors do more expensive work.

This is a reusable public contract. It describes what a company-native repo
should preserve; the agent host executing `prose run` supplies the concrete
read/search operations.

### Requires

- `repo_path`: local path to the company-as-prose repository root
- `source_roots`: optional list of source roots; default
  `["systems","services","patterns","evals","tests","shared"]`
- `legacy_roots`: optional list of deprecated flat roots; default
  `["programs","responsibilities","delivery","planning"]`
- `ignored_roots`: optional list of roots ignored by the default check; default
  `[".agents/prose/runs",".agents/prose/deps","customers"]`
- `external_prefixes`: optional service-reference prefixes that are resolved
  outside this package; default `["std/","co/","github.com/","gitlab.com/"]`

### Ensures

- `report`: structured readiness report containing:
    - `source_layout`: legacy source roots empty, source under declared roots
    - `contract_surface`: services and systems declare Requires and Ensures
    - `test_pairing`: every service or system has a paired test subject
    - `test_metadata`: tests declare subject, tier, contract_version, Expects,
      Expects Not, and Performance Tracked Over Time
    - `dependency_graph`: Services references resolve and do not cross
      system-private boundaries
    - `counts`: service count, system count, test count, dependency edge count
- `passed`: boolean true only when all hard failures are empty
- `failures`: array of specific file-grounded failures, empty when passed

### Strategies

- inspect the repo as a bounded package walk rooted at `repo_path`
- ignore `.agents/prose/runs/` and nested customer packages unless explicitly asked;
  runtime traces and customer packages have their own migration tracks
- fail on stale architecture vocabulary when it affects executable metadata,
  such as removed kind values or legacy tiers
- fail authored Prose source with `kind:` frontmatter that is not stored as
  `*.prose.md`
- treat cross-system private dependencies as source ownership bugs; promote the
  shared primitive or keep the helper local
- produce file-grounded failures that a maintainer can act on directly
- avoid quality scoring here; runtime fleet checks own probabilistic and
  semantic judgments

### Errors

- `parse_failed`: a Contract Markdown file cannot be read or parsed
- `unresolved_service`: a Services entry does not resolve in the package walk
- `test_drift`: a service or system lacks a paired test or a test subject does not
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

  let contract_surface = call contract-test-drift-inspector
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

- `repo_path`: local path to inspect
- `source_roots`: source roots to treat as package-owned source
- `legacy_roots`: deprecated roots that should not accumulate source files
- `ignored_roots`: roots to skip in default scope

### Ensures

- `source_layout`: report with:
    - `legacy_roots`: status for each deprecated root
    - `source_roots`: status for each declared source root
    - `source_extensions`: file-grounded findings for authored Prose source
      that does not use `*.prose.md`
    - `stale_vocabulary`: file-grounded findings for source metadata that uses
      obsolete executable vocabulary
- `failures`: array of source layout violations

### Strategies

- use the package root as the boundary
- allow historical migration maps in docs to mention old roots; fail only when
  executable source or test metadata reintroduces old roots or kinds
- treat README.md and other plain documentation as documentation, not authored
  Prose source, unless they contain `kind:` frontmatter
- flag any committed source file under a deprecated flat root


## contract-test-drift-inspector

### Requires

- `repo_path`: local path to inspect
- `source_roots`: source roots to treat as package-owned source
- `ignored_roots`: roots to skip in default scope

### Ensures

- `contract_surface`: report with:
    - `services`: every top-level `kind: service` found under source roots
    - `systems`: every top-level `kind: system` found under source roots
    - `patterns`: every top-level `kind: pattern` found under source roots
    - `missing_contract_sections`: services or systems missing `### Requires` or
      `### Ensures`
    - `test_pairing`: paired test subject status for each service and system
    - `test_metadata`: subject, tier, contract_version, Expects, Expects Not,
      and Performance Tracked Over Time status for each test
    - `counts`: service count, system count, pattern count, and test count
- `failures`: array of contract or test drift violations

### Strategies

- parse Contract Markdown according to the OpenProse spec: frontmatter for
  identity, `###` sections for contracts, `#` headings as human titles
- treat `kind: service` plus `### Services` as a kind mismatch; it should be a
  system, or the Services section should be removed for a one-session service
- require system tests to use `tier: system` and service tests to use
  `tier: service`, not retired tiers from older OpenProse releases
- require test subjects to resolve to a service or system in the same package
  or a shared source root
- allow patterns to be tested only through a service or system that
  instantiates them


## dependency-graph-inspector

### Requires

- `repo_path`: local path to inspect
- `source_roots`: source roots to treat as package-owned source
- `ignored_roots`: roots to skip in default scope
- `external_prefixes`: service-reference prefixes resolved outside this package

### Ensures

- `dependency_graph`: report with:
    - `source_names`: globally unique service, system, and pattern names under
      source roots
    - `edges`: resolved `### Services` dependency edges
    - `unresolved`: service or system references that do not resolve by source
      name or explicit external path
    - `ownership_violations`: shared-to-system-private or
      system-to-system-private dependencies
    - `counts`: dependency edge count
- `failures`: array of dependency graph violations

### Strategies

- resolve plain service names by `name:` across the bounded package
  walk
- treat `std/...`, `co/...`, host-qualified dependency paths, explicit relative
  paths, and explicit `.prose.md` paths as external references rather than
  unresolved local names
- fail when a shared service depends on a system-private service
- fail when one system depends directly on another system's private source
- if a cross-system dependency is intentional, require promotion into shared or
  an explicit path plus TODO naming the promotion condition


## repo-readiness-reporter

### Requires

- `source_layout`: output from repo-structure-inspector
- `contract_surface`: output from contract-test-drift-inspector
- `dependency_graph`: output from dependency-graph-inspector

### Ensures

- `report`: merged readiness report with sections for source_layout,
  contract_surface, test_pairing, test_metadata, dependency_graph, and counts
- `passed`: boolean true only when all failure arrays are empty
- `failures`: concatenated file-grounded failures from all inspectors

### Strategies

- keep the summary short enough for CI or PR review
- list failures before counts
- preserve exact file paths and service/system names from inspector outputs
- do not downgrade hard failures to warnings
