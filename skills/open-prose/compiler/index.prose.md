---
name: openprose-compiler
kind: function
version: 0.15.0
---

# OpenProse Compiler

Compile semantic OpenProse source into the compile-phase IR that the dumb
reconciler consumes and a deterministic harness can validate and serve.

This is a pinned ProseScript compiler program. It is not a mounted node and is
not Forme-wired: the compiler itself owns its execution order and uses short,
isolated sessions to keep each lowering step on a narrow context budget. It is
the **intelligent compile phase**; the run phase that reads its output is dumb
(`architecture.md` §2).

### Parameters

- `source_root`: source directory to compile; default `<openprose-root>/src`
  unless `prose compile` supplies a path.
- `output_dir`: build output directory; default `dist`.

### Returns

- `manifest_next`: valid compile-phase IR written to
  `output_dir/manifest.next.json` (the topology world-model, per-node
  canonicalizers, per-node postcondition validators, and frozen contract
  fingerprints — see `ir-v0.md`).
- `diagnostics`: concise compile diagnostics with enough source paths to fix
  ambiguity.

### Shape

- `self`: orchestrate the compile flow, enforce the IR contract, and write only
  a valid manifest.
- `delegates`: source discovery, responsibility lowering, gateway lowering,
  skill resolution, tool resolution, Forme topology lowering, canonicalizer
  compilation, postcondition compilation, IR emission, and IR validation.
- `prohibited`: inventing schema fields, reintroducing a judge / verdict /
  pressure / fulfillment-activation beat, silently guessing ambiguous wiring or
  cadence, installing host capabilities, recursively invoking the `prose` CLI.

### Strategies

- Treat Markdown source as authoritative intent and IR as disposable generated
  state.
- Load only the docs needed for the current compiler session. Do not bulk-load
  the whole skill into every delegate.
- Use `ir-v0.md` as the canonical schema. When it conflicts with natural naming
  instinct, `ir-v0.md` wins.
- Lower contracts into topology nodes, canonicalizers, and postcondition
  validators only when the source graph makes the relationship clear.
- Do not invent connector routes, queue names, provider payloads, secrets, or
  provider subscription setup.
- Do not invent host skill or tool availability.
- Stay inside `source_root`; do not inspect sibling examples, parent
  repositories, or unrelated source trees.
- A wiring failure — no producer for a `### Requires` facet, or an ambiguous
  match between candidate producers — is always a surfaced `error` diagnostic,
  never a silent guess.
- Prefer warnings over silent assumptions when cadence, facet backing, or Forme
  wiring is ambiguous.
- Write `manifest.next.json` only after validation accepts the manifest.
- After writing `manifest.next.json`, return the result. Do not run optional
  `jq`, `sed`, shell summaries, or environment-maintenance commands; the host
  CLI performs deterministic validation after the compiler program exits.

### Execution

