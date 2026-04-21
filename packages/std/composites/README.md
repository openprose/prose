---
purpose: Named multi-agent topology patterns — the structural building blocks for Prose programs
related:
  - ../README.md
  - ../controls/README.md
  - ../roles/README.md
  - ../../programs/README.md
---

# std/composites

Composites are named multi-agent patterns (`kind: composite`). Each one defines a topology: which slots exist, how information flows between them, and what structural guarantee the pattern provides.

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

## The `&compositeState` Convention

Every composite reads and writes `&compositeState`, a YAML anchor resolved at runtime to the object stored at `__compositeState`. This is how the parent program configures a composite: it writes slot assignments, task briefs, and options into `__compositeState`, then delegates to the composite, which reads its configuration from the same location and writes its results back.

```yaml
state:
  reads: [&compositeState]
  writes: [&compositeState]
```

The parent provides `__compositeState` with at minimum:
- Slot assignments (which component fills each slot)
- A `task_brief` (what to work on)
- Composite-specific options (rounds, max_retries, tiers, etc.)

The composite writes back:
- `__compositeState.result` — the primary output
- Any composite-specific secondary outputs (reviews, predictions, exchange history, etc.)

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
