---
purpose: The OpenProse VM skill — language spec, compiler, standard library, Constellation commons, examples, state backends, and primitives for executing .prose programs
related:
  - ../README.md
  - ./examples/README.md
  - ./guidance/README.md
  - ./state/README.md
  - ./primitives/README.md
  - ../../../../platform/api-v2/README.md
  - ../../../../platform/docs/README.md
  - ../../../../../node-rlm/.prose
  - ../../../../../planning/use-cases
glossary:
  Prose Complete: An LLM that, upon reading prose.md, simulates the OpenProse VM with sufficient fidelity to act as its implementation
  VM: The virtual machine described by prose.md — a session orchestrator executing .prose programs
  Constellation: The distributed network of publicly-running Holons (prose programs) accessible via api-v2.prose.md
---

# open-prose

The OpenProse skill for Claude Code. Activates on any `prose` command, `.prose` file, or multi-agent orchestration request. Upon loading, the LLM reads `prose.md` and becomes the OpenProse VM — simulating the runtime rather than merely describing it.

## Contents

- `SKILL.md` — skill activation rules and entry point
- `prose.md` — the OpenProse language specification (the VM definition)
- `compiler.md` — compilation rules: how prose source maps to execution steps
- `help.md` — user-facing help output for the `prose help` command
- `SOUL.md` — character and intent guidance for the VM persona
- `alts/` — alternative or experimental spec variants (narrative style alts: arabian-nights, borges, folk, homer, kafka)
- `lib/` — standard library programs for local evaluation and memory (inspector, vm-improver, program-improver, cost-analyzer, calibrator, error-forensics, user-memory, project-memory)
- `common/` — Constellation commons programs for participating in the distributed Holon network (holon, beacon, swarm, observatory, seeker, registry, curator, publisher, sentinel, arbiter, auditor, chronicler, gardener, assessor, bounty, pollinator, prophet, philosopher)
- `examples/` — 50 numbered .prose example programs covering the full feature set; see examples/README.md
- `guidance/` — patterns, antipatterns, and system-prompt guidance for VM behavior
- `state/` — state backend specifications (filesystem, in-context, SQLite, Postgres)
- `primitives/` — primitive operation specs (session, etc.)

## Subdirectory Relationships

The subdirectories form two layers:

**Specification layer** (`prose.md`, `compiler.md`, `primitives/`, `state/`): define what the VM is and how it works. `primitives/session.md` is the atomic unit; `state/` backends determine how results persist; `compiler.md` maps source syntax to primitive dispatch.

**Operational layer** (`lib/`, `common/`, `examples/`, `guidance/`): define how to use the VM effectively. `examples/` demonstrates the full language; `guidance/` corrects common misuse; `lib/` provides production-ready programs for self-improvement; `common/` connects to the Constellation network.

## Cross-Repo Connections

- `platform/api-v2` implements the hosted execution service that runs .prose programs defined by this skill's spec
- `platform/docs` contains operating guidance that cross-references language semantics
- `node-rlm/.prose` consumes this skill's programs (true-form.prose, controlled-burn.prose, tenet-sync.prose, analyze-trajectories.prose) for RLM self-improvement
- `planning/use-cases` documents language use cases (parallel-for result collection, shared stateful agents) that correspond directly to features in `examples/`
