# RFC-004: Composite Instantiation

**Status:** Draft
**Authors:** Dan B., Claude (OpenProse build session 2026-04-08)
**Created:** 2026-04-08
**Related:** RFC-001 (Scheduled Execution), RFC-002 (Feedback Loops), RFC-003 (Environment Declaration)

---

## Summary

Add first-class composite instantiation to Prose and Forme. Composites become parameterized, reusable multi-agent topologies — generics for AI agent orchestration.

## Problem

The standard library contains 11 composites (worker-critic, ensemble-synthesizer, stochastic-probe, etc.) that encode research-backed epistemic patterns. None can be used as code today. There is no syntax to instantiate them, no mechanism to fill their slots, and no way for Forme to expand them into executable manifests.

## Proposal

### Level 1 — Explicit slot-filling (MUST implement)

```yaml
services:
  - name: reviewed-output
    compose: std/composites/worker-critic
    with:
      worker: radar-compiler
      critic: quality-reviewer
      max_rounds: 3
```

### Level 3 — Decorator sugar (SHOULD implement)

```yaml
services:
  - radar-compiler:
      review: worker-critic(critic: quality-reviewer, max_rounds: 3)
      confidence: stochastic-probe(sample_size: 5)
```

### Level 2 — Implicit matching (MAY implement, future)

```yaml
services:
  - radar-compiler
  - quality-reviewer
topology: worker-critic
```

## Architecture

Composites are a compile-time abstraction. Forme expands them into concrete delegation steps in the manifest. Press executes the expanded manifest unchanged. The composite is gone by runtime — like generics after type erasure.

```
Prose (syntax) → Forme (expansion) → Press (execution)
compose: X       reads X, binds      sees concrete
with: {slots}    slots, validates,   delegation steps
                 expands to manifest  + constraints
```

## Changes

- **Prose spec:** Add `kind: composite`, `compose:`, `with:`, decorator syntax, slot contracts
- **Forme:** Add composite expansion to wiring algorithm (between resolution and manifest writing)
- **Press:** Add constraint enforcement for composite invariants (information firewalls, termination bounds, monotonicity)
- **Std lib:** Update all 11 composites with typed slot contracts, `primary_slot`, and structured invariants

## Prior art

Haskell typeclasses (slot contracts are trait bounds), Python decorators (Level 3 is this), web middleware (composites are middleware for AI sessions), Aspect-Oriented Programming (Forme is the weaver), Terraform modules (Level 1 is this), monad transformers (composites stack like transformer layers).
