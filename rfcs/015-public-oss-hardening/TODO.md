# Public OSS Hardening TODO

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

This file is the working queue for the public OSS hardening pass. Add findings
here before fixing them so the package converges deliberately instead of
through scattered one-off edits.

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

### [todo] Single-run portability is conceptual but not implemented as a crisp contract

Finding: the North Star says a single component can still be handed to a
compatible one-off harness, while reactive graphs are Pi-backed. The code now
correctly rejects model providers as graph VMs, but the one-off harness contract
is not expressed as a first-class API or doc page.

Proposed fix:

- define the single-run harness boundary separately from graph VMs
- document what the OSS package supports today: Pi graph VM plus one-off
  component prompt/contract handoff
- avoid adding shell-out adapters unless they pass a concrete example and test
  gate

Checks:

- compile and run a single-component example through `prose run --graph-vm pi`
- add docs/tests only if the contract is executable today

## P1: Public Release Quality

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

### [todo] Package metadata source SHAs are stale after recent commits

Finding: `examples/prose.package.json` still references source SHA
`54dab36...`, and package metadata for `std` / `co` may also need either a real
SHA or an explicit policy for omitted source SHA during pre-release.

Proposed fix:

- decide whether local package manifests should track the current branch SHA or
  omit `source.sha` until release tagging
- update manifests and publish-check expectations accordingly
- add a helper/check if current-branch SHA drift should be caught

Checks:

- `bun run prose package examples --format json`
- `bun run prose publish-check examples --strict`
- `bun run prose publish-check packages/std --strict`
- `bun run prose publish-check packages/co --strict`
- `bun test test/package-registry.test.ts`

### [todo] Distribution packaging is not obviously npm-ready

Finding: `package.json` publishes `bin/prose.ts` as the executable while the
primary target is a Bun-compiled binary. `dist/package.json` is copied but still
points at the TypeScript entrypoint.

Proposed fix:

- define the intended OSS distribution story clearly: source package, Bun
  binary artifact, npm package, or all of the above
- make `dist/package.json` point at `./prose` if `dist/` is the binary package
- add a local pack/install smoke if npm-style distribution is intended

Checks:

- `bun run smoke:binary`
- optional local package smoke using a temp install directory
- `git diff --check`

### [todo] README and docs need a public-first pass

Finding: core docs are much better, but some pages still carry release-candidate
history, old "near-term" language, or confusing local/hosted phrasing.

Proposed fix:

- read `README.md`, `docs/why-and-when.md`, `docs/what-shipped.md`,
  `docs/inference-examples.md`, `docs/measurement.md`, and `docs/release-candidate.md`
  as a first-time OSS user
- remove stale "not yet" language where the feature now works
- keep hosted-platform ambitions distinct from OSS runtime guarantees

Checks:

- `rg -n "eventually|future work|near-term|Prose Complete|--provider|openai_compatible|direct provider" README.md docs`
- `bun test test/cli-ux.test.ts test/examples-tour.test.ts`

## P1: Runtime Robustness

### [todo] Hash helpers are string-only while manifests walk bytes

Finding: `sha256(value: string)` hashes strings. Remote artifact manifests read
files as bytes but convert them to UTF-8 before hashing. This is wrong for
binary artifacts and makes the `size_bytes` / hash contract less trustworthy.

Proposed fix:

- let `sha256` accept `string | Uint8Array | Buffer`
- hash raw bytes in `buildArtifactManifest`
- add a remote artifact fixture with non-UTF8/binary content

Checks:

- `bun test test/runtime-materialization.test.ts`
- focused new test for binary artifact hash preservation
- `bun run typecheck`

### [todo] Runtime stdout/stderr artifacts are empty in remote envelopes

Finding: `executeRemoteFile` writes empty `stdout.txt` and `stderr.txt`.
That is stable for contract fixtures, but real hosted workers will need useful
logs or a clear reason why traces are the only runtime log source.

Proposed fix:

- decide whether `runFile` should return captured runner logs or whether remote
  workers append their own logs outside the OSS runner
- if OSS owns logs, thread optional stdout/stderr through the remote API
- if host owns logs, document that `stdout.txt` / `stderr.txt` are host-filled
  artifacts and keep OSS fixtures empty

Checks:

- `bun test test/hosted-contract-fixtures.test.ts test/runtime-materialization.test.ts`
- inspect generated `fixtures/hosted-runtime/*`

### [todo] Local run-store layout is surprising

Finding: using `.prose/runs` as `runRoot` creates adjacent `.prose-store`.
The layout is functional, but a public user may expect all OpenProse state under
`.prose/`.

Proposed fix:

- either document the layout explicitly or migrate to `.prose/store`
- keep migration-free semantics acceptable because there are no users yet
- update tests that currently join `runRoot, ".prose-store"`

Checks:

- `rg -n "\\.prose-store" src test docs README.md`
- `bun test test/run-entrypoint.test.ts test/runtime-planning.test.ts test/trace-artifacts.test.ts`
- `bun run confidence:runtime`

### [todo] Run IDs and artifact IDs should be path/API safe

Finding: graph node run IDs and artifact IDs use colon-separated identifiers
such as `graph-run:review`. Store paths URL-encode them, but hosted APIs,
object storage keys, and logs may benefit from a stricter canonical ID format.

Proposed fix:

- define a canonical safe ID encoding for graph runs, node runs, attempts, and
  artifacts
- preserve human readability in display fields rather than filesystem/API IDs
- add tests that IDs are stable and safe across local store and remote envelope

Checks:

- `bun test test/run-entrypoint.test.ts test/runtime-control.test.ts test/runtime-materialization.test.ts`

### [todo] Schema validation depth needs a public contract

Finding: typed ports exist and many simple JSON/Markdown checks work, but the
package needs an explicit statement of which types are enforceable today and
which are registry/search labels only.

Proposed fix:

- audit `src/schema`, `src/runtime/bindings`, output validation, and package
  artifact contracts
- add docs for enforceable vs semantic types
- strengthen JSON schema validation if the TypeBox dependency can already do it
  cleanly

Checks:

- `bun test test/schema-validation.test.ts test/run-entrypoint.test.ts test/package-registry.test.ts`
- add focused tests for any newly enforced type behavior

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

## Intake Queue

Use this area for newly discovered issues before promoting them into a priority
section.

- [todo] Review whether `.prose/live-pi-agent/models.json` and live run
  directories are fully ignored and never leak secrets.
- [todo] Review whether generated HTML diagrams should be included in the
  public docs index or moved under a release/demo area.
- [todo] Consider a small `prose doctor` command only if repeated local setup
  problems appear during hardening.
