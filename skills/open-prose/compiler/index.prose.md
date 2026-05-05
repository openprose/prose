---
name: openprose-compiler
kind: service
---

# OpenProse Compiler

Compile semantic OpenProse source into repository IR that a deterministic
harness can validate and serve.

This is a pinned ProseScript compiler program. It is not a Forme-wired system.
Run it as one bounded compiler session: read source, build one manifest, write
`manifest.next.json`, then stop.

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

- `self`: discover source, lower intent, enforce the IR contract, and write only
  a valid manifest.
- `prohibited`: inventing schema fields, silently guessing ambiguous timing or
  fulfillment, recursively invoking the `prose` CLI, or spawning subagents.

### Strategies

- Treat Markdown source as authoritative intent and IR as disposable generated
  state.
- Load only the docs needed for the current compiler session.
- Use `ir-v0.md` as the canonical schema. When it conflicts with natural naming
  instinct, `ir-v0.md` wins.
- Infer responsibilities, concrete trigger registrations, and fulfillment only
  when the source graph makes the relationship clear.
- When `source_root` is a directory, compile the repository graph under that
  directory. Do not ask the user to choose one `.prose.md` file; infer roots,
  wire reachable source, and emit diagnostics for ambiguity.
- Do not invent connector routes, queue names, provider payloads, secrets, or
  provider subscription setup.
- Stay inside `source_root` for user source discovery. Schema and concept docs
  may be read from the OpenProse skill root.
- Prefer warnings over silent assumptions when timing, fulfillment, or Forme
  wiring is ambiguous.
- Do not call Claude's `Agent` or `Task` tool. The compiler passes below are
  steps for this session, not separate agents.
- Write `manifest.next.json` only after the checklist accepts the manifest.
- After writing `manifest.next.json`, stop immediately. Do not run optional
  `jq`, `sed`, shell summaries, validation subagents, or environment-maintenance
  commands; the host CLI performs deterministic validation after the compiler
  program exits.

### Compile Algorithm

Follow these steps literally, especially when running on a small or fast model:

1. Discover every `.prose.md` file under `source_root`.
2. Build `sources[]` first. Every source object uses `path`, `kind`, and
   optional `name`.
3. Build `responsibilities[]`.
4. Build `triggers[]`.
5. Build `activations[]`.
6. Build `formeManifests[]` from systems and services.
7. Build `diagnostics[]`.
8. Run the Mandatory Prewrite Checklist below.
9. If the checklist fails, repair schema shape once and run the checklist again.
10. If hard errors remain, return a plain failure report and do not write
    `manifest.next.json`.
11. Write only a manifest that passes the checklist.

Do not print "valid", "ready", or "compiled successfully" until the manifest
passes the Mandatory Prewrite Checklist.

### Mandatory Prewrite Checklist

Every generated manifest must satisfy all of these checks before writing:

- Top-level keys are exactly `kind`, `version`, `sources`, `responsibilities`,
  `triggers`, `activations`, `formeManifests`, `diagnostics`.
- `kind` is `openprose.repository-ir`; `version` is `0`.
- Every source has `path`; no source has `sourcePath` without `path`.
- Every responsibility has `id`, `sourcePath`, `goal`, `continuity`,
  `criteria`, and `constraints`.
- `continuity`, `criteria`, and `constraints` are arrays of strings, never one
  combined string.
- A fulfillment activation exists only when the matching responsibility has a
  `fulfillment` object with `mode`, `targetName`, and `sourcePath`.
- Every trigger has `id`, `responsibilityId`, `kind`, and `reason`.
- Every cron trigger has `cron`; no trigger has `schedule`.
- Every trigger id appears in the matching responsibility's judge activation
  `triggerIds`.
- Every judge activation has `triggerIds`; no activation has `triggers`.
- Every fulfillment activation has `reason`, `targetName`, and `sourcePath`.
- Every fulfillment activation targeting a system has `formeManifestId` equal to
  the matching Forme manifest `id`.
- Every diagnostic has `severity`, not `level`.
- Every Forme manifest has `id`, `systemName`, `sourcePath`, `caller`, `graph`,
  `executionOrder`, `environment`, and `warnings`.
