---
name: trace
kind: service
---

# Trace

### Description

For one finding, determines whether attacker-controlled input can actually
reach the vulnerable code path — within the target repo and, when provided,
through the repos that consume it.

### Requires

- `finding`: one deduplicated, confirmed finding
- `consumer_repos`: optional repos that consume the target code

### Ensures

- `finding`: the same finding annotated with a `reachability` verdict —
  `reachable`, `unreachable`, or `conditional` — the path taken, and any
  preconditions or required configuration

### Shape

- `self`: trace data flow from attacker-controlled entry points to the sink
- `prohibited`: scanning outside `repo_path` and the declared
  `consumer_repos`; altering the finding's root cause or impact; running
  exploit code against any external or live system

### Strategies

- start from the finding's declared attacker-controlled input and follow it to
  the sink; do not assume reachability the hunter asserted
- `conditional` is a real verdict: state the exact configuration or precondition
  that opens the path
- when consumer repos are provided, a finding unreachable internally may still
  be reachable through a consumer — check before concluding unreachable
