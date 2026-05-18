# Phase-1b Family 2: Quiet Drift Responsibilities

Public responsibility fixture for Reactor timeline evals. This file contains no secrets, credentials, private customer data, or live endpoints.

## Scope

The evaluator owns a responsibility when a previously accepted decision can become stale without an explicit user edit. The scenario must keep the last accepted decision, the forecast policy, and the scheduled recheck together so a quiet drift cannot be hidden behind cache reuse.

## Required Behavior

- Preserve the original decision input and the forecast that justified the next recheck.
- Treat scheduled rechecks as preregistered events, not opportunistic after-the-fact checks.
- Detect drift when observed public facts differ from the forecast while independent ingress did not change.
- Emit a gold trace label for every timeline event.
- Keep metamorphic twins paired so a relevant perturbation changes the expected trace without changing the family objective.

## Public Fixture Notes

The scenarios cover receipts, service levels, compliance dates, feature flags, inventory states, public policy pages, exchange rates, routing tables, incident statuses, and downstream deadlines. The oracle data is deterministic and fixture-local.
