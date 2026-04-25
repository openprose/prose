# Current Runtime Contract Inventory

**Date:** 2026-04-25
**Phase:** 01.1 Inventory Current Runtime Contracts

This inventory records what the current OSS package exposes before the ideal
runtime restructure begins. Status values mean:

- **Keep:** this is directionally right and should survive as a concept.
- **Migrate:** this is useful, but belongs behind a new module/runtime boundary.
- **Replace:** this proves a concept but should be rebuilt in the ideal shape.
- **Delete:** this should not survive as a public surface.

The package has no backward compatibility requirement. These statuses are
architectural guidance, not preservation promises.

## CLI Commands

| Command | Current role | Status | Target treatment |
| --- | --- | --- | --- |
| `compile` | Compile one `.prose.md` file into `ProseIR` JSON. | Migrate | Become package/workspace compile over canonical package IR. |
| `plan` | Compute readiness/staleness over one compile unit and optional current run dirs. | Migrate | Move into `runtime` over the store-backed package IR. |
| `materialize` | Write fixture-based RFC 005 run records from caller-supplied outputs. | Replace | Become fixture provider behavior under `prose run --provider fixture`. |
| `remote execute` | Wrap fixture materialization in a hosted runtime envelope. | Replace | Wrap the real runtime kernel and store records. |
| `status` | Summarize loose run directories. | Migrate | Query the local run store indexes. |
| `trace` | Read loose `run.json`, node records, and `trace.json`. | Migrate | Query store records, attempts, artifacts, and provider sessions. |
| `graph` | Render IR graph plus optional plan overlay. | Keep | Read canonical package IR and store-backed plan state. |
| `manifest` | Project IR into a VM-readable Markdown manifest. | Replace | Become a generated projection of executable package IR. |
| `package` | Generate registry metadata from local source. | Migrate | Read package IR, schemas, evals, provider requirements, and quality results. |
| `publish-check` | Check publish readiness from generated package metadata. | Migrate | Become stricter and eval-aware. |
| `install` | Install Git-backed registry refs into `.deps` and `prose.lock`. | Keep | Keep as package lifecycle primitive, but align metadata and refs with executable package contract. |
| `search` | Search local package metadata. | Keep | Later use typed schemas, effects, eval quality, and provider requirements. |
| `preflight` | Check dependency installs and declared environment variables. | Migrate | Become runtime/provider readiness checks. |
| `lint` | Check source hygiene and structural warnings. | Keep | Expand to package IR, policy, eval, schema, and provider checks. |
| `fmt` | Rewrite supported source sections into canonical order. | Keep | Extend to new source constructs. |
| `highlight` | Emit first-pass source tokens or HTML preview. | Keep | Extend to execution IR and new source constructs. |
| `grammar` | Emit TextMate grammar artifact. | Keep | Extend with real source syntax once execution IR lands. |
| `run` | Missing. | Add | Canonical compile -> plan -> execute -> store -> report command. |
| `eval` | Missing. | Add | Discover and execute eval components over runs. |

## Public Exports

`src/index.ts` currently exports many implementation-level functions directly.

| Export group | Examples | Status | Target treatment |
| --- | --- | --- | --- |
| Compiler/source | `compileFile`, `compileSource` | Migrate | Export through `source` and `ir` boundaries. |
| Format/lint/highlight/grammar | `formatSource`, `lintSource`, `highlightSource`, `renderTextMateGrammar` | Keep | Move behind `source` and tooling modules. |
| Graph/plan | `graphSource`, `buildGraphView`, `planSource` | Migrate | Graph stays IR-level; plan moves to `runtime`. |
| Materialize/remote | `materializeSource`, `executeRemoteFile`, `buildArtifactManifest` | Replace | Fixture provider plus remote envelope over real runtime. |
| Package lifecycle | `packagePath`, `publishCheckPath`, `installRegistryRef`, `searchCatalog` | Migrate | Move under `package` with executable metadata. |
| Run views | `statusPath`, `traceFile` | Migrate | Move under `store` views. |
| Type exports | `ProseIR`, `RunRecord`, `PackageMetadata`, etc. | Replace | Split into stable module-level contracts and remove incidental shapes. |

The target public API should be narrow and module-oriented:

- `core`
- `source`
- `ir`
- `schema`
- `graph`
- `meta`
- `store`
- `runtime`
- `providers`
- `policy`
- `eval`
- `package`
- `cli`

## Source Parser Outputs

Current source parsing supports:

