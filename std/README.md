# OpenProse Standard Library

The standard library ships with every OpenProse installation. It provides reusable components for building Prose programs -- roles that handle common single-agent tasks, composites that wire agents into multi-agent topologies, controls that manage execution flow, and services for delivery, memory, ops, and evaluation. Reference them with `services: [std/roles/researcher, std/composites/worker-critic]` in your program frontmatter. All components follow the same contract surface (`requires`, `ensures`, `errors`, `invariants`, `strategies`) as any Prose component you write yourself.

## Architecture

The standard library is organized into seven categories. They form a natural hierarchy: roles are atoms, composites are molecules, and controls are the bonds between them. The remaining four categories handle everything outside core computation.

```
  roles/          Single-agent behaviors. The leaf nodes.
  composites/     Multi-agent topologies. Structural patterns that wire roles together.
  controls/       Flow patterns. Sequencing, parallelism, gating, retry.
  delivery/       Output services. Human review, notifications, rendering, file export.
  memory/         Persistence. Project and user knowledge across runs.
  ops/            Developer tools. Lint, profile, diagnose, wire.
  evals/          Measurement. Inspect runs, grade contracts, track regressions, improve programs.
```

**Roles** do work. A `researcher` finds information; a `critic` evaluates quality; a `formatter` structures output. Each role has a contract and does one thing well.

**Composites** arrange roles into topologies. A `worker-critic` loop produces work and refines it. An `ensemble-synthesizer` fans out to K agents and merges their output. A `dialectic` pits two positions against each other. Composites declare slots that you fill with roles or custom services.

**Controls** govern execution flow. A `pipeline` chains stages sequentially. A `fan-out` runs stages in parallel. A `guard` checks a precondition before proceeding. Controls are orthogonal to composites -- you can pipeline composites, guard a role, or fan-out across pipelines.

**Delivery** handles output to the world -- approvals via `human-gate`, notifications via Slack/email/webhook, rendered artifacts via `html-renderer`, raw files via `file-writer`.

**Memory** provides persistence across runs. `project-memory` stores knowledge scoped to a project directory. `user-memory` stores knowledge scoped to a user across all projects.

**Ops** are developer tools invoked via `prose` CLI commands. `prose lint` validates your program. `prose run std/ops/profiler` profiles a run. These are Prose programs themselves -- the CLI is extensible by adding to `std/ops/`.

**Evals** measure and improve. `inspector` evaluates a completed run. `contract-grader` scores how well outputs satisfy their contracts. `program-improver` rewrites a program based on eval results. The eval loop is the mechanism by which programs get better over time.

## Quick Reference

### Roles

| Component | Description |
|-----------|-------------|
| `classifier` | Categorize input into a defined set of labels |
| `critic` | Evaluate quality; accept or reject with reasoning |
| `extractor` | Map unstructured input to a typed schema |
| `formatter` | Transform content into a specified output format |
| `planner` | Decompose a goal into an ordered set of steps |
| `researcher` | Find and synthesize information from available sources |
| `router` | Direct input to the appropriate downstream service |
| `summarizer` | Compress content while preserving key information |
| `verifier` | Check formal correctness against a specification |
| `writer` | Produce written content from a brief or outline |

### Composites -- Structural Patterns

| Component | Slots | Description |
|-----------|-------|-------------|
| `worker-critic` | worker, critic | Produce work, evaluate, retry until accepted |
| `ensemble-synthesizer` | ensemble_member, synthesizer | K agents work independently, synthesizer merges |
| `proposer-adversary` | proposer, adversary | Propose then attack; parent decides |
| `dialectic` | thesis, antithesis | Argue opposing positions; disagreement is the output |
| `ratchet` | advancer, ratchet | Advance state and certify; never roll back |
| `oversight` | actor, observer, arbiter | Actor works, observer monitors, arbiter resolves |

### Composites -- Measurement Instruments

| Component | Slots | Description |
|-----------|-------|-------------|
| `blind-review` | reviewer, subject | Evaluate without knowledge of source or prior scores |
| `stochastic-probe` | prober, target | Randomly sample outputs to detect systematic issues |
| `assumption-miner` | miner, target | Surface unstated assumptions in reasoning |
| `coherence-probe` | prober, target | Test internal consistency across outputs |
| `contrastive-probe` | prober, target | Compare outputs under controlled variations |

### Controls

| Component | Slots | Description |
|-----------|-------|-------------|
| `pipeline` | stages[] | Sequential transformation chain |
| `map-reduce` | mapper, reducer | Split input, delegate in parallel, merge results |
| `guard` | guard, target | Check precondition; fail fast if unmet |
| `refine` | refiner, evaluator | Iteratively improve output to a quality threshold |
| `retry-with-learning` | target | Retry with failure analysis between attempts |
| `fan-out` | targets[] | Run multiple services in parallel on the same input |
| `race` | targets[] | Run multiple services in parallel, take the first result |
| `fallback-chain` | targets[] | Try services in order; stop at first success |

### Delivery