- Every Forme manifest has exactly those keys, plus optional future schema keys
  only when `ir-v0.md` names them. No Forme manifest may have `kind`, `name`,
  `description`, `requires`, `ensures`, or `services`.
- `caller.requires` and `caller.returns` contain objects, not strings.
- Every graph node has `id`, `sourcePath`, `workspacePath`, `inputs`, and
  `outputs`.
- Every `executionOrder` entry is an object with `nodeId` and `dependsOn`.
- For every graph node, `executionOrder.dependsOn` exactly includes every
  dependency implied by that node's `inputs`.
- No Forme manifest has `services`, `requires`, or `ensures` as top-level
  keys.

### Mechanical IR Recipe

Cheap models drift toward nearby field names. Do not improvise. Emit only the
v0 field names below.

Source records:

```json
{ "path": "src/name.prose.md", "kind": "service", "name": "name" }
```

- Use `path`, never `sourcePath`, inside `sources[]`.

Trigger records:

```json
{
  "id": "<responsibility-id>.<trigger-name>",
  "responsibilityId": "<responsibility-id>",
  "kind": "cron",
  "reason": "Why this trigger wakes the judge.",
  "cron": "0 9 * * 1-5"
}
```

- Every trigger has `id`, `responsibilityId`, `kind`, and `reason`.
- Cron triggers use `cron`, never `schedule`.
- HTTP triggers use `method` and `path`.
- Manual triggers have no extra required fields.

Activation records:

```json
{
  "id": "<responsibility-id>.judge",
  "responsibilityId": "<responsibility-id>",
  "kind": "judge",
  "reason": "Determine whether the responsibility is up, drifting, down, or blocked.",
  "triggerIds": ["<trigger-id>"]
}
```

- Judge activations use `triggerIds`, never `triggers`.
- The judge activation for a responsibility includes every trigger id whose
  `responsibilityId` matches that responsibility. Fulfillment activations may
  also reference triggers, but they do not replace the judge trigger list.
- Fulfillment activations always include `reason`, `targetName`, and
  `sourcePath`.
- If fulfillment targets a system, include `formeManifestId` equal to that
  system's Forme manifest `id`.
- Use `targetName`, never `targetSystemId`, `target`, or `service`.

Responsibility fulfillment:

```json
{
  "mode": "declared",
  "targetName": "<system-or-service-name>",
  "sourcePath": "src/target.prose.md"
}
```

- Use `mode`, never `declared`, `inferred`, or `targetSystemId` as fields.
- If a responsibility has a `### Fulfillment` section naming one known system or
  service, add this fulfillment object with `mode: "declared"`.
- If no fulfillment section exists but the source graph has exactly one clear
  target system or service for the responsibility, add this fulfillment object
  with `mode: "inferred"`.
- If no fulfillment object is emitted on the responsibility, do not emit a
  fulfillment activation for that responsibility.

Before writing, rewrite these common near-misses:

| Wrong | Correct |
| --- | --- |
| `sources[].sourcePath` | `sources[].path` |
| `triggers[].schedule` | `triggers[].cron` |
| `activations[].triggers` | `activations[].triggerIds` |
| `targetSystemId` | `targetName` plus `sourcePath` |
| `formeManifests[].services` | `formeManifests[].graph` |
| `formeManifests[].requires` | `formeManifests[].caller.requires` |
| `formeManifests[].ensures` | `formeManifests[].caller.returns` |

If any required value is unclear, omit the optional relationship and emit a
diagnostic. Never write a manifest with missing required fields.

### Mechanical Forme Recipe

For each `kind: system` source, emit one `formeManifests[]` object with exactly
these top-level keys:

```json
{
  "id": "<system-name>",
  "systemName": "<system-name>",
  "sourcePath": "<system-source-path>",
  "caller": { "requires": [], "returns": [] },
  "graph": [],
  "executionOrder": [],
  "environment": [],
  "warnings": []
}
```

Do not copy the system source summary into `formeManifests[]`. A Forme manifest
is not a source record. It does not have `kind`, `name`, `description`,
`requires`, `ensures`, or `services`.

Do not emit the older shorthand shape:

```json
{
  "kind": "system",
  "name": "...",
  "requires": [],
  "ensures": [],
  "description": "...",
  "formeManifestId": "...",
  "services": []
}
```

