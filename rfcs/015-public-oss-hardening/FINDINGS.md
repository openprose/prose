# Public OSS Hardening Findings

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

This is the stable inventory for the final public OSS hardening pass. The
working execution queue is [`TODO.md`](TODO.md); promote findings there before
fixing them. This keeps the package from improving by scattered instinct and
lets each slice carry focused tests, a signpost, a commit, and a platform
submodule update.

## North Star Filter

OpenProse should read and behave like:

- a contract-first, `.prose.md` language for agent outcomes
- a compiler to deterministic IR
- a Pi-backed reactive graph VM, with one persisted node session per selected
  graph node
- runs as universal materialization records
- typed ports, effects, evals, policy labels, packages, and traces as the
  engineering discipline around agent workflows
- single-component handoff as the portability boundary for other harnesses
- hosted registry/runtime as consumers of the same OSS run/artifact contract

Anything that still teaches "flat providers," "fixture materialization,"
"simulate the VM in chat," or "a command process is the graph VM" is suspect.

## Recently Resolved In This Pass

- Public docs now use `prose handoff` for single-component portability.
- The docs index and runtime checklist now say "runtime confidence gate" rather
  than release-candidate diary.
- Stdlib ops contracts now describe current `run.json`, `trace.json`,
  artifact, attempt, and store records instead of `state.md`.
- Delivery adapters no longer embed host-specific shell/Python recipes.
- Remote host logs can be preserved in hosted envelopes.
- Schema validation has a public enforced-versus-semantic contract.

## Open Findings

### F001: Historical RFC provider pages are still too detailed

`rfcs/013-ideal-oss-package-restructure/phases/04-provider-protocol/` still
contains full implementation plans for provider protocol, fixture provider,
local-process provider, optional CLI adapters, and provider registry work. It
has guardrail headers, but repository search still makes those pages look like
instructions.

Recommended treatment: preserve signposts as history, but collapse the phase
pages into shorter historical stubs that point to RFC 014 and current
node-runner/graph-VM vocabulary.

### F002: The changelog describes removed runtime architecture as current

`CHANGELOG.md` says the unreleased runtime materializes through fixture,
local-process, and Pi-compatible provider interfaces, and says `prose fixture
materialize` remains available. That is no longer true.

Recommended treatment: rewrite only the unreleased section around the current
Pi graph VM, scripted Pi deterministic path, handoff boundary, and runtime
confidence gate. Keep dated historical releases intact.

### F003: Skill and command sidecars lag the current model

`skills/README.md` still describes the skill as the canonical VM definition and
OpenProse Cloud implementation spec. `commands/` has no `prose-handoff.md` and
some command wording predates the confidence-gate docs.

Recommended treatment: refresh these as agent entry points, not big public docs.
They should route to the CLI, current docs, and Pi graph-VM model.

### F004: `src/materialize.ts` is an old runtime seam

The public CLI no longer exposes `prose materialize`, but `src/materialize.ts`
still implements the older caller-output materializer, `src/runtime/index.ts`
exports it, and many tests use it directly. This keeps the pre-Pi mental model
alive in the source API.

Recommended treatment: migrate tests to `runSource` with scripted Pi outputs,
then delete `src/materialize.ts` or quarantine it as an internal test helper.
Do not preserve a public compatibility layer.

### F005: Runtime preflight is source-aware but not runtime-profile-aware

`prose preflight` checks package dependencies and declared component
environment variables. It does not yet classify Pi runtime readiness: model
provider, model ID, API key setup, model registry availability, session
persistence paths, timeout, or live-smoke eligibility.

Recommended treatment: add runtime-profile preflight output that separates
deterministic/scripted readiness from opt-in live Pi readiness, without logging
secret values.

### F006: Pi session persistence needs a clearer run/store relationship

Pi sessions persist by default, but the default storage path and relationship
between Pi session files, run records, traces, and `.prose/store` are not
obvious. The ideal package should make session provenance inspectable without
leaking local absolute paths.

Recommended treatment: verify Pi SDK defaults, prefer explicit `.prose` scoped
session directories where possible, and add trace tests for relative session
refs.

### F007: Named schema definitions are not structurally enforced

