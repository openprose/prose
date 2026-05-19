---
name: coverage-ledger
kind: service
---

# Coverage Ledger

### Description

The monotonic memory of the run. On the first call it seeds coverage from recon
and any prior run. On each round it absorbs that round's reachable findings and
advances the certified-explored surface. Certified coverage only ever grows.

### Requires

- `recon`: the recon output (shared context + task queue) for this run
- `prior_run`: run — optional prior `vuln-discovery` run to resume from
- `reachability`: optional merged reachability result for the current round
- `candidates`: optional this round's hunter candidates, read only to record
  refused tasks as deferred-with-reason in coverage
- `round`: optional current round index

### Ensures

- `findings`: the accumulated set of confirmed, deduplicated findings with
  reachability verdicts, carried across rounds and runs
- `coverage`: surface explored vs. deferred, each entry with a reason;
  includes recorded hunter refusals as deferred-with-reason, never dropped
- `certified_surface`: the monotonic set of attack-class/component pairs that
  have been explored to a certified conclusion

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - certified_surface: attack-class/component pairs explored to a certified conclusion in prior runs
  - findings_registry: map of dedupe_group → { first_seen, last_seen, verdict, reachability }
  - last_run_at: ISO timestamp of the prior run's completion
writes:
  - certified_surface: union of prior and this run's certified surface — only grows
  - findings_registry: merged with this run's confirmed, deduplicated findings
  - last_run_at: ISO timestamp of this run's completion
```

### Shape

- `self`: merge round and run results into durable, monotonic coverage memory
- `prohibited`: shrinking `certified_surface`; deleting prior findings from the
  registry; dropping recorded refusals

### Strategies

- when `prior_run` is supplied, resolve it and union its certified surface and
  findings registry in before this run's results; the VM's staleness check on
  run-typed inputs is the signal that the prior run is too old to trust
- on the seeding call (no `reachability`), establish coverage from recon and
  prior state only; on round calls, fold in the round's reachable findings
- a refused task is deferred-with-reason in coverage, never absent
- never regress: if a surface was certified explored in a prior run or round,
  it stays certified