```prose
agent source_discoverer:
  model: "fast"
  persist: false
  prompt: """
  Discover OpenProse source files under source_root.
  Load contract-markdown.md only.
  Treat source_root as a hard boundary. Do not read parent directories or
  sibling repositories while discovering source.
  Return root-relative source records with path, kind, and optional name.
  Recognize responsibility, function, gateway, pattern, test, and unknown.
  There is no system kind and no service kind; classify a callable helper as
  function and never as a topology node.
  Ignore dist/, runs/, state/, deps/, and generated output.
  Emit diagnostics for unreadable files, unknown structures, and duplicate names.
  """
  shape:
    self: ["source discovery", "frontmatter classification"]
    prohibited: ["semantic lowering", "IR emission"]

agent responsibility_compiler:
  model: "fast"
  persist: false
  prompt: """
  Lower kind: responsibility source into topology node records, the node's
  intrinsic wake_source, its contract fingerprint inputs, and diagnostics.
  Load concepts/responsibility.md, concepts/reactor.md, and compiler/ir-v0.md.
  Preserve Goal, Requires, Maintains, and Continuity as the node's contract.
  Derive wake_source from Continuity: input-driven by default, self when a
  cadence is declared, external for a gateway.
  Use frontmatter `id:` as the responsibility identity backing the node. Never
  derive identity from `name:`, filepath, title, or a slug; those are display
  and source-location fields only.
  Do not emit a judge activation, a verdict, pressure, or a fulfillment
  activation; commit-gating is compiled postconditions plus render
  self-attestation.
  Surface a self-driven cadence from Continuity only when it is clear enough to
  carry as the node's wake_source. Otherwise emit a diagnostic.
  """
  shape:
    self: ["responsibility node semantics", "wake-source derivation"]
    prohibited: ["judge/verdict/pressure beats", "provider-specific connector setup"]

agent gateway_compiler:
  model: "fast"
  persist: false
  prompt: """
  Lower kind: gateway source into external-driven topology nodes and entry
  points.
  Load concepts/reactor.md and compiler/ir-v0.md.
  A gateway is sugar for an external-driven responsibility: it has wake_source
  external and appears in topology.entry_points.
  Compile Schedule, Receives, and Emits sections into the node's external
  ingress and the subscription edge it wakes when method, path, producer, and
  target node are clear.
  Preserve provider, auth, payload, and subscription ambiguity as diagnostics.
  """
  shape:
    self: ["gateway lowering", "entry-point registration"]
    prohibited: ["fulfillment work", "provider subscription setup"]

agent skills_resolver:
  model: "fast"
  persist: false
  prompt: """
  Resolve declared `### Skills` for every responsibility and function in the
  source graph.
  Load contract-markdown.md (Skills) and compiler/ir-v0.md.
  For each declared skill in colon form (namespace:name), search in order:
    1. <project>/skills/
    2. ~/.claude/skills/
    3. ~/.codex/skills/
    4. ~/.agents/skills/
  A skill resolves when one of those paths contains a directory whose name
  matches the skill name in either flat (<name>) or namespaced
  (<namespace>/<name>) layout.
  Aggregate scope: a responsibility's declared skills apply to every function
  its render calls; node-level declarations are additive — they extend, never
  replace, the inherited set.
  Never install, modify, or remove host skills.
  Return one record per declared skill with its source component path and the
  resolved location, plus an `unresolved` array of `{ skill, sourcePath,
  searchedPaths }` entries for any skill that did not resolve.
  Emit one diagnostic with severity `error` and code `skill_unresolved` for
  each unresolved entry, naming the skill and the searched paths.
  """
  shape:
    self: ["skill resolution", "host filesystem checks", "scope aggregation"]
    prohibited: ["installing skills", "modifying host state", "guessing skill locations"]

agent tools_resolver:
  model: "fast"
  persist: false
  prompt: """
  Resolve declared `### Tools` for every responsibility and function in the
  source graph.
  Load contract-markdown.md (Tools) and compiler/ir-v0.md.
  Accept deterministic CLI executable declarations in the exact
  `cli:<executable-name>` form and deterministic MCP server declarations in the
  exact `mcp:<server-name>` form. Names must be non-empty and must not contain
  path separators.
  Report malformed declarations such as `gh`, `cli:`, `mcp:`, or `cli:bin/gh`
  with a diagnostic whose severity is `error` and whose message includes
  `tool_invalid`.
  Report namespaces other than `cli` and `mcp` with a diagnostic whose severity
  is `error` and whose message includes `tool_unsupported_kind`.
  For each supported CLI declaration, check host PATH for an executable with
  that name. Do not run the executable and do not perform version or auth
  checks.
  For each supported MCP declaration, check the deterministic host MCP registry
  for that server name. Do not install, contact, or introspect the MCP server.
  Aggregate scope: a responsibility's declared tools apply to every function its
  render calls; node-level declarations are additive — they extend, never
  replace, the inherited set. A responsibility's declarations are the host
  capabilities its render may use to observe and act on the maintained truth.
  Tool declarations do not satisfy `### Requires` and do not create Forme
  subscription edges.
  Never install, modify, upgrade, or remove host tools.
  Return one aggregated node tool record per resolved responsibility/gateway
  tool using `{ kind: "cli" | "mcp", name, requiredBy }`, where `requiredBy`
  names the topology nodes that need the capability.
  Return one function tool list per function using
  `{ functionName, tools: [{ kind: "cli" | "mcp", name }] }`; use an empty
  `tools` array when the function explicitly declares no required tools.
  Return an `unresolved` array of `{ tool, sourcePath, checked }` entries for
  any executable absent from PATH or MCP server absent from the registry. Emit
  one diagnostic with severity `error` and message code `tool_unresolved` for
  each unresolved entry, naming the tool and the lookup that was checked.
  """
  shape:
    self: ["tool resolution", "PATH executable checks", "MCP registry checks", "scope aggregation"]
    prohibited: ["installing tools", "running declared tools", "guessing tool availability"]

agent forme_compiler:
  model: "fast"
  persist: false
  prompt: """
  Lower the responsibility and gateway nodes into the topology world-model.
  Load forme.md and compiler/ir-v0.md.
  Produce only the topology object described by ir-v0.md: nodes, edges,
  entry_points, and acyclic.
  Resolve each subscriber `### Requires` facet-contract to the producer
  `### Maintains` facet that satisfies it semantically, and draw one edge
  `subscriber.Requires.<facet> -> producer.Maintains.<facet>` (use "@atomic"
  when the producer declares no facets). Functions are never nodes; they do not
  appear in the topology.
  Entry points are exactly the nodes whose wake_source is external (gateways).
  Compute acyclic with the deterministic cycle check; when the contract set is
  irreducibly cyclic, set acyclic false and emit a severity error diagnostic
  naming the cycle.
  A missing producer or an ambiguous match for a `### Requires` facet is a
  surfaced diagnostic, never a silent guess.
  """
  shape:
    self: ["Forme wiring", "topology world-model", "acyclicity postcondition"]
    prohibited: ["responsibility semantics", "judge/verdict beats", "custom topology fields"]

agent canonicalizer_compiler:
  model: "fast"
  persist: false
  prompt: """
  Compile each node's `### Maintains` canonicalization spec into a deterministic
  canonicalizer reference.
  Load compiler/ir-v0.md and concepts/responsibility.md.
  Read the named parts of `### Maintains` (the named-parts rule, ir-v0.md
  "The `####`-part -> facet lowering"). Each `#### <name>` sub-heading IS a facet:
  lower it to a FacetSpec { facet: <heading text>, paths: <the part's material
  field paths> }, default-material WITHIN the part. Bind un-facetted top-level
  `### Maintains` fields (the shared truth outside any `####` part) to the atomic
  facet only. A `### Maintains` with no `####` parts lowers to atomic-only.
  Produce one canonicalizer record per topology node with node, artifact, and
  facets. facets always includes "@atomic" and then every `#### <name>` part as a
  facet; a leaf truth that declares no facets has facets ["@atomic"]. Every
  edge.facet whose producer is this node must appear in this node's facets.
  Apply the structured-backing rule: anything subscribed must have a structured,
  canonicalizable backing. Lint subscribed fields (every `#### ` part) without
  structured backing and surface them as diagnostics; a part with no material
  field paths is backing-less, and free-form rendered prose is excluded from the
  fingerprint.
  """
  shape:
    self: ["canonicalization-spec lowering", "facet boundaries", "structured-backing lint"]
    prohibited: ["judge/verdict beats", "fingerprint value invention"]

agent postcondition_compiler:
  model: "fast"
  persist: false
  prompt: """
  Compile each node's `### Maintains` postconditions (the folded-in `### Criteria`)
  into a postcondition validator reference.
  Load compiler/ir-v0.md and architecture-aligned concepts/reactor.md.
  Produce one postcondition record per topology node with node, artifact, and
  mode. mode is deterministic when the postcondition is expressible as a
  deterministic predicate the harness verifies on commit, render-attested when
  it is irreducibly semantic and the render self-polices before signing.
  There is no separate judge beat and no LLM in the wake/commit decision.
  """
  shape:
    self: ["postcondition lowering", "deterministic-vs-attested mode"]
    prohibited: ["judge/verdict beats", "LLM commit gating"]

agent ir_emitter:
  model: "fast"
  persist: false
  prompt: """
  Assemble the final compile-phase IR object.
  Load compiler/ir-v0.md only.
  Emit JSON matching ir-v0.md exactly: kind, version, sources, topology,
  canonicalizers, postconditions, contract_fingerprints, diagnostics.
  kind is the literal "openprose.compile-phase-ir"; version is the integer 2.
  Arrays must always be present; topology is a single object;
  contract_fingerprints is an object map with one entry per topology node equal
  to that node's contract_fingerprint. Omit custom fields.
  Move commentary into diagnostics. Do not emit Markdown fences.
  """
  shape:
    self: ["IR assembly", "schema discipline"]
    prohibited: ["semantic reinterpretation", "custom fields", "Markdown output"]

agent ir_validator:
  model: "fast"
  persist: false
  prompt: """
  Validate the compile-phase IR against compiler/ir-v0.md.
  Check exact top-level fields and literal kind/version, required fields, allowed
  enum values, root-relative paths, topology node/edge/entry-point integrity
  (edges reference existing nodes; entry points are external nodes; acyclic is
  honest), one canonicalizer and one postcondition per node, producer facets
  covering subscribed edge facets, contract_fingerprints covering every node and
  matching node fingerprints, and diagnostic shape.
  Treat any diagnostic with severity error as invalid for writing.
  Return valid: true only when the manifest should be written.
  Return concrete errors with JSON paths when invalid.
  """
  shape:
    self: ["schema validation", "cross-reference validation"]
    prohibited: ["rewriting source intent", "adding missing semantics"]

agent manifest_writer:
  model: "fast"
  persist: false
  prompt: """
  Write the already validated manifest JSON to output_dir/manifest.next.json.
  Create output_dir if needed.
  Do not change, pretty-print creatively, summarize, or repair the manifest.
  Report the written path and byte count.
  """
  shape:
    self: ["artifact writing"]
    prohibited: ["schema repair", "semantic changes"]

let discovered = session: source_discoverer
  prompt: "Discover the OpenProse source graph."
  context: { source_root }

let responsibility_output = session: responsibility_compiler
  prompt: "Lower responsibilities into topology nodes with their wake sources and contract fingerprints."
  context: { source_root, discovered }

let gateway_output = session: gateway_compiler
  prompt: "Lower gateways into external-driven nodes and entry points."
  context: { source_root, discovered, responsibility_output }

let skills_resolution = session: skills_resolver
  prompt: "Resolve declared skills for every responsibility and function."
  context: { source_root, discovered }

if skills_resolution reports unresolved skills:
  return skills_resolution

let tools_resolution = session: tools_resolver
  prompt: "Resolve declared host tools for every responsibility and function."
  context: { source_root, discovered }

if tools_resolution reports invalid, unsupported, or unresolved tools:
  return tools_resolution

let forme_output = session: forme_compiler
  prompt: "Wire the responsibility DAG into the topology world-model."
  context: { source_root, discovered, responsibility_output, gateway_output, tools_resolution }

if forme_output reports an ambiguous match, an unsatisfied subscription, or a cyclic contract set:
  return forme_output

let canonicalizer_output = session: canonicalizer_compiler
  prompt: "Compile each node's Maintains canonicalization spec into a canonicalizer reference. Lower each #### part under Maintains into a facet; un-facetted top-level fields bind to @atomic only."
  context: { source_root, discovered, responsibility_output, gateway_output, forme_output }

let postcondition_output = session: postcondition_compiler
  prompt: "Compile each node's Maintains postconditions into a validator reference."
  context: { source_root, discovered, responsibility_output, gateway_output, forme_output }

let manifest = session: ir_emitter
  prompt: "Assemble the complete compile-phase IR JSON object: topology, canonicalizers, postconditions, and frozen contract fingerprints."
  context: { discovered, responsibility_output, gateway_output, tools_resolution, forme_output, canonicalizer_output, postcondition_output }

let validation = session: ir_validator
  prompt: "Validate the complete manifest before it is written."
  context: { manifest }

if validation reports errors:
  return validation

let write_result = session: manifest_writer
  prompt: "Write the validated manifest."
  context: { output_dir, manifest }

return write_result
```

Before forwarding to the compiler harness, the deterministic CLI preflights
the compile target source files for responsibility `id:` and required
`### Tools` sections, then resolves declared tools only within that target
(except `prose compile .`, which preserves whole-root preflight). After this
program returns, the CLI validates the written manifest. That host validation
is the final guardrail; the compiler program should still treat `ir-v0.md` as
binding before it writes.
