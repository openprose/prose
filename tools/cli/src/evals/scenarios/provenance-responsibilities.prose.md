# Phase-1b Family 7: Provenance Responsibilities

Public responsibility fixture for Reactor timeline evals. This file contains no secrets, credentials, private customer data, or live endpoints.

## Scope

The evaluator owns a responsibility when a decision must be replayable from tamper-evident receipts, cited sources, and signer trust context. A plausible answer is not enough; the proof must preserve where the answer came from.

## Required Behavior

- Bind every material source to a public receipt or citation record.
- Preserve signer trust context in the cache key and replay recipe.
- Reject provenance when a cited source is missing, swapped, or trust-incompatible.
- Emit a gold trace label for every timeline event.
- Keep metamorphic twins paired so a provenance perturbation changes the expected trace without changing the replay contract.

## Public Fixture Notes

The scenarios cover documentation citations, policy updates, release notes, public filings, standards references, package checksums, support transcripts, changelog comparisons, signed statements, and research abstracts. The oracle data is deterministic and fixture-local.
