---
purpose: Named multi-agent topology patterns — the structural building blocks for Prose programs
related:
  - ../README.md
  - ../controls/README.md
  - ../roles/README.md
  - ../../programs/README.md
---

# std/composites

Composites are named multi-agent patterns (`kind: composite`). Each one defines
a topology: which roles exist, how information flows between them, and what
structural guarantee the pattern provides. In the current OSS runtime they are
typed, executable pattern contracts: `composite_state` in, `composite_result`
out.

## Two Categories

### Structural Patterns

These are the six core composites from the language spec (Section 2.4). They define how agents collaborate to produce a result.

| Composite | Slots | What it does |
|---|---|---|
| `worker-critic` | worker, critic | Work, evaluate, retry until accepted |
| `ensemble-synthesizer` | ensemble_member, synthesizer | K agents work independently, synthesizer merges by reasoning about disagreements |
| `proposer-adversary` | proposer, adversary | One proposes, another attacks; the parent decides |
| `dialectic` | thesis, antithesis | Argue positions across rounds; disagreement is the output |
| `ratchet` | advancer, certifier | Advance and certify; certified progress is never rolled back |
| `oversight` | actor, observer, arbiter | Actor acts, observer watches independently, arbiter decides next step |

### Measurement Instruments

These composites measure properties of artifacts — clarity, determinism, hidden assumptions, coherence. They produce diagnostic profiles, not final outputs.

| Composite | Slots | What it measures |
|---|---|---|
| `blind-review` | reviewer, comparator | Cross-tier comprehension divergence (clarity vs. ambiguity vs. complexity) |
| `stochastic-probe` | probe, analyst | Within-tier response variance (determinism of interpretation) |
| `assumption-miner` | miner, comparator | Unstated dependencies, classified by visibility across capability tiers |
| `coherence-probe` | reader, sync_analyst | Whether two corpora that should describe the same system actually agree |
| `contrastive-probe` | measurement, ranker | Meta-composite: runs any measurement on two candidates, ranks which scores better |

## Decision Matrix

| You need to... | Use |
|---|---|
| Iteratively improve output with feedback | `worker-critic` |
| Stress-test a proposal for flaws | `proposer-adversary` |
| Explore a question from opposing sides | `dialectic` |
| Reduce variance through independent attempts | `ensemble-synthesizer` |
| Make incremental progress that never regresses | `ratchet` |
| Separate execution from evaluation with independent observation | `oversight` |
| Measure whether your writing is clear, complex, or ambiguous | `blind-review` |
| Test whether material constrains interpretation or leaves it open | `stochastic-probe` |
| Surface implicit assumptions in a document or design | `assumption-miner` |
| Check if code and docs (or any two corpora) are in sync | `coherence-probe` |
| Compare two candidates on any measured dimension | `contrastive-probe` |

## The `composite_state` Convention

Every composite reads one JSON input and returns one JSON output.

The parent provides `composite_state` with:

- role assignments
- a task brief or measured artifact
- composite-specific options such as rounds, sample size, criteria, or tiers

The composite returns `composite_result` with:

- the primary result
- intermediate outputs such as reviews, attacks, observations, or member results
- metadata such as confidence, rounds used, or unresolved tensions

This avoids hidden mutable state and keeps local runs close to hosted run
records.

## Using Composites

### Level 1: `compose:` syntax

Reference a composite by path and bind its slots with `with:`.

```yaml
services:
  - name: reviewed-output
    compose: std/composites/worker-critic
    with:
      worker: my-writer
      critic: my-reviewer
```

### Level 2: Decorator syntax (primary-slot composites only)

Composites that declare a **primary slot** support a shorthand where the decorated service fills the primary slot automatically. The remaining slots and config are passed inline.

```yaml
services:
  - my-writer:
      review: worker-critic(critic: my-reviewer, max_rounds: 3)
```

This is equivalent to the Level 1 form above — `my-writer` fills the primary `worker` slot.

### Which syntax can I use?

| Composite | Primary slot | Decorator eligible? |
|---|---|---|
| `worker-critic` | `worker` | Yes |
| `ensemble-synthesizer` | `ensemble_member` | Yes |
| `proposer-adversary` | `proposer` | Yes |
| `ratchet` | `advancer` | Yes |
| `oversight` | `actor` | Yes |
| `dialectic` | *(none)* | No — use `compose:` |
| `blind-review` | `reviewer` | Yes |
| `stochastic-probe` | `probe` | Yes |
| `assumption-miner` | `miner` | Yes |
| `coherence-probe` | `reader` | Yes |
| `contrastive-probe` | `measurement` | Yes |

Composites without a primary slot (currently only `dialectic`) require the Level 1 `compose:` form because there is no single "main" service to decorate.

## Native Runtime Support

Supported today:

- package-local composite references in package IR
- fixed service graphs expanded from declared `compose:` references
- scripted Pi execution of expanded composite graphs through normal run
  materialization

Pattern-only until a later runtime slice:

- variable-width ensembles
- iterative worker/critic, ratchet, oversight, and dialectic loops
- cancellation or resumption of sub-sessions inside a composite
- measurement probes that require repeated live model invocations
