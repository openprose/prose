---
name: converter
kind: service
---

requires:
- source: the original `.prose` file contents
- classification: the classification decision from the classifier
- analysis: the structural analysis from the analyzer

ensures:
- output: the converted `.md` file(s), provided as a structured list where each entry contains a filename and its full content. For multi-service programs this includes an `index.md` and one `{service-name}.md` per extracted service. For single-service programs this is a single `.md` file. Each file follows v2 conventions:
    - YAML frontmatter with `name`, `kind`, and optionally `shape` and `persist`
    - `requires:` section with named inputs and descriptions
    - `ensures:` section with named outputs and descriptions
    - `strategies:` section where the original had retry/backoff logic, complex iteration, or recovery patterns
    - `errors:` section where the original had try/catch with identifiable failure modes
    - `invariants:` section where the original had implicit constraints worth preserving
    - No imperative code in the body -- all behavior is expressed through contracts

strategies:
- when extracting requires/ensures from imperative code: look at input declarations for requires, output declarations and final session results for ensures. Name them descriptively.
- when the original uses retry/backoff on a session: convert to a strategies clause like "when {operation} fails: retry with {backoff-type} backoff"
- when the original has try/catch: identify the error condition and add it to the errors section with a descriptive name and explanation
- when the original defines agents with shape-like properties (delegation, restricted permissions): convert to shape declarations in the service frontmatter
- when the original has parallel blocks: if branches become separate services, note parallelizability in the index.md (Forme will auto-detect from the dependency graph). If branches are internal to one service, describe the parallel behavior in the ensures clause.
- when the original uses string interpolation or context passing: express these as data-flow relationships in the requires/ensures contracts between services
- when the original uses persistent agents: add `persist: true` (or `persist: project`/`persist: user` as appropriate) to the service frontmatter

errors:
- unconvertible-pattern: the source contains a v0 pattern with no reasonable v2 equivalent (e.g., deeply recursive block invocations that cannot be expressed as service contracts)
