# interactive-grill

**The standing goal:** challenge a feature brief with repository-grounded
questions and a deliberate human judgment step — the interactive counterpart
to `auto-pocock`'s non-interactive grilling.

**One-line scenario:** the operator supplies a `feature-brief`; the `grill`
responsibility pauses for the `target-repo` if unbound, inspects the repo for
evidence, recommends answers, and surfaces the questions that only a human can
resolve. Downstream `synthesize-brief` turns the output into a decision-ready
plan.

This is the smallest graph that teaches the **intentional `ask_user` pause**:
a `responsibility` whose `### Requires` entries are deliberately left unbound
so the VM fires `ask_user` at bind time. There is **no `kind: service`**, **no
`### Runtime: interactive: true`**, and no other field that expresses
interactivity. An unbound required input *is* the intent signal.

## The DAG

```
feature-brief (caller input) ──► grill (responsibility, input-driven)
target-repo   (caller input) ──►
                                    │
                                    ▼
                             synthesize-brief (function)
```

One responsibility, one helper function, over **one interactive caller
interface**. The lesson is not topology — it is the bind-time pause contract.

## The beat arc

| beat        | what happens                                          |
| ----------- | ----------------------------------------------------- |
| **bind**    | `feature-brief` and `target-repo` are unbound → VM     |
|             | fires `ask_user` for each, pauses, resumes with answers |
| **render**  | `grill` reads the inputs, inspects the repo, writes    |
|             | `challenge-report`, `decision-records`, and            |
|             | `terminology-glossary` to the world-model              |
| **skip**    | re-run with the same inputs and no repo change →       |
|             | memo-skip at fresh 0                                   |

If the host cannot pause (CI, non-interactive shell), the VM returns
`unresolved-intent` with the missing inputs listed. A calling harness should
treat that as a contract signal: supply the value or halt, never guess.

## Run it with the Reactor harness

The `.prose.md` contracts work with any harness; these verbs steer to Reactor.

```bash
cd skills/open-prose/examples/interactive-grill
reactor doctor                 # honest health report
reactor compile --check        # exits 1 (stale): recognized, not yet compiled
reactor compile                # run the compile session -> IR cache
reactor topology               # inspect the compiled DAG
reactor run                    # boot, drain, print dispositions + cost
reactor serve                  # browse the receipts + world-models locally
reactor receipts               # read the per-node ledger
```

### Run with explicit inputs (non-interactive)

If you supply both inputs, the run does not pause:

```bash
prose run src/grill.prose.md \
  --feature_brief "Add a dark mode toggle to the settings page" \
  --target_repo "/path/to/your/repo"
```

### Run with missing inputs (interactive)

If you omit one or both inputs in a TTY, the VM prompts via `ask_user`:

```bash
prose run src/grill.prose.md
# VM: "feature-brief is required but not provided. What is the feature brief?"
# VM: "target-repo is required but not provided. What is the target repo path?"
```

In CI or a non-interactive shell, the same run returns `unresolved-intent`:

```bash
prose run src/grill.prose.md --feature_brief "..." --non_interactive
# unresolved-intent: missing inputs: target-repo
```

## What to try

- **Re-run with the same inputs** and watch the responsibility memo-**skip**;
  the skip costs nothing and spawns nothing.
- **Omit an input in a TTY** and watch the VM pause for `ask_user`; provide the
  value and the run resumes with the answer bound.
- **Omit an input in CI** and watch the run return `unresolved-intent`; a
  harness should treat this as a contract signal, not a failure.
- **Move the contract** (edit `grill.prose.md`) and watch the responsibility
  re-render and the fresh meter tick once.

## How it's built & exercised

- `src/grill.prose.md`: the intentionally interactive responsibility.
- `src/synthesize-brief.prose.md`: the stateless helper it `call`s.
- A run writes a keyless, chain-verifiable state-dir: a flat `receipts.json`,
  `compile/topology.json` + `compile/labels.json`, and
  `world-models/<hexNodeId>/{published.json, versions/sha256_*.bin}`.

The example is the canonical counter-example to `auto-pocock`'s non-interactive
adaptation. Where `auto-pocock` recommends answers to avoid prompting, this
example deliberately leaves required inputs unbound so the VM fires `ask_user`.
