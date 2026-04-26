# Public OSS Hardening TODO

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

This file is the working queue for the public OSS hardening pass. Add findings
here before fixing them so the package converges deliberately instead of
through scattered one-off edits.

The stable audit inventory lives in [`FINDINGS.md`](FINDINGS.md). This TODO is
the execution queue; promote or refine findings here before implementing a
slice.

## Slice Protocol

For each slice:

- choose one small cluster from this file
- add or update focused tests before or with the fix
- run the relevant focused tests, then broader checks when the slice affects
  shared behavior
- update this file with the result
- add a signpost under `rfcs/015-public-oss-hardening/signposts/`
- commit and push `rfc/reactive-openprose`
- update and commit the platform submodule pointer on
  `reactive-openprose-platform`

## P0: Architectural Correctness

### [done] Remote execution must not fork the runtime model

Finding: `prose remote execute` forced an internal scripted Pi runtime profile
even when callers supplied an explicit runner/profile. This made hosted
execution look like a separate runtime architecture.

Resolved in commit: `f26b793 refactor: align remote execute runtime selection`

Checks:

- `bun test test/runtime-materialization.test.ts test/cli-ux.test.ts test/hosted-contract-fixtures.test.ts test/runtime-profiles.test.ts`
- `bun run typecheck`
- `git diff --check`

### [done] Public skills still describe the old VM model

Finding: `skills/open-prose/` still contains older Prose Complete, `state.md`,
harness-agnostic VM, and imperative filesystem-runtime docs. Those files are
likely the most confusing public artifact because they sound authoritative but
do not match the Pi graph-VM/node-runner/run-record architecture.

Proposed fix:

Resolved: replaced the large historical skill tree with a thin current skill
router plus README, and updated Claude command/plugin docs to route to the
actual CLI/graph-VM model.

Commit target: `docs: replace legacy open-prose skill surface`

Checks:

- `rg -n "Prose Complete|state\\.md|harness-agnostic|subagent|--provider|fixture materialize" skills/open-prose`
- `bun test test/source-tooling.test.ts test/cli-ux.test.ts`
- manual read-through of `skills/open-prose/SKILL.md`
- `bun run prose lint examples/north-star/company-signal-brief.prose.md`
- `bun run prose preflight examples/north-star/lead-program-designer.prose.md`
- `bun run prose run examples/north-star/company-signal-brief.prose.md --graph-vm pi ...`

### [done] Historical RFC notes still read like future implementation guides

Finding: `rfcs/013-*` signposts and phase docs intentionally preserve history,
but several files still advertise obsolete commands and provider concepts in
ways a new contributor could implement by mistake.

Resolved:

- kept historical signposts intact as past-tense evidence
- added current-architecture warning text to RFC 013 phase docs
- refreshed the RFC 013 phase index command examples to use `--graph-vm pi`
- added an implementation-notes README that explains older notes as an
  implementation diary, not current guidance

Commit target: `docs: mark historical runtime notes as superseded`

Checks:

- `rg -n "--provider|fixture provider|local-process provider|provider protocol|fixture materialize|prose materialize" rfcs`
- `bun test test/cli-ux.test.ts`

### [done] Single-run portability is conceptual but not implemented as a crisp contract

Finding: the North Star says a single component can still be handed to a
compatible one-off harness, while reactive graphs are Pi-backed. The code now
correctly rejects model providers as graph VMs, but the one-off harness contract
is not expressed as a first-class API or doc page.

Resolved:

- defined the single-run harness boundary separately from graph VMs
- added `prose handoff` to export a single executable component contract for a
  compatible one-off harness
- documented what the OSS package supports today: Pi graph VM plus one-off
  component prompt/contract handoff
- avoided shell-out adapters; handoff exports a contract and does not pretend
  external processes are graph VMs
  gate

Commit target: `feat: add single-run handoff`

Checks:

- `bun test test/single-run-handoff.test.ts test/module-boundaries.test.ts test/cli-ux.test.ts`
- `bun run prose handoff examples/north-star/company-signal-brief.prose.md --input signal_notes=test --input brand_context=test`
- `bun run prose run examples/north-star/company-signal-brief.prose.md --graph-vm pi --output company_signal_brief=test`

