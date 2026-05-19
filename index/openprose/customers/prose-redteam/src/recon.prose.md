---
name: recon
kind: service
---

# Recon

### Description

Reads the target repository's architecture and turns the in-scope attack
surface into a deduplicated queue of narrowly scoped hunting tasks, plus a
shared context every hunter starts from.

### Requires

- `repo_path`: local path to the target repository
- `attack_surface`: security boundaries and vulnerability classes in scope

### Ensures

- `shared_context`: architecture summary — entry points, trust boundaries,
  authn/authz model, dangerous sinks, build and run shape
- `task_queue`: deduplicated list of scoped hunting tasks; each task names one
  attack class against one component or boundary, with the files to start from
  and why it is in scope

### Shape

- `self`: read and search the repository, model trust boundaries, scope tasks
- `prohibited`: scanning outside `repo_path`; attempting exploitation here;
  editing the target repository

### Strategies

- prefer many small single-class tasks over a few broad ones; a hunter should
  hold one attack class against one component in its head at once
- ground every task in concrete files and a concrete entry point — no abstract
  "review auth" tasks
- when the surface is large, scope by trust boundary first, then by sink
- deduplicate tasks that would converge on the same code path before returning
