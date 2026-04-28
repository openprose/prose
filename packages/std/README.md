# OpenProse Standard Library

Reusable Contract Markdown programs, services, composites, controls, roles, and memory agents for OpenProse.

For the modern overview first, start with:

- [`../../docs/README.md`](../../docs/README.md)
- [`../../docs/why-and-when.md`](../../docs/why-and-when.md)
- [`../../examples/README.md`](../../examples/README.md)

## Usage

```prose
use "std/evals/inspector"
use "std/composites/worker-critic"
use "std/controls/pipeline"
use "std/roles/critic"
use "std/delivery/email-notifier"
use "std/memory/project-memory"
```

Install with `prose install`. `std/...` is the shorthand for
`github.com/openprose/prose/packages/std/...`; see
[`docs/package-publication.md`](../../docs/package-publication.md) for the
source-workspace and generated-package boundary.

```bash
bun run prose install registry://openprose/@openprose/std@0.11.0-dev \
  --catalog-root packages \
  --workspace-root /tmp/openprose-workspace
```

## Library

All executable library entries now use the canonical `.prose.md` Contract Markdown form (`### Services`, `### Requires`, `### Ensures`, and related sections).

### evals/

Run-store-native eval contracts for checking OpenProse runs, packages, and
platform behavior. These are `kind: test` components with JSON verdict outputs
that can be used as acceptance gates for local and hosted runs.

| Eval | Purpose |
|------|---------|
| `inspector` | Post-run analysis — runtime fidelity and task effectiveness |
| `contract-grader` | Scores a program against its declared contract |
| `regression-tracker` | Tracks quality regressions across runs |
| `cross-run-differ` | Compares runs and recommends follow-up investigation |
| `eval-calibrator` | Validates light evals against deep evals for reliability |
| `program-improver` | Analyzes inspections and proposes program improvements |
| `platform-improver` | Analyzes inspections and proposes platform/runtime improvements |

### ops/

Operational programs for profiling, debugging, validation, and wiring.

| Program | Purpose |
|---------|---------|
| `lint` | Validate structure, schema, shapes, and contract consistency for a program and its service tree |
| `preflight` | Check that all runtime dependencies are satisfied before executing a program |
| `status` | Summarize recent runs from .prose/runs/ |
| `wire` | Run Forme wiring to produce an execution manifest |
| `diagnose` | Investigate failed or suspicious runs and propose fixes |
| `profiler` | Cost, token usage, and time profiling for completed runs |

### delivery/

Services for delivering program outputs to humans and external systems.

| Service | Purpose |
|---------|---------|
| `human-gate` | Present output for human review, block until approved or rejected |
| `slack-notifier` | Format and deliver content to Slack via webhook or API |
| `email-notifier` | Send an HTML email via a configured email provider (Resend, SendGrid, Postmark, SES, SMTP) |
| `email-renderer` | Render structured report data into a branded, email-safe HTML string |
| `html-renderer` | Render an HTML document from a template and structured data |
| `webhook-notifier` | Deliver content to an HTTP endpoint via webhook |
| `file-writer` | Write content to a local, S3, or GCS destination |

### composites/

Named multi-agent topology patterns (`kind: composite`) for reusable coordination shapes.

| Pattern | Purpose |
|---------|---------|
| `worker-critic` | Two-agent loop: worker produces, critic evaluates, repeat until accepted |
| `ensemble-synthesizer` | N-agent ensemble that independently solves then synthesizes into a consensus answer |
| `ratchet` | Iterative improvement loop with regression prevention |
| `dialectic` | Two-agent debate structure producing a synthesized conclusion |
| `proposer-adversary` | Adversarial proposal testing: proposer generates, adversary stress-tests |
| `oversight` | Actor-observer-arbiter structure for independent observation and decision |
| `assumption-miner` | Surfaces implicit assumptions in a solution for explicit evaluation |
| `blind-review` | Independent evaluation without exposure to other agents' assessments |
| `contrastive-probe` | Generates contrasting solutions to expose decision boundaries |
| `stochastic-probe` | Introduces controlled randomness to test solution robustness |
| `coherence-probe` | Tests whether two corpora that should agree are actually in sync |

### controls/

Reusable flow-control composites for sequencing, distribution, guarding, retrying, and fallback.

| Pattern | Purpose |
|---------|---------|
| `pipeline` | Sequential stage pipeline: output of each stage feeds the next |
| `map-reduce` | Parallel fan-out across inputs followed by aggregation |
| `fan-out` | Parallel delegation without reduction; parent consumes raw results |
| `race` | Parallel speculative execution; first acceptable result wins |
| `guard` | Conditional delegation: run target only when guard passes |
| `refine` | Iterative improvement guided by an evaluator |
| `fallback-chain` | Sequential failover through candidate delegates |
| `retry-with-learning` | Retry loop that accumulates failure context to guide subsequent attempts |

### roles/

Single-agent role guides for programs and composites.

| Role | Purpose |
|---------|---------|
| `classifier` | Classifies inputs into a fixed set of categories; returns structured label |
| `critic` | Evaluates a proposed solution against criteria; returns scored feedback |
| `extractor` | Extracts structured data from unstructured text; returns JSON |
| `summarizer` | Condenses long content into a concise representation |
| `verifier` | Checks a solution for correctness against known constraints or test cases |
| `researcher` | Investigates a topic and produces sourced findings |
| `writer` | Produces prose for a specified audience and purpose |
| `planner` | Breaks an objective into ordered work with dependencies |
| `router` | Routes an input to the right tool, role, or next step |
| `formatter` | Transforms structured data into a target presentation format |

### memory/

Programs for persistent agent memory management.

| Program | Purpose |
|---------|---------|
| `project-memory` | Project-scoped memory |
| `user-memory` | Cross-project memory (user-scoped) |