## P1: Public Release Quality

### [done] Changelog still describes removed runtime architecture as current

Finding: `CHANGELOG.md` says the unreleased local runtime materializes through
fixture, local-process, and Pi-compatible provider interfaces, and says
`prose fixture materialize` remains available. That is no longer true after
the Pi graph-VM and scripted-Pi cleanup.

Resolved:

- rewrite the unreleased section around the current graph-VM/node-runner model
- keep older dated sections as history, but make the unreleased section match
  the actual public CLI
- added an agent-entrypoint regression over the unreleased changelog

Checks:

- `rg -n -- "local-process|fixture materialize|prose fixture|provider interfaces" CHANGELOG.md`
- `bun test test/docs-public.test.ts`
- `bun test test/agent-entrypoints.test.ts test/docs-public.test.ts test/cli-ux.test.ts`

### [done] Skill and command sidecars lag the public docs

Finding: `skills/README.md` still describes the OpenProse VM skill as the
canonical VM definition, and `commands/` does not yet mention the new
`handoff` boundary. These are small files, but they are entry points for agents.

Resolved:

- refresh `skills/README.md` around the current skill router, CLI, and Pi graph
  VM
- add a `commands/prose-handoff.md` slash-command sidecar
- adjust command descriptions where they overstate eval/inspect behavior
- add regression coverage for skill/command sidecar vocabulary

Checks:

- `rg -n -- "old OpenProse VM|canonical definition|prose-handoff|handoff" skills commands`
- `bun test test/docs-public.test.ts test/cli-ux.test.ts`
- `bun test test/agent-entrypoints.test.ts test/docs-public.test.ts test/cli-ux.test.ts`

### [done] Measurement reports contain absolute local paths

Finding: committed measurement JSON/Markdown files include
`/Users/sl/code/openprose/...` paths. That makes the package look local and
agent-generated even though the evidence is useful.

Resolved:

- normalized generated package paths to repo/workspace-relative paths
- normalized live Pi run roots and run directories to repo-relative or `$TMP`
  display paths
- regenerated deterministic measurement and runtime-confidence reports
- preserved the committed successful live Pi evidence while normalizing its
  paths manually

Commit target: `docs: normalize measurement report paths`

Checks:

- `rg -n "/Users/sl|/var/folders|/tmp/openprose" docs/measurements`
- `bun run measure:examples`
- `bun run confidence:runtime`
- `bun scripts/live-pi-smoke.ts --tier cheap --skip --out /tmp/openprose-live-pi-skip.json`

### [done] Package metadata source SHAs are stale after recent commits

Finding: `examples/prose.package.json` still referenced source SHA
`54dab36...`, while `std` and `co` already used inferred git source metadata.
Branch-tip SHAs inside source manifests become stale on every commit.

Resolved:

- removed the explicit source block from the examples package manifest
- kept generated package metadata responsible for current source git, SHA, and
  package subpath
- verified strict publish checks still pass for examples, std, and co

Commit target: `chore: infer examples package source metadata`

Checks:

- `bun run prose package examples --format json`
- `bun run prose publish-check examples --strict`
- `bun run prose publish-check packages/std --strict`
- `bun run prose publish-check packages/co --strict`
- `bun test test/package-registry.test.ts`

### [done] Distribution packaging is not obviously npm-ready

Finding: `package.json` publishes `bin/prose.ts` as the executable while the
primary target is a Bun-compiled binary. `dist/package.json` is copied but still
points at the TypeScript entrypoint.

Resolved:

- `build:binary` now writes a binary-specific `dist/package.json`
- the dist package exposes `bin.prose` as `./prose`
- the dist package includes only the compiled binary in `files`

Commit target: `build: write binary package metadata`

Checks:

- `bun run smoke:binary`
- inspect `dist/package.json`
- `git diff --check`

### [done] README and docs need a public-first pass

Finding: core docs are much better, but some pages still carry release-candidate
history, old "near-term" language, or confusing local/hosted phrasing.

Resolved:

- read `README.md`, `docs/README.md`, `docs/why-and-when.md`,
  `docs/what-shipped.md`,
  `docs/inference-examples.md`, `docs/measurement.md`, and `docs/release-candidate.md`
  as a first-time OSS user
