# std/patterns

Reusable OpenProse patterns (`kind: pattern`) for coordination, flow, review, synthesis, and measurement. Patterns are instantiated at compile time by a contract that binds their slots and expanded into nodes; they are not run directly.

## Instantiation

A contract instantiates a pattern with a structured YAML entry that binds its
slots; Forme expands the instance into the resolved graph at compile time:

```yaml
- name: reviewed-output
  pattern: std/patterns/worker-critic
  with:
    worker: writer
    critic: reviewer
  config:
    max_rounds: 3
```

- `pattern:` names a file in this directory without the `.prose.md` suffix
- `with:` binds slots to functions, responsibilities, or nested pattern instances
- `config:` sets operational parameters such as limits, thresholds, and modes
- Pattern files define `### Slots`, `### Config`, `### Invariants`, `### Requires`, `### Maintains`, and `### Delegation`
- `### Delegation` describes the pattern algorithm in fenced `prose`; the VM
  executes it only after a contract instantiates the pattern and binds its slots.

## Quality Loops

| Pattern | Slots | Use when you need to... |
|---|---|---|
| [worker-critic](worker-critic.prose.md) | worker, critic | Produce work, evaluate it, and retry until accepted or the round budget is exhausted |
| [refine](refine.prose.md) | refiner, evaluator | Improve an existing result toward a score threshold |
| [ratchet](ratchet.prose.md) | advancer, certifier | Make incremental progress while preserving every certified step |
| [retry-with-learning](retry-with-learning.prose.md) | target | Retry the same target contract with accumulated failure history |

## Parallel and Selection

| Pattern | Slots | Use when you need to... |
|---|---|---|
| [fan-out](fan-out.prose.md) | delegates | Run independent delegates in parallel and keep every raw result |
| [map-reduce](map-reduce.prose.md) | mapper, reducer | Process chunks independently, then merge every mapper result |
| [race](race.prose.md) | candidates | Try multiple candidates in parallel and accept the first suitable result |
| [fallback-chain](fallback-chain.prose.md) | chain | Try preferred delegates sequentially, advancing only after failure |
| [pipeline](pipeline.prose.md) | stages | Transform work through ordered stages with clean stage boundaries |
| [guard](guard.prose.md) | guard, target | Check a precondition before running an expensive or sensitive target |

## Debate and Oversight

| Pattern | Slots | Use when you need to... |
|---|---|---|
| [proposer-adversary](proposer-adversary.prose.md) | proposer, adversary | Generate a proposal and independently stress-test it |
| [dialectic](dialectic.prose.md) | thesis, antithesis | Preserve an exchange between opposing positions without forcing resolution |
| [ensemble-synthesizer](ensemble-synthesizer.prose.md) | ensemble_member, synthesizer | Collect independent attempts and synthesize across disagreement |
| [oversight](oversight.prose.md) | actor, observer, arbiter | Separate action, observation, and decision across independent slots |

## Measurement and Probe

| Pattern | Slots | Use when you need to measure... |
|---|---|---|
| [blind-review](blind-review.prose.md) | reviewer, comparator | Cross-tier comprehension divergence in material or instructions |
| [stochastic-probe](stochastic-probe.prose.md) | probe, analyst | Variance across repeated runs with identical inputs |
| [assumption-miner](assumption-miner.prose.md) | miner, comparator | Hidden assumptions and unstated dependencies |
| [coherence-probe](coherence-probe.prose.md) | reader, sync_analyst | Drift between two corpora that should describe the same system |
| [contrastive-probe](contrastive-probe.prose.md) | measurement, ranker | Which of two candidates scores better on another measurement pattern |

## Choosing Similar Patterns

| If you are choosing between... | Prefer this when... |
|---|---|
| `fan-out` and `map-reduce` | Use `fan-out` when the caller needs every raw result; use `map-reduce` when one merged artifact is required |
| `race` and `fallback-chain` | Use `race` when parallelism is worth the cost; use `fallback-chain` when later candidates should run only after earlier ones fail |
| `retry-with-learning` and `fallback-chain` | Use `retry-with-learning` for the same contract with better context; use `fallback-chain` for different contracts in preference order |
| `retry-with-learning` and `refine` | Use `retry-with-learning` for broken or absent results; use `refine` for usable results that need quality improvement |
| `worker-critic` and `refine` | Use `worker-critic` when the critic makes an accept/reject judgment; use `refine` when a continuous score guides improvement |
