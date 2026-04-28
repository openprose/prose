# Current Surface

This is the compact map of the public OpenProse surface.

## OSS: Local-First OpenProse

The Bun CLI provides a coherent authoring and local-runtime surface:

- `prose compile`: canonical `.prose.md -> Prose IR`
- `prose manifest`: readable/runtime projection from the canonical IR
- `prose lint` / `prose fmt`: canonical source hygiene
- `prose highlight` / `prose grammar`: syntax visibility and editor grammar artifacts
- `prose preflight`: environment, dependency, and runtime-profile readiness
  checks without secret values
- `prose plan`: stale/current/blocked reasoning against prior runs
- `prose graph`: graph rendering with plan overlay
- `prose run`: graph-VM local execution through the meta-harness
- `prose handoff`: export a single component contract for a compatible
  one-off agent harness
- `prose eval`: executable eval contracts over materialized runs
- `prose remote execute`: hosted-compatible envelope and artifact manifest,
  using the same graph-VM/runtime-profile vocabulary as `prose run`
- `prose status` / `prose trace`: inspect local runs
- `prose package`: generate package metadata
- `prose publish-check`: local publish gate
- `prose search`: local package discovery
- `prose install`: install local or registry-addressed packages into `.deps/`

These surfaces share one model:

- `.prose.md` source
- deterministic IR
- run materialization as the universal execution record
- deterministic `--output` fixtures as a development/test path, not the runtime center
- Pi-backed graph VM execution with one persisted session per selected node
- intra-node child-session delegation through `openprose_subagent`, retained
  as node-private state rather than graph output
- structured output submission through `openprose_submit_outputs`
- structured node-session records in attempts and trace output
- package-local named JSON Schema validation for `Json<T>` ports
- package and hosted metadata as projections over the same executable contract

`remote execute` keeps deterministic `--output` fixtures for repeatable hosted
contract tests. Real hosted workers can select `--graph-vm pi` and pass
`--model-provider`, `--model`, and `--thinking` flags, or provide the same Pi
runtime profile through environment variables. The remote envelope path does
not silently become a separate runtime architecture.

## Why It Matters

The model gives OpenProse advantages over ad hoc skill bundles:

- typed ports improve composition and registry search
- package-local schemas make selected named port types executable contracts
- declared effects make planning and approvals legible
- prior-run comparison makes selective recompute possible
- graph/trace surfaces make the workflow inspectable
- package metadata makes sharing and publish discipline possible

## Reference Packages

The repo carries three important local package surfaces:

- `examples/`: concise, high-signal examples of the current model
- `packages/std/`: reusable primitives
- `packages/co/`: company-operating-system starter patterns

The `customers/prose-openprose` reference company has also been hardened into a real, locally validated package tree with publish-pass quality.

The `examples/` package also participates in release confidence through
`measure:examples`, `confidence:runtime`, deterministic scripted Pi scenarios,
and the skipped-by-default `smoke:live-pi` ladder.

## Hosted Platform

The hosted platform consumes the same concepts the OSS package emits:

- package ingest
- hosted runs can be created and inspected
- persisted graph plans and graph snapshots
- approval recording and resolution
- the operator UI at `/ops/openprose` can inspect packages, runs, graphs, and approvals

The important part is that the hosted surfaces sit on the same conceptual spine:

- compiled components
- run records
- graph plans
- approvals

## Platform Follow-Up

The local package has an executable runtime spine and a repeatable
confidence matrix. The remaining work is about hardening the hosted product
around that spine:

- keep platform tests vendoring the OSS hosted-runtime fixtures directly so
  contract drift fails mechanically
- approval semantics and continuation behavior
- richer policy and provenance UX
- hosted publish/install UX
- tenant-aware registry and serving flows