- replaced stale single-run examples with `prose handoff`
- renamed the public release-candidate surface to the runtime confidence gate
- removed old "near-term" and release-diary phrasing from authored docs
- added a docs regression test that blocks stale architecture vocabulary in
  public docs

Checks:

- `rg -n "eventually|future work|near-term|Prose Complete|--provider|openai_compatible|direct provider|fixture provider|local process|provider protocol" README.md docs -S`
- `bun test test/cli-ux.test.ts test/examples-tour.test.ts`
- `bun test test/docs-public.test.ts test/cli-ux.test.ts test/examples-tour.test.ts`

### [done] Historical provider RFCs are still too easy to mistake for current architecture

Finding: the active docs now distinguish Pi graph VM, model providers, and
single-run harnesses, but older RFC 013 provider-protocol phase pages still
contain detailed implementation language for fixture/local-process/providers.
Even with guardrail headers, they show up in repository search and can look
like instructions for new contributors.

Resolved:

- keep the historical record but make the current architecture impossible to
  miss at the phase-directory entry points
- rename or summarize obsolete provider-protocol pages where a short historical
  stub is safer than a full stale implementation guide
- preserve signposts as evidence, not instructions
- added a regression test that keeps the RFC 013 provider phase pages as
  historical stubs instead of implementation playbooks

Checks:

- `rg -n "fixture provider|local process provider|provider protocol|optional CLI adapters" rfcs/013-ideal-oss-package-restructure/phases/04-provider-protocol`
- `rg -n 'Commit as|Build:|Tests:|ProviderRequest|ProviderResult' rfcs/013-ideal-oss-package-restructure/phases/04-provider-protocol`
- `bun test test/rfc-history.test.ts test/docs-public.test.ts`
- manual read-through of the Phase 04 entry point from a first-time contributor perspective

### [done] Package publication surface is still split between source package and binary package

Finding: `build:binary` writes a clean `dist/package.json`, but source
`package.json` still points `bin.prose` at `./bin/prose.ts` and has no public
`exports`/`files` boundary. If the OSS package is shipped primarily as a Bun
binary, the source package should make that explicit and avoid ambiguous Node
package expectations.

Resolved:

- made the repository root package an explicit private source workspace
- removed the root package-manager `bin` so direct npm publication from the
  source tree is not implied
- kept `bun run prose` as the source-workspace developer entry point
- expanded generated `dist/package.json` metadata as the publishable binary
  package surface
- documented the source-workspace versus dist-binary distinction in public docs
- added a regression test for both package surfaces

Checks:

- `bun run smoke:binary`
- inspect root `package.json` and `dist/package.json`
- `bun test test/binary-package.test.ts test/docs-public.test.ts`
- `bun run typecheck`

## P1: Runtime Robustness

### [done] Old fixture materializer remains a public API seam

Finding: `src/materialize.ts` still implements the older caller-output
materializer, `src/runtime/index.ts` exports it, and several tests use it
directly. The public CLI path is correct, but the source API still exposes the
pre-Pi mental model.

Resolved:

- migrated deterministic runtime/planning tests to `runSource` with scripted
  Pi outputs
- deleted `src/materialize.ts` instead of quarantining it as a fixture helper
- removed `materializeFile` / `materializeSource` from the public runtime
  barrel and test support
- added a module-boundary regression that keeps the old seam out of
  `src/index.ts`
- fixed the real behavior gap exposed by the migration: a one-component
  `kind: program` source now executes as a graph run, not a direct component
  run

Checks:

- `rg -n "materializeFile|materializeSource" src test`
- `bun test test/runtime-materialization.test.ts test/runtime-planning.test.ts test/package-registry.test.ts`
- `bun test test/runtime-materialization.test.ts test/runtime-planning.test.ts test/runtime-profiles.test.ts test/module-boundaries.test.ts test/package-registry.test.ts`
- `bun test`
- `bun run confidence:runtime`
- `bun run typecheck`

### [done] Runtime preflight does not verify Pi runtime-profile readiness

Finding: `prose preflight` checks package dependencies and declared component
environment variables, but it does not classify missing Pi model-provider
settings, API key setup, model availability, session persistence paths, or live
runtime timeout configuration.

Resolved:

