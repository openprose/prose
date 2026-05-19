---
name: gapfill
kind: service
---

# Gapfill

### Description

Turns the gap between the in-scope attack surface and what the ledger has
certified into the next round's task queue: under-explored surface, refused
tasks worth re-attempting differently, and follow-ups implied by this round's
findings.

### Requires

- `attack_surface`: the security boundaries and vulnerability classes in scope
- `ledger`: the current coverage ledger (coverage + certified surface +
  findings)

### Ensures

- `task_queue`: the next round's deduplicated, scoped hunting tasks; empty when
  the in-scope surface is certified explored and no findings imply follow-ups

### Shape

- `self`: diff scope against certified coverage and emit the next task queue
- `prohibited`: re-queuing surface already certified explored; emitting
  unscoped or abstract tasks

### Strategies

- prioritize never-explored in-scope surface, then findings-implied follow-ups
  (e.g. a confirmed bug class likely present elsewhere), then refused tasks
  re-framed so they can be attempted within scope
- returning an empty queue is the correct, expected way to end the loop — do
  not invent tasks to keep it running
- keep tasks scoped the same way recon does: one attack class, one component,
  concrete files
