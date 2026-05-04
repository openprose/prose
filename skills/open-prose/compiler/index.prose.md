---
name: openprose-compiler
kind: service
---

# OpenProse Compiler

Compile semantic OpenProse source into repository IR that a deterministic
harness can validate and serve.

This is a pinned ProseScript compiler program. It is not a Forme-wired system:
the compiler itself owns the execution order and uses short, isolated sessions
to keep each lowering step on a narrow context budget.

### Requires

- `source_root`: source directory to compile; default `<openprose-root>/src`
  unless `prose compile` supplies a path.
- `output_dir`: build output directory; default `dist`.

### Ensures

- `manifest_next`: valid repository IR written to
  `output_dir/manifest.next.json`.
- `diagnostics`: concise compile diagnostics with enough source paths to fix
  ambiguity.

### Shape

- `self`: orchestrate the compile flow, enforce the IR contract, and write only
  a valid manifest.
- `delegates`: source discovery, responsibility lowering, gateway lowering,
  Forme lowering, IR emission, and IR validation.
- `prohibited`: inventing schema fields, silently guessing ambiguous timing or
  fulfillment, recursively invoking the `prose` CLI.

### Strategies

- Treat Markdown source as authoritative intent and IR as disposable generated
  state.
- Load only the docs needed for the current compiler session. Do not bulk-load
  the whole skill into every delegate.
- Use `ir-v0.md` as the canonical schema. When it conflicts with natural naming
  instinct, `ir-v0.md` wins.
- Infer responsibilities, concrete trigger registrations, and fulfillment only
  when the source graph makes the relationship clear.
- Do not invent connector routes, queue names, provider payloads, secrets, or
  provider subscription setup.
- Prefer warnings over silent assumptions when timing, fulfillment, or Forme
  wiring is ambiguous.
- Write `manifest.next.json` only after validation accepts the manifest.

### Execution

```prose
agent source_discoverer:
  model: "fast"
  persist: false
  prompt: """
  Discover OpenProse source files under source_root.
  Load contract-markdown.md only.
  Return root-relative source records with path, kind, and optional name.
  Recognize responsibility, gateway, system, service, test, pattern, and unknown.
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
  Lower kind: responsibility source into responsibility records, inferred
  triggers, judge activations, optional fulfillment intent, and diagnostics.
  Load concepts/responsibility.md, concepts/reactor.md, and compiler/ir-v0.md.
  Preserve Goal, Continuity, Criteria, and Constraints in the exact IR fields:
  goal, continuity, criteria, constraints.
  Emit one judge activation per responsibility.
  Infer cron triggers from Continuity only when cadence is clear enough for a
  standard five-field cron expression. Otherwise emit a diagnostic.
  Infer fulfillment only when one system or service relationship is clearly
  strongest. Otherwise emit a diagnostic and omit fulfillment activation.
  """
  shape:
    self: ["responsibility semantics", "judge cadence", "fulfillment inference"]
    prohibited: ["provider-specific connector setup", "Forme graph emission"]

agent gateway_compiler:
  model: "fast"
  persist: false
  prompt: """
  Lower kind: gateway source into concrete trigger records.
  Load concepts/reactor.md and compiler/ir-v0.md.
  Compile Schedule sections into cron triggers.
  Compile Receives plus Emits sections into HTTP triggers when method, path,
  responsibility, and target judge activation are clear.
  Preserve provider, auth, payload, and subscription ambiguity as diagnostics.
  Do not put sourcePath, payload, metadata, emits, wakes, or activationId on
  trigger records.
  """
  shape:
    self: ["gateway lowering", "trigger registration"]
    prohibited: ["fulfillment work", "provider subscription setup"]

agent forme_compiler:
  model: "fast"
  persist: false
  prompt: """
  Lower systems and services into structured Forme manifest objects.
  Load forme.md and compiler/ir-v0.md.
  Produce only the formeManifests array entries described by ir-v0.md.
  Use executionOrder entries with exactly nodeId and dependsOn fields.
  Link fulfillment activations that target systems to the matching
  formeManifestId.
  Emit warnings for wiring that cannot be represented in v0.
  """
  shape:
    self: ["Forme wiring", "dependency graph", "execution order"]
    prohibited: ["responsibility semantics", "custom manifest fields"]

agent ir_emitter:
  model: "fast"
  persist: false
  prompt: """
  Assemble the final repository IR object.
  Load compiler/ir-v0.md only.
  Emit JSON matching ir-v0.md exactly: kind, version, sources,
  responsibilities, triggers, activations, formeManifests, diagnostics.
  Arrays must always be present. Omit custom fields.
  Move commentary into diagnostics. Do not emit Markdown fences.
  """
  shape:
    self: ["IR assembly", "schema discipline"]
    prohibited: ["semantic reinterpretation", "custom fields", "Markdown output"]

agent ir_validator:
  model: "fast"
  persist: false
  prompt: """
  Validate the repository IR against compiler/ir-v0.md.
  Check exact top-level fields, required fields, allowed enum values,
  root-relative paths, trigger-to-judge links, exactly one judge activation per
  responsibility, fulfillment/source/Forme links, Forme graph references,
  executionOrder dependencies, and diagnostic shape.
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
  prompt: "Compile responsibilities into v0 responsibility, trigger, and activation records."
  context: { source_root, discovered }

let gateway_output = session: gateway_compiler
  prompt: "Compile gateways into v0 trigger records and activation links."
  context: { source_root, discovered, responsibility_output }

let forme_output = session: forme_compiler
  prompt: "Compile systems and services into v0 Forme manifests."
  context: { source_root, discovered, responsibility_output, gateway_output }

let manifest = session: ir_emitter
  prompt: "Assemble the complete v0 repository IR JSON object."
  context: { discovered, responsibility_output, gateway_output, forme_output }

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

The deterministic CLI validates the written manifest after this program
returns. That host validation is the final guardrail; the compiler program
should still treat `ir-v0.md` as binding before it writes.