- added a structured runtime section to `PreflightResult`
- classified scripted Pi, live model profile, live auth, session persistence,
  and timeout readiness
- kept missing live inference credentials advisory so deterministic scripted-Pi
  runs still pass when source/dependency checks pass
- redacted secret values by reporting only environment variable names
- documented the new runtime readiness surface in the preflight command sidecar
  and public inference docs

Checks:

- `bun test test/runtime-profiles.test.ts test/cli-ux.test.ts`
- `bun test test/source-tooling.test.ts test/runtime-profiles.test.ts test/cli-ux.test.ts`
- manual `bun run prose preflight examples/north-star/lead-program-designer.prose.md`
- `bun run typecheck`

### [done] Pi session persistence is not visibly tied to the OpenProse run/store model

Finding: Pi sessions are persisted when `persist_sessions` is true, but the
default session path and the relationship between Pi session files, run
records, and `.prose/store` are not obvious from records or docs.

Resolved:

- replaced serialized attempt `node_session_ref` strings with structured
  `node_session` objects
- kept session file metadata relative to the node workspace when possible
- made trace text render session id and session file for recorded attempts
- documented the graph node / attempt / Pi session relationship in inference
  docs
- kept pre-session gates explicit with `node_session: null`

Checks:

- `bun test test/run-attempts.test.ts test/run-entrypoint.test.ts test/scripted-pi-session.test.ts test/runtime-planning.test.ts`
- `bun run typecheck`
- manual `prose trace` smoke over a deterministic graph run

### [done] Hash helpers are string-only while manifests walk bytes

Finding: `sha256(value: string)` hashes strings. Remote artifact manifests read
files as bytes but convert them to UTF-8 before hashing. This is wrong for
binary artifacts and makes the `size_bytes` / hash contract less trustworthy.

Resolved:

- `sha256` now accepts strings and byte arrays
- `buildArtifactManifest` hashes raw bytes directly
- added a non-UTF8 binary artifact regression test

Commit target: `fix: hash remote artifact bytes directly`

Checks:

- `bun test test/runtime-materialization.test.ts`
- focused new test for binary artifact hash preservation
- `bun run typecheck`

### [done] Runtime stdout/stderr artifacts are empty in remote envelopes

Finding: `executeRemoteFile` writes empty `stdout.txt` and `stderr.txt`.
That is stable for contract fixtures, but real hosted workers will need useful
logs or a clear reason why traces are the only runtime log source.

Resolved:

- kept deterministic fixtures empty by default
- added optional `stdout` / `stderr` content to the remote envelope writer API
- documented that hosted workers should fill these artifacts with host logs
  while OpenProse traces remain the canonical runtime timeline
- added a regression test proving host-provided logs are preserved in the
  artifact manifest

Commit target: `feat: allow remote envelopes to include host logs`

Checks:

- `bun test test/hosted-contract-fixtures.test.ts test/runtime-materialization.test.ts`
- inspect generated `fixtures/hosted-runtime/*`

### [done] Local run-store layout is surprising

Finding: using `.prose/runs` as `runRoot` creates adjacent `.prose-store`.
The layout is functional, but a public user may expect all OpenProse state under
`.prose/`.

Resolved:

- default `.prose/runs` now stores local store metadata under `.prose/store`
- arbitrary custom run roots still use `<runRoot>/.prose-store`
- trace lookup understands the new `.prose/store` default layout
- added unit and integration tests for the default layout

Commit target: `refactor: separate default prose store layout`

Checks:

- `rg -n "\\.prose-store" src test docs README.md`
- `bun test test/run-entrypoint.test.ts test/runtime-planning.test.ts test/trace-artifacts.test.ts`
- `bun run confidence:runtime`

### [done] Run IDs and artifact IDs should be path/API safe

Finding: graph node run IDs and artifact IDs use colon-separated identifiers
such as `graph-run:review`. Store paths URL-encode them, but hosted APIs,
object storage keys, and logs may benefit from a stricter canonical ID format.

Resolved:

- kept human-readable run, attempt, and artifact IDs stable in records
- confirmed local store paths URL-encode run IDs, node IDs, and port IDs before
  using them as path segments
- added explicit attempt/artifact path-encoding regressions

Commit target: `test: lock path-safe store ids`