| Component | Description |
|-----------|-------------|
| `human-gate` | Pause execution for human approval before proceeding |
| `slack-notifier` | Send results to a Slack channel or thread |
| `email-notifier` | Send results via email |
| `webhook-notifier` | POST results to an HTTP endpoint |
| `html-renderer` | Render output as a styled HTML artifact |
| `file-writer` | Write output to a file on disk |

### Memory

| Component | Description |
|-----------|-------------|
| `project-memory` | Persist and retrieve knowledge scoped to the current project |
| `user-memory` | Persist and retrieve knowledge scoped to the current user |

### Ops

| Component | CLI Sugar | Description |
|-----------|-----------|-------------|
| `lint` | `prose lint` | Validate structure, schema, shapes, and contracts |
| `preflight` | `prose preflight` | Check dependencies and environment variables |
| `wire` | -- | Run Forme wiring and produce a manifest without executing |
| `status` | `prose status` | Show recent runs and their outcomes |
| `profiler` | -- | Profile a run: token usage, latency, cost per service |
| `diagnose` | -- | Analyze a failed run and suggest fixes |

### Evals

| Component | CLI Sugar | Description |
|-----------|-----------|-------------|
| `inspector` | `prose inspect` | Evaluate a completed run against its contracts |
| `eval-calibrator` | -- | Calibrate evaluation criteria across multiple runs |
| `contract-grader` | -- | Score how well outputs satisfy their ensures clauses |
| `cross-run-differ` | -- | Diff outputs across runs to surface behavioral changes |
| `regression-tracker` | -- | Detect quality regressions across program versions |
| `program-improver` | -- | Rewrite a program based on eval results |
| `platform-improver` | -- | Suggest improvements to the VM or runtime based on run data |

## Decision Matrix

| When you need to... | Reach for |
|---------------------|-----------|
| Run a single focused task (summarize, classify, extract) | A **role** (`summarizer`, `classifier`, `extractor`) |
| Produce work and check its quality | `worker-critic` composite with a `critic` role |
| Run K agents and merge their perspectives | `ensemble-synthesizer` composite |
| Stress-test reasoning by arguing both sides | `dialectic` or `proposer-adversary` composite |
| Ensure a step never regresses | `ratchet` composite with a `verifier` role |
| Add human approval to a workflow | `human-gate` delivery service |
| Chain transformations sequentially | `pipeline` control |
| Process items in parallel and merge | `map-reduce` control |
| Block execution on a precondition | `guard` control |
| Iteratively improve until good enough | `refine` control |
| Try alternatives until one works | `fallback-chain` control |
| Fan out the same input to multiple services | `fan-out` control |
| Race services and take the fastest answer | `race` control |
| Find information on the web or from sources | `researcher` role |
| Route input to different handlers | `router` role |
| Break a complex goal into steps | `planner` role |
| Produce polished written output | `writer` role with `formatter` role |
| Detect hidden assumptions in reasoning | `assumption-miner` measurement instrument |
| Test consistency of outputs | `coherence-probe` measurement instrument |
| Evaluate a completed run | `inspector` eval |
| Track quality across versions | `regression-tracker` eval |
| Improve a program based on evidence | `program-improver` eval |

## Usage

### Importing components

Reference standard library components in your program's `services` list using the `std/` prefix:

```yaml
---
name: my-research-program
kind: program
services: [std/roles/researcher, std/composites/worker-critic, my-synthesizer]
---
```

Components from `std/` are resolved automatically. No `prose install` needed.

### Running ops programs

Ops programs with CLI sugar run directly:

```bash
prose lint my-program.md
prose preflight my-program.md
prose status
prose inspect 20260408-143052-a7b3c9
```

Ops and evals without CLI sugar run via `prose run`:

```bash
prose run std/ops/profiler -- subject: 20260408-143052-a7b3c9
prose run std/ops/diagnose -- subject: 20260408-143052-a7b3c9
prose run std/evals/contract-grader -- subject: 20260408-143052-a7b3c9
prose run std/evals/cross-run-differ -- runs: 20260408-143052-a7b3c9,20260408-150000-b8c4d0
```

### Filling composite slots

Composites declare named slots. You fill them with roles, other std components, or your own services:

```yaml
---
name: research-review
kind: program
services: [std/composites/worker-critic, std/roles/researcher, std/roles/critic]
---
```

The `worker-critic` composite has `worker` and `critic` slots. Forme auto-wires `researcher` into the `worker` slot and `critic` into the `critic` slot by matching contracts.

## Versioning

All standard library components are at **0.1.0**. The library follows semver:

- **Patch** (0.1.x) -- Bug fixes, documentation, improved prompts. No contract changes.
- **Minor** (0.x.0) -- New components, new optional `requires` fields. Backward compatible.
- **Major** (x.0.0) -- Breaking contract changes. Renamed `requires` or `ensures` fields, removed components.

Breaking changes are documented in the [changelog](../CHANGELOG.md). Removed components are listed with their recommended replacements.