Build the manifest mechanically:

- `caller.requires`: one field object for each bullet in the system's
  `### Requires` section.
- `caller.returns`: one field object for each bullet in the system's
  `### Ensures` section. Set `source` to the service that emits the same output
  name; if no exact service output matches, use the final service and add a
  warning.
- `graph`: one node per service named in the system's `### Services` list.
- Each graph node has exactly `id`, `sourcePath`, `workspacePath`, `inputs`,
  and `outputs`; add `errors` or `delegates` only when the source declares them
  explicitly.
- Node `outputs`: one output object for each bullet in the service's
  `### Ensures` section, using:
  - `workspacePath`: `workspace/<service>/<output>.md`
  - `bindingPath`: `bindings/<service>/<output>.md`
  - `public`: `true`
- Node `inputs`: one input object for each bullet in the service's
  `### Requires` section.
  - If a previous graph node emits the required name, use
    `from: "service"`, `sourceNodeId`, `sourceOutput`, and
    `path: "bindings/<source-node>/<source-output>.md"`.
  - Otherwise, bind from caller with `from: "caller"` and
    `path: "bindings/caller/<input>.md"` and add a warning if the system did
    not declare a matching caller requirement.
- `executionOrder`: one entry per graph node in dependency order. Derive
  `dependsOn` directly from the node's `inputs`:
  - start with `[]`;
  - for every input with `from: "caller"`, add `"caller"`;
  - for every input with `from: "service"`, add that input's `sourceNodeId`;
  - de-duplicate while preserving first-seen order;
  - if a node has no inputs, set `dependsOn` to `["caller"]` and add a warning.
- Do not infer `executionOrder.dependsOn` from graph position. If a node has
  inputs from both caller and service nodes, include both. For example, a node
  with inputs from `caller` and `topic-clusterer` must have
  `"dependsOn": ["caller", "topic-clusterer"]`.
- `environment`: combine all service `### Environment` entries as
  `{ "name": "<ENV_VAR>", "requiredBy": ["<service-id>"] }`; otherwise `[]`.
- `warnings`: strings only.

Examples of correct Forme field shapes:

```json
{
  "caller": {
    "requires": [
      { "name": "activation_event", "description": "Event that woke the run." }
    ],
    "returns": [
      { "name": "triage_report", "source": "action-planner" }
    ]
  },
  "graph": [
    {
      "id": "inbox-ingestor",
      "sourcePath": "src/inbox-ingestor.prose.md",
      "workspacePath": "workspace/inbox-ingestor/",
      "inputs": [
        {
          "name": "inbox_items",
          "from": "caller",
          "path": "bindings/caller/inbox_items.md"
        }
      ],
      "outputs": [
        {
          "name": "normalized_items",
          "workspacePath": "workspace/inbox-ingestor/normalized_items.md",
          "bindingPath": "bindings/inbox-ingestor/normalized_items.md",
          "public": true
        }
      ]
    }
  ],
  "executionOrder": [
    { "nodeId": "inbox-ingestor", "dependsOn": ["caller"] }
  ],
  "environment": [],
  "warnings": []
}
```

Wrong shapes to rewrite before validation:

```json
{
  "caller": { "requires": ["inbox_items"], "returns": ["triage_report"] },
  "graph": [{ "name": "inbox-ingestor", "kind": "service" }],
  "executionOrder": ["inbox-ingestor"],
  "services": ["inbox-ingestor"],
  "requires": ["inbox_items"],
  "ensures": ["triage_report"]
}
```

This execution order is also wrong when the node has more inputs than
`priority-scorer`:

```json
[{ "nodeId": "action-planner", "dependsOn": ["priority-scorer"] }]
```

Rewrite it so `dependsOn` contains every dependency visible in that node's
`inputs`.

Before emission, check every `formeManifests[]` object against this recipe. If
any object still contains `formeManifestId`, `kind`, `name`, `description`,
`requires`, `ensures`, or `services`, throw that object away and rebuild the
full v0 Forme manifest from the system and service contracts.

### Execution

Run these passes in this session. Do not invoke subagents, background agents,
the Claude `Agent` tool, or the `prose` CLI. Use available filesystem
read/glob/write tools for source discovery and artifact writing. Do not run
optional shell validation, summaries, or environment maintenance after writing.