- file frontmatter with simple scalar/array YAML parsing
- file component plus inline `##` components
- inline component frontmatter
- `### Requires`
- `### Ensures`
- `### Services`
- `### Runtime`
- `### Environment`
- `### Effects`
- `### Access`
- fenced `### Execution` blocks using ```prose

Status:

- Markdown-with-structured-sections is **Keep**.
- File-only compile is **Migrate** to package/workspace compile.
- Simple frontmatter parsing is **Replace** with a real parser or a stricter
  schema-backed reader.
- Raw execution text is **Replace** with structured execution IR.
- Exact section spelling normalization is **Keep**, but should be validated by
  formatter/linter/golden fixtures.

## IR Fields

Current `ProseIR` shape:

- `ir_version: "0.1"`
- `semantic_hash`
- `package.name`
- `package.source_ref`
- `package.source_sha`
- `package.dependencies[]`
- `components[]`
- `graph`
- `diagnostics[]`

Current `ComponentIR` shape:

- identity: `id`, `name`, `kind`
- source location
- ports: `requires`, `ensures`
- services
- schemas, evals, expansions as empty arrays
- runtime settings
- environment declarations
- raw execution body
- effects
- access

Current `GraphIR` shape:

- nodes for components
- edges for exact wiring, caller inputs, return outputs, and execution service
  calls
- warnings for unresolved or ambiguous exact wiring

Status:

- Component, port, effect, environment, access, graph, diagnostics, and hashes
  are **Keep/Migrate**.
- `schemas`, `evals`, and `expansions` as empty placeholders are **Replace**.
- Single-file `ProseIR` is **Replace** with package IR as canonical.
- Raw `ExecutionIR.body` is **Replace** with structured control IR while
  preserving original source spans.
- Exact-only wiring is **Migrate** into deterministic graph normalization plus
  accepted intelligent proposal records.

## Run File Shapes

Current materialization writes loose directories under `.prose/runs/{run_id}`:

- `ir.json`
- `manifest.md`
- `trace.json`
- `run.json`
- `nodes/{component_id}.run.json`
- `inputs/{port}.txt`
- `outputs/{component_or_graph}/{port}.txt`

Current `RunRecord` contains:

- immutable run identity
- component or graph kind
- component version source/package/IR hashes
- caller principal, tenant, roles, and trigger
- runtime harness fields
- input bindings
- dependency pins
- declared/performed effects
- output bindings
- eval statuses
- acceptance
- trace reference
- lifecycle status
- timestamps

Status:

- Universal run materialization is **Keep**.
- Loose run directories are **Replace** with a local store abstraction.
- Existing `RunRecord` is **Migrate** into store-backed component run, graph
  run, attempt, artifact, and pointer records.
- Fixture output artifacts are **Replace** with provider-produced artifacts
  written through the store.
- Current/latest graph-node pointers are missing and must be **Add**.

## Package Metadata Fields

Current package metadata is `openprose.package.v2` and includes:

- package manifest: name, version, catalog, registry ref, description, license
- source git/sha/subpath
- dependencies
- schema/eval/example path lists
- `no_evals`
- hosted runtime metadata
- component metadata: path, kind, summary, ports, effects, access, evals,
  examples, quality score, IR/source hashes, warnings
- quality summary
- hosted ingest projection

Status:

- Git-native package metadata and local catalog search are **Keep**.
- Metadata digest and hosted ingest projection are **Keep/Migrate**.
- Quality scoring is **Migrate** into stricter schema/eval/provider-aware
  checks.
- Hosted metadata should be **Migrate** away from generic "callable endpoint"
  fields toward runtime/provider requirements and artifact contracts.
- Package metadata must become a projection of package IR, not a separate
  compile path.

## Std, Co, And Examples Promises

Current visible package promises:

- `examples`: hello, selective recompute, run-aware brief, approval-gated
  release, company intake, examples quality eval
- `packages/std/roles`: reusable classifier, writer, planner, researcher,
  verifier, etc.
- `packages/std/controls`: fan-out, pipeline, map-reduce, guard, retry,
  fallback, race, refine
- `packages/std/composites`: worker-critic, ratchet, ensemble, oversight,
  dialectic, probes, blind review
- `packages/std/evals`: grader, inspector, regression tracker, improver,
  calibrator, cross-run differ
- `packages/std/delivery`: email, Slack, webhook, file, HTML, human gate
- `packages/std/memory`: project and user memory
- `packages/std/ops`: lint, preflight, status, profiler, diagnose, wire
- `packages/co`: generic company-as-code starter and eval

Status:

- The capability tour in `examples` is **Keep/Migrate**.
- Role, delivery, memory, ops, and co packages are **Migrate** into executable
  semantics with schemas, evals, and provider requirements.
- Controls and composites that use JavaScript-like `rlm(...)` sketches are
  **Replace** with executable control IR or **Delete/Demote** to documented
  patterns until supported.
- Eval components are **Replace/Migrate** into executable evals over run store
  records.

## Deletion And Replacement Candidates

These are not final deletions for this slice, but they should not be preserved
for compatibility:

- public `materialize` command as a first-class runtime surface
- fixture output maps as the main execution path
- raw execution text as runtime logic
- single-file compile as the canonical runtime contract
- empty `schemas`, `evals`, and `expansions` placeholder arrays
- simple YAML parser if it blocks package/source correctness
- package metadata generated by re-compiling each file independently
- remote execution envelope backed by fixture materialization
- loose run-directory scanning as the store API
- monolithic public type export from `src/types.ts`

## First Implementation Biases

- Build new architecture around `prose run`, not around `materialize`.
- Keep fixture execution, but demote it to an explicit provider.
- Prefer deleting old surfaces once replacement slices exist.
- Make package IR and local store APIs the center of gravity before adding
  provider integrations.
- Treat Pi SDK as the default real provider plan, but keep it behind the
  provider protocol.
