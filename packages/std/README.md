# OpenProse Standard Library

Reusable OpenProse services, systems, patterns, roles, delivery adapters, memory services, and operational tools.

## Usage

```prose
use "std/evals/inspector"
use "std/evals/prose-contributor"
use "std/ops/prose-author"
use "std/patterns/worker-critic"
use "std/patterns/pipeline"
use "std/roles/critic"
use "std/delivery/email-notifier"
use "std/memory/project-memory"
```

Install with `prose install`. `std/...` is the shorthand for `github.com/openprose/prose/packages/std/...`; see [deps.md](https://github.com/openprose/prose/blob/main/skills/open-prose/deps.md) for dependency resolution details.

## Library

Authored Prose sources use `*.prose.md` and the current Contract Markdown section form (`### Services`, `### Requires`, `### Ensures`, and related sections). `README.md` files remain plain Markdown.

### evals/

Systems for evaluating and improving OpenProse runs, contracts, and platform behavior.

| System | Purpose |
|---------|---------|
| `inspector` | Post-run analysis — runtime fidelity and task effectiveness |
| `contract-grader` | Scores a system or service against its declared contract |
| `regression-tracker` | Tracks quality regressions across runs |
| `cross-run-differ` | Compares runs and recommends follow-up investigation |
| `eval-calibrator` | Validates light evals against deep evals for reliability |
| `system-improver` | Analyzes inspections and proposes source improvements |
| `platform-improver` | Analyzes inspections and proposes platform/runtime improvements |
| `prose-contributor` | Turns run evidence into an approved branch and draft PR back to OpenProse |

When a std run exposes friction, confusing docs, or a reusable pattern that
belongs upstream, run `std/evals/prose-contributor` after inspection. It is the
standard path from run evidence to a focused pull request. It still requires
explicit user approval before pushing a branch or opening a PR.

### ops/

Operational systems for profiling, debugging, validation, and wiring.

| System | Purpose |
|---------|---------|
| `lint` | Validate structure, schema, shapes, and contract consistency for a system and its service tree |
| `preflight` | Check that all runtime dependencies are satisfied before executing a system |
| `status` | Summarize recent runs from `<openprose-root>/runs/` |
| `wire` | Run Forme wiring to produce `forme.manifest.json` |
| `prose-author` | Turn pseudo-Prose or logical English into a fully validated OpenProse program package, asking targeted questions when the host supports interaction |
| `diagnose` | Investigate failed or suspicious runs and propose fixes |
| `profiler` | Cost, token usage, and time profiling for completed runs |

### delivery/

Services for delivering outputs to humans and external systems.

| Service | Purpose |
|---------|---------|
| `human-gate` | Present output for human review, block until approved or rejected |
| `slack-notifier` | Format and deliver content to Slack via webhook or API |
| `email-notifier` | Send an HTML email via a configured email provider (Resend, SendGrid, Postmark, SES, SMTP) |
| `email-renderer` | Render structured report data into a branded, email-safe HTML string |
| `html-renderer` | Render an HTML document from a template and structured data |
| `webhook-notifier` | Deliver content to an HTTP endpoint via webhook |
| `file-writer` | Write content to a local, S3, or GCS destination |

### patterns/

Reusable coordination and control-flow patterns (`kind: pattern`).

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
| `pipeline` | Sequential stage pipeline: output of each stage feeds the next |
| `map-reduce` | Parallel fan-out across inputs followed by aggregation |
| `fan-out` | Parallel delegation without reduction; parent consumes raw results |
| `race` | Parallel speculative execution; first acceptable result wins |
| `guard` | Conditional delegation: run target only when guard passes |
| `refine` | Iterative improvement guided by an evaluator |
| `fallback-chain` | Sequential failover through candidate delegates |
| `retry-with-learning` | Retry loop that accumulates failure context to guide subsequent attempts |

### roles/

Single-service role guides for systems and patterns.

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

Services for persistent agent memory management.

| Service | Purpose |
|---------|---------|
| `project-memory` | Project-scoped memory |
| `user-memory` | Cross-project memory (user-scoped) |