1. **Discover Source**
   - Glob `source_root/**/*.prose.md`.
   - Ignore `dist/`, `runs/`, `state/`, `deps/`, and generated output.
   - Read each discovered file once.
   - Build `sources[]` with `path`, `kind`, and optional `name`.

2. **Index Contracts**
   - For each source, record frontmatter `kind` and `name`.
   - For services and systems, record bullets under `### Requires`,
     `### Ensures`, `### Services`, `### Environment`, and `### Fulfillment`.
   - For responsibilities, record `Goal`, `Continuity`, `Criteria`,
     `Constraints`, and optional `Fulfillment`.
   - For gateways, record schedule and HTTP receive intent.

3. **Lower Responsibilities**
   - Emit one responsibility record per `kind: responsibility`.
   - Preserve `Goal` as `goal`.
   - Preserve time bullets as `continuity`.
   - Preserve quality bullets as `criteria`.
   - Preserve constraint bullets as `constraints`.
   - If a fulfillment section names exactly one known system or service, add
     `fulfillment` with `mode: "declared"`, `targetName`, and `sourcePath`.
   - If no fulfillment section exists but exactly one target system or service
     is clear from the source graph, add `fulfillment` with `mode: "inferred"`,
     `targetName`, and `sourcePath`.
   - Otherwise omit fulfillment and add a warning diagnostic.

4. **Lower Triggers**
   - Infer cron triggers from clear responsibility continuity bullets.
   - Lower gateway schedules into cron triggers.
   - Lower gateway receive paths into HTTP triggers only when method, route, and
     responsibility are clear.
   - Each trigger must have `id`, `responsibilityId`, `kind`, `reason`, and the
     required kind-specific fields.

5. **Lower Activations**
   - Emit exactly one judge activation for each responsibility.
   - Set the judge `triggerIds` to every trigger id with that responsibility's
     `responsibilityId`.
   - Emit a fulfillment activation only when the responsibility has a
     fulfillment object.
   - If fulfillment targets a system, set `formeManifestId` to the matching
     Forme manifest id after Forme lowering.

6. **Lower Forme**
   - For each `kind: system`, emit one full Forme manifest.
   - Do not summarize the system source. Build a runtime wiring object with
     exactly `id`, `systemName`, `sourcePath`, `caller`, `graph`,
     `executionOrder`, `environment`, and `warnings`.
   - Build each graph node from a service named in the system's `### Services`
     list.
   - Build node inputs and outputs from the service contracts.
   - Build `executionOrder.dependsOn` from each node's inputs, not from graph
     position.
   - Never emit the shorthand `{ "system": "...", "services": [...] }` shape.

7. **Link Fulfillment**
   - For every fulfillment activation targeting a system, add
     `formeManifestId` equal to that system's Forme manifest `id`.
   - For every fulfillment activation targeting a service, omit
     `formeManifestId`.

8. **Assemble**
   - Build the top-level object with exactly the v0 keys:
     `kind`, `version`, `sources`, `responsibilities`, `triggers`,
     `activations`, `formeManifests`, and `diagnostics`.
   - All arrays must be present.

9. **Repair Once**
   - Apply the Mechanical IR Recipe and Mechanical Forme Recipe.
   - Rename wrong near-miss fields.
   - Expand shorthand Forme objects into full Forme objects.
   - Replace Forme source summaries with full Forme manifests.
   - Connect every trigger to the matching judge activation.
   - Add missing `formeManifestId` for system fulfillment activations.
   - Do not invent source files, provider setup, goals, or schema fields.

10. **Check**
    - Run the Mandatory Prewrite Checklist mentally against the manifest.
    - If the manifest still has required-field errors or error diagnostics, do
      not write it.
    - A written manifest must contain no error diagnostics.
    - If hard errors remain, return a plain failure report.

11. **Write And Stop**
    - Create `output_dir` if needed.
    - Write pretty JSON to `output_dir/manifest.next.json`.
    - Do not perform any work after the write.

The deterministic CLI validates the written manifest after this program
returns. That host validation is the final guardrail; the compiler program
should still treat `ir-v0.md` as binding before it writes.