Primitive JSON, arrays, and run references are enforced. Named shapes such as
`Json<CompanyProfile>` are still mostly semantic package metadata unless a
schema resolver is added.

Recommended treatment: resolve package-local schemas and `$defs`, validate
named `Json<T>` when definitions are available, and keep unresolved names as
explicit semantic labels or warnings.

### F008: Stdlib controls and composites may overpromise runtime semantics

`packages/std/controls` and `packages/std/composites` include patterns such as
map-reduce, race, fallback, retry, worker-critic, and oversight. They are
useful contracts, but the runtime does not yet have native control semantics
for every pattern.

Recommended treatment: either frame these as declarative contract patterns or
implement tested runtime semantics for the patterns we want to claim.

### F009: The `co` starter package is useful but thin

`packages/co` currently focuses on `company-repo-checker`. It is directionally
right but not yet the reusable Company-as-Code starter kit implied by the
reference customer repo.

Recommended treatment: compare against `customers/prose-openprose`, add only
generic starter surfaces, and keep all new programs publish-checkable and
runnable through scripted Pi.

### F010: Example evidence should keep deterministic and live confidence apart

The example ladder now has deterministic tests and live Pi smoke reports. The
docs should continue to make it impossible to confuse deterministic scripted
Pi confidence with paid live inference confidence.

Recommended treatment: keep deterministic evidence required, live evidence
opt-in, and consider a generated "known good ladder" index.

### F011: Runtime-profile CLI ergonomics are still environment-heavy

`--graph-vm pi` is explicit, but model provider, model ID, thinking level,
session directories, and timeout mainly flow through `OPENPROSE_PI_*` env vars.
That is CI-friendly but not maximally discoverable.

Recommended treatment: consider explicit runtime-profile flags while keeping
env vars as defaults. Do not reintroduce model providers as graph VMs.

### F012: Trace telemetry does not yet capture cost/token usage when available

Node result cost is currently often `null`. Reactive savings become much more
persuasive when traces can show token/cost deltas for re-used versus re-run
nodes.

Recommended treatment: inspect real Pi event payloads, capture usage when
available, and keep traces stable when providers omit usage.

### F013: CLI error handling is better but uneven

Some commands use `formatError`; others print raw `error.message`. Missing
paths and blocked runs are mostly actionable, but this should be audited before
public release.

Recommended treatment: add representative CLI UX tests for compile, run,
remote execute, publish-check, handoff, install, and preflight failures.

### F014: Package publication surface is not fully settled

The binary dist package is now clean, but root `package.json` still points
`bin.prose` at `./bin/prose.ts` and has no explicit `exports` or `files`
boundary. That may be acceptable for a Bun-source package, but it is ambiguous
for public npm users.

Recommended treatment: decide whether the root package is source-only,
Bun-only, or directly publishable. Make README, `package.json`,
`dist/package.json`, and smoke tests agree.

### F015: Public API vocabulary should finish the provider-to-node-runner cleanup

The source tree now uses `node-runners`, but older provider/protocol language
still appears in historical docs and some exported names or tests. The word
`model_provider` is correct; "OpenProse provider protocol" is not the ideal
runtime architecture.

Recommended treatment: keep `model_provider` where it means model vendor, and
prefer graph VM, node runner, runtime profile, and single-run handoff elsewhere.

### F016: Hosted/platform fixture consumption is still a follow-up

The OSS package has hosted-runtime fixtures and remote envelopes. Platform
tests should vendor/consume those fixtures directly so hosted execution cannot
drift from the OSS contract.

Recommended treatment: leave this outside the OSS hardening implementation
unless fixture shape changes, but keep it visible for the platform workstream.

### F017: Live secrets and generated run state need one more leak check

The live Pi ladder writes `.prose/live-pi-agent/models.json` and live run
directories. The current docs normalize paths, but release hardening should
verify ignore rules and reports never commit secrets or private local paths.

Recommended treatment: add an ignore/leak regression if practical, and keep
live reports path-normalized.

## Not Findings

- Historical signposts can keep past commands when they are clearly signposts.
- "Materialized run" remains valid vocabulary for durable run records.
- `model_provider` remains valid inside Pi runtime profiles.
- Deterministic `--output` remains valid as a scripted Pi test path.
