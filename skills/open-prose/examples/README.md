# OpenProse Examples

These examples are small OpenProse Native Repositories. Each one models a real
standing goal as a mounted `responsibility` (the headline kind) that maintains
a world-model, with cross-node helper `function`s it `call`s and a `gateway`
that brings outside events in.

Each responsibility declares what it subscribes to (`### Requires`), the shape of
the truth it keeps current (`### Maintains`), and its wake-source
(`### Continuity`: input-driven, self-driven, or external-driven). Forme wires
the `### Requires` ↔ `### Maintains` edges at compile time; the dumb reconciler
skips a render when neither the contract nor any subscribed input fingerprint
moved, so cost scales with surprise, not the clock.

Each example ships its `.prose.md` contracts under `src/`; see
[Run an example](#run-an-example) below for how to compile and serve one.

---

## Intelligent-React substrate examples (grouped by property)

These examples are authored to the full validity contract, each teaching one
property of the reconciler. A conforming harness can replay any of them
deterministically at zero model spend; the deterministic replay suites that
exercise them ship with the reference harness (see the Harnesses section of
the repository README).

### Memoization & cost-scales-with-surprise

- [surprise-cost](./surprise-cost/): the minimal linear form (one gateway → one
  responsibility, one `@atomic` edge): cold renders both, a quiet re-wake
  memo-skips at fresh 0, and bumping the gateway's `contract_fingerprint` is the
  only thing that re-renders. The marquee skipped/fresh-0 frame.
- [basic-unit-suite](./basic-unit-suite/): the **substrate**: the smallest graph
  that exercises _every_ micro-mechanic (memo-skip, linear propagation, facet
  subscription, function boundary, projection boundary, self-continuity, failure
  containment) the bigger examples stand on.

### Selective wake & facet subscription

- [renewal-risk](./renewal-risk/): a single standing maintained truth re-judges
  ONLY the accounts whose signals moved; a downstream alert feed subscribes to
  the `risk` facet alone, so a cosmetic re-render that leaves `risk` byte-identical
  never wakes it.
- [research-tree](./research-tree/): propagation UP a recursive tree with
  per-branch memoization: revising one leaf wakes only its ancestor path; siblings
  stay dark.

### Fan-in, diamonds & failure isolation

- [inbox-triage](./inbox-triage/): diamond fan-in + failure isolation: a `failed`
  classifier carries zero fresh and wakes nothing downstream; the digest still
  renders; a shared content-fingerprinted facet collapses N identical inputs to a
  single wake.
- [monorepo-ci](./monorepo-ci/): memoization + hub fan-out blast radius: a leaf
  diff rebuilds one lane; a hub diff fans out to its dependents once; a failing
  test is a zero-fresh `failed` receipt that drives the merge gate to BLOCKED.
- [implementation-pipeline](./implementation-pipeline/): a FIXED wide fan-out of
  parallel construction lanes with per-facet wake: a lane-local change lights one
  lane, a foundation change fans out to all lanes once, and a rejected lane never
  reaches integration.

### Masked projections & hidden-context composition

- [masked-relay](./masked-relay/): peer-blind fan-out: scouts and critics never
  subscribe to siblings; deterministic per-consumer masked projection facets;
  full-provenance commit at the synthesizer.
- [oblique-weave](./oblique-weave/): hidden-context adversarial role composition:
  one masked facet per role so a new anomaly wakes exactly the role it routes to;
  the loop closes across an epoch boundary so the graph stays acyclic.

### Per-entity fan-out, gates & enrichment

- [github-star-enricher](./github-star-enricher/): per-entity fan-out + shared
  company receipts (diamond reuse) + cost-gated enrichment + a hard human gate
  that stops at `ready_for_review` with `auto_send:false`.

### Receipts, audit & tamper-evidence

- [tamper-forge](./tamper-forge/): an audit/replay LENS over the masked-relay
  ledger: naive fresh-token inflation breaks `verifyReceiptChain`; an honest
  re-stamp heals the chain; a forged signature scheme is rejected. Depends on
  masked-relay.
- [agent-observatory](./agent-observatory/): the Agent State Observatory: runtime
  adapters on independent dark lanes → a session ledger → summaries → a diamond
  workstream index → a batched concept clusterer → dual terminal artifacts. (WIP
  doc-conformance: Continuity sections describe their wake-source in prose rather
  than the canonical token.)

### Topology-as-world-model (The Cradle)

- [forme-fixpoint](./forme-fixpoint/): the harness wires its own graph: a Topology
  Maintainer publishes a versioned `active-graph` facet that moves only on an
  ACCEPTED candidate, so a rejected (ambiguous/cyclic) candidate cannot corrupt
  scheduling. (WIP: ships the conservative deterministic split; the full
  self-hosting fixpoint is deferred. Continuity uses prose wake-source phrasing.)

### Inbound email as a trigger (primitive.dev inboxes)

Three examples wire a [primitive.dev](https://primitive.dev) email inbox in as an
external-driven gateway — the outside world reaches the graph by sending mail —
and keep a downstream world-model current from what arrives. Each is a distinct
graph shape; the reference harness carries a deterministic replay gate and a
key-gated LLM-as-judge live check (a cheap render model, a smart judge model)
for each of them.

- [support-inbox-router](./support-inbox-router/): a cheap-model **spam/content
  filter** + a **faceted router whose facets are channels**: a `triage` per email
  drops spam (its `routed` facet stays the fixed NULL token, so junk lights
  nothing) and tags ham to a channel; the `router` catalogues one facet per
  channel (`bug-reports`, `feature-requests`, `docs-questions`, `billing`) so a
  docs question wakes ONLY the docs-gap tracker — never the bug board. `billing`
  has no consumer on purpose (a facet is a subscription symbol that may have zero
  subscribers). The docs-gap tracker feeds the agent-native docs / `llms.txt`
  surface.
- [feedback-pulse](./feedback-pulse/): **rollup aggregation + self-driven weekly
  freshness**: themed feedback aggregates into per-theme facets, and a
  `weekly-pulse` brief refreshes on a `valid_until` self-tick — staying current
  even when the inbox is quiet, at zero tokens on an unmoved rollup.
- [press-desk](./press-desk/): a deterministic **human gate** + a **privacy
  projection**: a high-stakes inquiry commits the register update but stops the
  outward action at `needs_human` (`auto_reply:false`), and a `public` projection
  facet keeps sender PII out of the public view by construction.

---

## Named-parts & migrated corpus examples

- [competitor-activity](./competitor-activity/) is the canonical **named-parts
  (facet)** example: one `### Maintains` declares `#### funding`, `#### hiring`,
  and `#### product-launches` as independently-subscribable facets, so a
  downstream wakes only when the part it watches moves.
- [stargazer-outreach](./stargazer-outreach/) keeps high-intent GitHub
  stargazers enriched and ready for thoughtful follow-up.
- [incident-briefing-room](./incident-briefing-room/) keeps an incident channel
  briefed with sourced status, impact, and next actions.
- [customer-risk-radar](./customer-risk-radar/) keeps customer risk visible
  before renewals or escalations surprise the team.
- [release-readiness](./release-readiness/) keeps a release candidate ready to
  ship with evidence, risks, and rollback notes.
- [vendor-renewal-watch](./vendor-renewal-watch/) keeps vendor renewals
  prepared before auto-renewal or negotiation windows close.
- [research-inbox-triage](./research-inbox-triage/) keeps a research inbox
  deduplicated, prioritized, and converted into action.
- [content-performance-loop](./content-performance-loop/) keeps content
  performance learnings flowing into next actions.
- [compliance-evidence-tracker](./compliance-evidence-tracker/) keeps audit
  evidence fresh, reviewed, and gap-aware.
- [session-to-prose](./session-to-prose/) turns local Claude Code, Codex, or
  Pi agent session logs into reusable OpenProse programs with auditable
  receipts.
- [auto-pocock](./auto-pocock/) chains Matt Pocock's published engineering
  skills (grill-with-docs, to-prd, to-issues, tdd, plus his per-repo
  conventions) into a single non-interactive OpenProse program, with the
  two-step grill-and-decide split called out as an OpenProse adaptation.
- [declared-skills](./declared-skills/) shows a minimal `### Skills`
  requirement that fails closed at compile time when the host skill is missing.
- [declared-tools](./declared-tools/) shows a minimal `### Tools` requirement
  that fails closed at compile time when the host CLI executable is missing.

## External Examples

These examples live in separate repos when they depend on product-specific
source code or should keep their own release cadence.

- [grant-radar](https://github.com/openprose/grant-finder/tree/main/examples/openprose)
  demonstrates an OpenProse program that drives the public
  [`grant-finder`](https://github.com/openprose/grant-finder) CLI to produce
  source-cited non-dilutive funding reports for research labs, startups, and
  technical teams. The `grant-finder` repo remains the source of truth for that
  example.

## Run an example

Open one example directory, then compile and serve it. `prose compile` is the
only intelligent phase: a session embodies the VM, runs Forme to wire the
responsibility DAG, and lowers each `### Maintains` into a deterministic
canonicalizer, frozen into `dist/manifest.next.json`. Promote that manifest and
`prose serve` runs the dumb reconciler over it: a node renders if and only if
its memo key `(contract_fingerprint, input_fingerprints)` moved, and every
commit lands as a receipt in the append-only ledger under `runs/`. Any
conforming harness can serve the compiled IR the same way.

```bash
cd skills/open-prose/examples/surprise-cost
prose compile                                          # the intelligent phase → dist/manifest.next.json
cp dist/manifest.next.json dist/manifest.active.json   # promote the compiled IR
prose serve                                            # the dumb reconciler over the active IR
prose status                                           # dispositions, trigger plan, recent runs
```

A lone `kind: function` or `kind: responsibility` file can also be exercised
directly with `prose run src/<file>.prose.md`; a `kind: gateway` cannot (it
compiles into a trigger registration for `prose serve`).

Each example README explains the standing goal, source layout, and what to try.
