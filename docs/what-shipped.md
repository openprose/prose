# What Shipped

This is the compact "show me what exists now" snapshot.

## OSS: Local-First OpenProse

The Bun CLI now provides a coherent authoring and local-runtime surface:

- `prose compile`: canonical `.prose.md -> Prose IR`
- `prose manifest`: IR -> VM-readable manifest bridge
- `prose lint` / `prose fmt`: canonical source hygiene
- `prose highlight` / `prose grammar`: syntax visibility and editor grammar artifacts
- `prose preflight`: environment and dependency readiness checks
- `prose plan`: stale/current/blocked reasoning against prior runs
- `prose graph`: graph rendering with plan overlay
- `prose materialize`: local RFC 005-style run materialization
- `prose status` / `prose trace`: inspect local runs
- `prose package`: generate package metadata
- `prose publish-check`: local publish gate
- `prose search`: local package discovery
- `prose install`: install local or registry-addressed packages into `.deps/`

These surfaces share one model:

- `.prose.md` source
- deterministic IR
- run materialization as the universal execution record

## What the Current Patterns Buy Us

The new model already gives us real advantages over ad hoc skill bundles:

- typed ports improve composition and registry search
- declared effects make planning and approvals legible
- prior-run comparison makes selective recompute possible
- graph/trace surfaces make the workflow inspectable
- package metadata makes sharing and publish discipline possible

## Reference Package Surfaces

The repo now carries three important local package surfaces:

- `examples/`: concise, high-signal examples of the current model
- `packages/std/`: reusable primitives
- `packages/co/`: company-operating-system starter patterns

The `customers/prose-openprose` reference company has also been hardened into a real, locally validated package tree with publish-pass quality.

## Hosted Platform Surfaces

The hosted platform work is past the "toy" stage too:

- package ingest exists
- hosted runs can be created and inspected
- graph plans and graph snapshots are persisted
- approvals are recorded and resolved
- the operator UI at `/ops/openprose` can inspect packages, runs, graphs, and approvals

The important part is that the hosted surfaces sit on the same conceptual spine:

- compiled components
- run records
- graph plans
- approvals

## What Still Matters Next

The big remaining work is not "make OpenProse real." It already is.

The next work is product shaping:

- approval semantics and continuation behavior
- richer policy and provenance UX
- hosted publish/install UX
- tenant-aware registry and serving flows

That is a better kind of problem than where we started.
