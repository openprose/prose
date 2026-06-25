---
name: company-repo-checker
kind: function
version: 0.15.0
---


# Company Repo Checker

Ensures a company-as-prose repository is still organized as an OpenProse-native
package before runtime tests or fleet monitors do more expensive work.

This is a reusable public contract. It describes what a company-native repo
should preserve; the agent host executing `prose run` supplies the concrete
read/search operations.

### Parameters

- `repo_path`: local path to the company-as-prose OpenProse root
- `source_roots`: optional list of source roots relative to `<openprose-root>`;
  default `["src"]`
- `ignored_roots`: optional list of roots ignored by the default check; default
  `["dist","runs","state","deps","customers"]`
- `external_prefixes`: optional service-reference prefixes that are resolved
  outside this package; default `["std/","co/","github.com/","gitlab.com/"]`

### Returns

- `report`: structured readiness report containing:
    - `source_layout`: authored intent under declared source roots
    - `contract_surface`: contracts declare their call/subscription interface
    - `test_pairing`: every contract has a paired test subject
    - `test_metadata`: tests declare subject, tier, contract_version, Expects,
      Expects Not, and Performance Tracked Over Time
    - `dependency_graph`: contract references resolve and do not cross
      package-private boundaries
    - `counts`: contract count, test count, dependency edge count
- `passed`: boolean true only when all hard failures are empty
- `failures`: array of specific file-grounded failures, empty when passed; the
  returned `report` carries `passed: true` exactly when every failure array is
  empty

### Invariants

- inspect the repo as a bounded package walk rooted at `repo_path`
- ignore `<openprose-root>/dist/`, `<openprose-root>/runs/`,
  `<openprose-root>/state/`, `<openprose-root>/deps/`, and nested customer
  packages unless explicitly asked
- fail when executable metadata does not match current OpenProse kind and tier
  values
- fail authored Prose source with `kind:` frontmatter that is not stored as
  `*.prose.md`
- treat cross-package private dependencies as source ownership bugs; promote the
  shared primitive or keep the helper local
- produce file-grounded failures that a maintainer can act on directly
- avoid quality scoring here; runtime fleet checks own probabilistic and
  semantic judgments

### Errors

- `parse_failed`: a Contract Markdown file cannot be read or parsed
- `unresolved_service`: a referenced contract does not resolve in the package walk
- `test_drift`: a contract lacks a paired test or a test subject does not
  resolve
- `source_layout_violation`: authored Prose source appears outside declared
  source roots
- `ownership_violation`: shared code depends on package-private code, or one
  package depends directly on another package's private source

### Execution

```prose
parallel:
  let source_layout = call repo-structure-inspector
    repo_path: repo_path
    source_roots: source_roots
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

### Parameters

- `repo_path`: local path to inspect
- `source_roots`: source roots to treat as package-owned authored intent
- `ignored_roots`: roots to skip in default scope

### Returns

- `source_layout`: report with:
    - `source_roots`: status for each declared source root
    - `source_extensions`: file-grounded findings for authored Prose source
      that does not use `*.prose.md`
- `failures`: array of source layout violations

### Invariants

- use the package root as the boundary
- treat README.md and other plain documentation as documentation, not authored
  Prose source, unless they contain `kind:` frontmatter
- flag authored Prose source outside declared source roots


## contract-test-drift-inspector

### Parameters

- `repo_path`: local path to inspect
- `source_roots`: source roots to treat as package-owned source
- `ignored_roots`: roots to skip in default scope

### Returns

- `contract_surface`: report with:
    - `contracts`: every top-level contract found under source roots, keyed by
      its `kind` (`responsibility`, `function`, `gateway`, `pattern`)
    - `missing_contract_sections`: data-flow contracts missing `### Requires` or
      `### Maintains`, and callables missing `### Parameters` or `### Returns`
    - `test_pairing`: paired test subject status for each contract
    - `test_metadata`: subject, tier, contract_version, Expects, Expects Not,
      and Performance Tracked Over Time status for each test
    - `counts`: contract count per kind, and test count
- `failures`: array of contract or test drift violations

### Invariants

- parse Contract Markdown according to the OpenProse spec: frontmatter for
  identity, `###` sections for contracts, `#` headings as human titles
- treat a `kind: function` plus `### Requires`/`### Maintains` as a kind
  mismatch; a callable declares `### Parameters`/`### Returns`, while a
  standing subscribable truth is a `responsibility`
- require responsibility tests to use `tier: responsibility` and function tests
  to use `tier: function`, not retired tiers from older OpenProse releases
- require test subjects to resolve to a contract in the same package or a shared
  source root
- allow patterns to be tested only through a contract that instantiates them


## dependency-graph-inspector

### Parameters

- `repo_path`: local path to inspect
- `source_roots`: source roots to treat as package-owned source
- `ignored_roots`: roots to skip in default scope
- `external_prefixes`: service-reference prefixes resolved outside this package

### Returns

- `dependency_graph`: report with:
    - `source_names`: globally unique contract names under source roots
    - `edges`: resolved dependency edges (intra-node `call` targets and
      cross-node subscriptions)
    - `unresolved`: contract references that do not resolve by source name or
      explicit external path
    - `ownership_violations`: shared-to-package-private or
      package-to-package-private dependencies
    - `counts`: dependency edge count
- `failures`: array of dependency graph violations

### Invariants

- resolve plain contract names by `name:` across the bounded package
  walk
- treat `std/...`, `co/...`, host-qualified dependency paths, explicit relative
  paths, and explicit `.prose.md` paths as external references rather than
  unresolved local names
- fail when a shared contract depends on a package-private contract
- fail when one package depends directly on another package's private source
- if a cross-package dependency is intentional, require promotion into shared or
  an explicit path plus TODO naming the promotion condition


## repo-readiness-reporter

### Parameters

- `source_layout`: output from repo-structure-inspector
- `contract_surface`: output from contract-test-drift-inspector
- `dependency_graph`: output from dependency-graph-inspector

### Returns

- `report`: merged readiness report with sections for source_layout,
  contract_surface, test_pairing, test_metadata, dependency_graph, and counts
- `passed`: boolean true only when all failure arrays are empty
- `failures`: concatenated file-grounded failures from all inspectors

### Invariants

- keep the summary short enough for CI or PR review
- list failures before counts
- preserve exact file paths and contract names from inspector outputs
- do not downgrade hard failures to warnings