Checks:

- `bun test test/run-entrypoint.test.ts test/runtime-control.test.ts test/runtime-materialization.test.ts`

### [done] Schema validation depth needs a public contract

Finding: typed ports exist and many simple JSON/Markdown checks work, but the
package needs an explicit statement of which types are enforceable today and
which are registry/search labels only.

Resolved:

- audited `src/schema`, `src/runtime/bindings`, output validation, and package
  artifact contracts
- added public docs for enforceable vs semantic types
- strengthened deterministic validation for primitive `Json<T>`, primitive
  arrays, and run reference type tags
- added regression tests for the enforceable/schema-label boundary

Commit target: `feat: strengthen schema validation contract`

Checks:

- `bun test test/schema-resolution.test.ts test/run-entrypoint.test.ts test/package-registry.test.ts`
- add focused tests for any newly enforced type behavior

### [todo] Named schema definitions are still mostly semantic metadata

Finding: the docs now honestly state that named aliases such as
`Json<CompanyProfile>` are not structurally enforced without resolved schema
definitions. For registry-scale composition, that likely needs to become real
resolution instead of only documentation.

Proposed fix:

- load package-local schema resources and `$defs` during validation
- validate named `Json<T>` inputs/outputs when the schema is available
- keep unresolved names as warnings or semantic labels, not false guarantees

Checks:

- `bun test test/schema-resolution.test.ts test/package-registry.test.ts`
- add package-local schema fixtures with pass/fail payloads

## P1: Example And Stdlib Quality

### [todo] Stdlib programs may still read as imperative scripts

Finding: some stdlib components, especially delivery/ops adapters, still carry
old "write a script/use Bash/curl" phrasing. That can be okay for mutating
adapter contracts, but the public standard library should showcase contract
quality rather than ad hoc agent instructions.

Proposed fix:

- audit `packages/std` for imperative host-specific instructions
- keep environment/capability requirements explicit
- rewrite components toward typed inputs/outputs, declared effects, and
  acceptance criteria

Checks:

- `bun run prose lint packages/std`
- `bun run prose publish-check packages/std --strict`
- `bun test test/std-roles.test.ts test/std-evals.test.ts`

### [todo] Stdlib controls and composites may overpromise runtime semantics

Finding: `packages/std/controls` and `packages/std/composites` define useful
agent topology patterns, but the runtime currently executes compiled graph
nodes rather than native map/reduce, race, retry, fallback, or composite control
semantics. The docs should either mark those as contract patterns or the
runtime should implement the semantics they imply.

Proposed fix:

- audit each control/composite for claims that exceed runtime behavior
- decide which patterns remain declarative contracts versus native runtime
  operators
- add tests for any pattern that claims executable semantics

Checks:

- `bun run prose publish-check packages/std --strict`
- `bun test test/composite-expansion.test.ts test/std-patterns.test.ts`

### [done] Stdlib ops programs still target `state.md`-era run folders

Finding: `packages/std/ops/diagnose.prose.md` still says failed runs are
missing `state.md`, looks for `---end` / `---error` markers, and reads
`services/*.md` snapshots. Current OpenProse runs are `run.json`, `trace.json`,
store attempts, artifacts, node records, and bindings.

Resolved:

- rewrote ops contracts around current run, trace, store, and artifact files
- removed unresolved internal `Services` lists from self-contained ops programs
- adjusted directory linting so ordinary docs like `README.md` are not treated
  as legacy executable source unless they contain a contract
- added a focused test that public std ops sources do not mention obsolete
  `state.md` runtime artifacts

Commit target: `docs: update std ops run artifacts`

Checks:

- `bun run prose lint packages/std/ops`
- `bun run prose publish-check packages/std --strict`
- `bun test test/std-patterns.test.ts`

### [done] Delivery adapters embed host-specific shell/Python implementation recipes

Finding: delivery adapters should be reusable contracts with declared effects
and environment requirements. `email-notifier` currently includes a full Python
SMTP script and `curl` recipes aimed at a specific chat/tool host. That makes
the standard library look like skill spaghetti instead of contract-first agent
software.

Resolved:

- replaced long host-specific scripts with concise protocol requirements,
  invariants, provider options, and acceptance criteria
