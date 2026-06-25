# OpenProse Doctrine

The coding agent is the compiler. Wrappers, adapters, and conformance suites are witnesses — not definitions.

## Two Tracks

OpenProse generates two independent kinds of claim. Do not conflate them.

### Track 1 — Mechanistic conformance (what this repo certifies)

Scope: the integration contract between an OpenProse program, a host runtime, and an agent CLI.

- Wire-v1 I/O, bindings, delegation, secrets, resume, error propagation
- Deterministic fixtures, external verifiers, artifacts on disk
- Machinery: `openprose-lint`, adapter manifests, runtime-subject manifests, dogfood proofs

What a passing track-1 proof shows: "this CLI, wrapped by this adapter, orchestrated by this host, produces the expected artifacts reliably."

What it does *not* show: that the agent, on its own, reads a prose program and executes it as a compiler would.

### Track 2 — Semantic prose-completeness (out of scope for this suite)

Scope: whether an agent, acting as the OpenProse compiler/VM, interprets prose programs and produces the outcomes their authors intended.

- Judged by outcomes on real programs
- Evidence is fuzzy by construction; users are the verifier
- No deterministic harness can certify it, because the agent-as-compiler thesis is a semantic claim, not an interface claim

Track 2 lives in a separate eval corpus, not in this repo's conformance suite.

## Terminology Discipline

| Claim form | Track | Where it lives |
|---|---|---|
| "Adapter-proven / host-mediated / runtime-conformant" | 1 | this repo |
| "Wire-v1 conformant" | 1 | this repo |
| "Native OpenProse runtime" (agent-embodied) | 2 | separate eval corpus |
| Per-capability `mode: native` in a runtime-subject manifest | 1 | specs/ — means "runtime provides this primitive without adapter wrapping"; this is *not* a track-2 claim about the runtime overall |

The last row is the known terminology collision. A passing host-mediated manifest may declare individual capabilities as `mode: native` without making any claim that the runtime itself is a native OpenProse compiler. See `specs/AGENTS.md`.

## Rules of Thumb

- Passing a mechanical suite proves mechanical things. Do not use it to award semantic titles.
- "Native OpenProse" is earned by demonstrated outcomes on real programs, not by conformance runs.
- When a track-1 proof looks like it is settling a track-2 question, you are in a category error — relabel, do not expand scope.
- If you want to strengthen a track-2 claim, write more prose programs and evaluate outcomes. Do not add more fixtures.
