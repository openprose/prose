# RFC 013 Implementation Phases

This directory is the historical working plan that turned OpenProse into the
first local runtime release candidate described by RFC 013.

**Read this as implementation history, not current marching orders.** Several
phase names and older slice docs use the words provider, fixture, and
local-process because those were the scaffolding terms at the time. The active
architecture is defined by RFC 014: Pi is the graph VM, per-node execution is
handled by node runners, and model providers live inside the Pi runtime profile.

**Current status:** completed through the local runtime release candidate. See
[`../signposts/042-runtime-release-candidate.md`](../signposts/042-runtime-release-candidate.md)
for the final implementation slice and [`../../../docs/release-candidate.md`](../../../docs/release-candidate.md)
for the current confidence matrix.

The phases are intentionally ordered as a confidence ladder. Each phase should
leave the package more runnable, more testable, and closer to the core loop:

```text
source package
  -> canonical IR
  -> typed/effect/policy analysis
  -> reactive plan
  -> meta-harness execution through Pi node sessions
  -> validated artifacts
  -> durable run store
  -> eval acceptance and current/latest pointers
```

## Execution Rules

For every sub-phase:

- update the phase doc if reality changes
- implement the smallest coherent slice
- run the listed checks
- add or update a signpost in `../signposts/`
- commit before moving to the next slice

The package has no compatibility obligation with earlier OpenProse behavior.
When the current implementation fights the North Star, prefer a clean
replacement over a bolt-on compatibility layer.

## Phase Order

| Phase | Focus | Confidence gained |
| --- | --- | --- |
| [01](01-contract-baseline/README.md) | Contract baseline and test harness | Completed; see signposts 001-004. |
| [02](02-ir-and-source-model/README.md) | Executable IR and source model | Completed; see signposts 005-009. |
| [03](03-run-store/README.md) | Local run and artifact store | Completed; see signposts 010-014. |
| [04](04-provider-protocol/README.md) | Historical provider protocol and Pi SDK path | Completed, then superseded by RFC 014 graph-VM/node-runner vocabulary; see signposts 015-020 and RFC 014 signposts 005-037. |
| [05](05-meta-harness/README.md) | Meta-harness and reactive execution | Completed for release-candidate runtime; see signposts 021-026. |
| [06](06-types-policy-evals/README.md) | Types, policy, evals | Completed for release-candidate validation/acceptance; see signposts 027-032. |
| [07](07-stdlib-examples/README.md) | Std, co, examples migration | Completed; see signposts 033-037. |
| [08](08-package-ux-release/README.md) | Package UX and release readiness | Completed; see signposts 038-042. |

## Cross-Phase Backpressure

The following checks should become stricter over time:

- `bun test`
- `bunx tsc --noEmit`
- `bun bin/prose.ts compile examples/hello.prose.md`
- `bun bin/prose.ts plan examples/selective-recompute.prose.md --input draft="A stable draft." --input company=openprose`
- `bun bin/prose.ts package examples --format json`
- `bun bin/prose.ts publish-check packages/std --strict`
- `bun bin/prose.ts run examples/north-star/company-signal-brief.prose.md --graph-vm pi --output company_signal_brief=ok`
- `bun bin/prose.ts run examples/north-star/lead-program-designer.prose.md --graph-vm pi --output lead-profile-normalizer.normalized_profile=ok --output lead-qualification-scorer.qualification_score=ok --output save-grow-program-drafter.save_grow_program=ok --output lead-program-designer.lead_program_design=ok`

If a phase cannot make one of these checks pass yet, the signpost should say
why and name the next phase expected to close the gap.

## Meta-Harness Principle

OpenProse should not become an agent harness. Pi runs graph-node sessions.
OpenProse owns the meta-harness: planning, dependency ordering, graph-VM
selection, upstream run binding, effect gates, retries, acceptance, and current
pointer updates.

The current graph VM is Pi because it is TypeScript-native and gives the OSS
package a real local coordination substrate.