- preserved enough operational detail for an agent to send correctly
- kept mutating effects explicit and approval-friendly
- added a focused test that delivery contracts compile, lint, and avoid
  host-specific implementation recipes

Commit target: `docs: simplify std delivery adapters`

Checks:

- `rg -n "Bash tool|write a Python script|curl via|Claude Code|/tmp/send_email.py" packages/std/delivery`
- `bun run prose lint packages/std/delivery`
- `bun run prose publish-check packages/std --strict`

### [todo] The company starter package should match the new best-practice shape

Finding: `packages/co` is useful but thin. It should be clearly positioned as
the reusable starter kit for Company as Code and stay aligned with the richer
`customers/prose-openprose` reference repo.

Proposed fix:

- compare `packages/co` with the current customer reference implementation
- add only reusable starter surfaces, not customer-specific content
- keep examples runnable through scripted Pi and eventually live Pi

Checks:

- `bun run prose publish-check packages/co --strict`
- `bun test test/co-package.test.ts`

### [todo] Example evidence should separate stable fixtures from live evidence

Finding: examples now have good live Pi evidence, but generated reports and
fixtures can blur deterministic backpressure with live inference confidence.

Proposed fix:

- make docs label deterministic, scripted Pi, and live Pi evidence consistently
- keep live reports opt-in and low-cost
- consider a generated index of "known-good example ladders"

Checks:

- `bun run confidence:runtime`
- `OPENPROSE_LIVE_PI_SMOKE=1 ... bun run smoke:live-pi -- --tier cheap`

## P2: API And Ergonomics

### [todo] Runtime-profile CLI ergonomics are env-heavy

Finding: `prose run` and `prose remote execute` can select `--graph-vm pi`, but
model provider/model/thinking/session persistence are primarily configured by
environment. That is safe for now but can feel hidden.

Proposed fix:

- decide whether to add explicit `--model-provider`, `--model`, `--thinking`,
  and `--persist-sessions` flags
- keep env vars as CI-friendly defaults
- ensure flags never reintroduce model providers as graph VMs

Checks:

- `bun test test/runtime-profiles.test.ts test/cli-ux.test.ts test/run-entrypoint.test.ts`

### [todo] Trace telemetry may omit cost/token details that Pi exposes

Finding: Pi events are normalized well, but cost/token usage may still be null
or unavailable in traces. This is important for measuring reactive graph wins.

Proposed fix:

- inspect Pi SDK event payloads from live runs
- add token/cost capture when available
- keep traces stable when providers omit usage

Checks:

- `bun test test/pi-events.test.ts test/live-pi-smoke.test.ts`
- optional live cheap smoke

### [todo] Error handling should be consistent across commands

Finding: `remote execute` now uses `formatError`, but other CLI paths may still
print raw stack traces or inconsistent actionable text.

Proposed fix:

- audit command branches in `src/cli.ts`
- add CLI UX tests for representative blocked/failure cases
- prefer concise errors with no stack unless debugging is explicitly requested

Checks:

- `bun test test/cli-ux.test.ts`
- manual CLI probes for `compile`, `run`, `remote execute`, `publish-check`

### [todo] Public API vocabulary should finish the provider-to-node-runner cleanup

Finding: source files now live under `node-runners`, but some public types,
historical docs, and error-path names still use provider/protocol vocabulary.
Some of that is acceptable history; public API exports should be intentional.

Proposed fix:

- audit exported names and docs for provider/protocol vocabulary
- keep `model_provider` where it means model vendor
- prefer graph VM, node runner, runtime profile, and single-run handoff for
  runtime architecture

Checks:

- `rg -n -- "provider protocol|OpenProse provider|provider interfaces|Graph VM|node runner" src docs README.md skills commands`
- `bun test test/module-boundaries.test.ts test/node-runner-protocol.test.ts`

## Intake Queue

Use this area for newly discovered issues before promoting them into a priority
section.

- [todo] Review whether `.prose/live-pi-agent/models.json` and live run
  directories are fully ignored and never leak secrets.
- [todo] Review whether generated HTML diagrams should be included in the
  public docs index or moved under a release/demo area.
- [todo] Consider a small `prose doctor` command only if repeated local setup
  problems appear during hardening.
