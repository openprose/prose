# RFC-004: Composite Instantiation

**Status:** Implemented and integrated with RFC 006
**Authors:** Dan B., Claude (OpenProse build session 2026-04-08)
**Created:** 2026-04-08
**Resolution Date:** 2026-04-23
**Related:** RFC-001 (Scheduled Execution), RFC-002 (Feedback Loops), RFC-003 (Environment Declaration)

---

## Summary

Add first-class composite instantiation to Prose and Forme. Composites become parameterized, reusable multi-agent topologies — generics for AI agent orchestration.

## Resolution

The core concept is implemented in the current skill/spec surface and standard
library:

- composites are `kind: composite` components
- programs instantiate composites in `### Services` using fenced YAML
- Forme expands `compose:` and `with:` declarations before execution
- the current VM executes the expanded manifest
- the new IR model records composite `expansions` and expanded graph nodes with
  source maps back to the parent composite

The old statement that "the composite is gone by runtime" is too strong for the
reactive graph model. The runtime should not execute an unexpanded raw
composite, but traces, graph views, and run records must preserve the composite
instance as a source-level abstraction.

Implicit `topology:` matching remains future work and should not be implemented
without a fresh RFC.

## Problem

The standard library contains composites (worker-critic, ensemble-synthesizer, stochastic-probe, etc.) that encode research-backed epistemic patterns. Before this RFC, none could be used as code: there was no syntax to instantiate them, no mechanism to fill their slots, and no way for Forme to expand them into executable manifests.

## Proposal

### Level 1 — Explicit slot-filling (implemented)

```yaml
- name: reviewed-output
  compose: std/composites/worker-critic
  with:
    worker: radar-compiler
    critic: quality-reviewer
    max_rounds: 3
```

### Level 2 — Decorator sugar (documented for primary-slot composites)

```yaml
- radar-compiler:
    review: worker-critic(critic: quality-reviewer, max_rounds: 3)
    confidence: stochastic-probe(sample_size: 5)
```

### Level 3 — Implicit matching (future; not accepted)

```yaml
services:
  - radar-compiler
  - quality-reviewer
topology: worker-critic
```

## Architecture

Composites are a compile-time abstraction. Forme expands them into concrete delegation steps in the manifest and, under RFC 006, into IR expansion records plus expanded graph nodes. The VM or hosted runtime executes the expanded graph while preserving the composite instance for traces, graph views, and run provenance.

```
Prose source -> Forme expansion -> IR / manifest -> VM or hosted runtime
compose: X      reads X, binds      records parent   executes expanded
with: slots     slots, validates    + child nodes    graph + constraints
```

## Changes

- **Prose spec:** Add `kind: composite`, `compose:`, `with:`, decorator syntax, slot contracts
- **Forme:** Add composite expansion to wiring algorithm (between resolution and manifest writing)
- **VM/runtime:** Add constraint enforcement for composite invariants (information firewalls, termination bounds, monotonicity)
- **Std lib:** Update all 11 composites with typed slot contracts, `primary_slot`, and structured invariants

## Prior art

Haskell typeclasses (slot contracts are trait bounds), Python decorators (Level 3 is this), web middleware (composites are middleware for AI sessions), Aspect-Oriented Programming (Forme is the weaver), Terraform modules (Level 1 is this), monad transformers (composites stack like transformer layers).
