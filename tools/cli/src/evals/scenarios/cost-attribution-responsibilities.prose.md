# Phase-1b Family 8: Cost Attribution Responsibilities

Public responsibility fixture for Reactor timeline evals. This file contains no secrets, credentials, private customer data, or live endpoints.

## Scope

The evaluator owns a responsibility when model calls, cache hits, forecasts, and reconciled provider charges must be attributable to a bounded exposure decision. Unknown cost is not acceptable when the scenario requires cost evidence.

## Required Behavior

- Attribute every model call and cache decision to a scenario event.
- Preserve local estimates, provider usage, and reconciled charges as distinct confidence levels.
- Enforce preregistered cost ceilings before expensive work continues.
- Emit a gold trace label for every timeline event.
- Keep metamorphic twins paired so a cost perturbation changes expected accounting without changing the bounded exposure contract.

## Public Fixture Notes

The scenarios cover token estimates, hosted embedding calls, cache writes, cache reads, provider reconciliation, retry budgets, tool-call ceilings, fixture embedding reuse, cost caps, and audit exports. The oracle data is deterministic and fixture-local.
