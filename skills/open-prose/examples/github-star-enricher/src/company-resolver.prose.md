---
name: company-resolver
kind: responsibility
---

# Company Resolver

> A **per-company** responsibility (`company-resolver[company_key]`) that enriches
> a company **once** and shares the receipt across every stargazer who works
> there. This is the example's signature shape: enrichment keyed by company
> identity, not by person — a **diamond fan-in** where five stargazers at the same
> company subscribe to one `CompanyProfile` receipt.

### Requires

- The `github-footprint-mapper` truth of **every** stargazer whose footprint
  resolves to this `company_key`, each on its **atomic facet**. For `acme` that is
  both `alice` and `bob`; their two footprint lanes fan **in** to this one node.

### Maintains

The company profile, as this responsibility's maintained truth (read by
reference, postconditions self-policed, no separate judge beat):

- `product`, `engineering_surface`, `likely_operational_burdens`,
  `exa_company_sources`, `identity_confidence` — gathered once from a real (here,
  dry-run / synthetic-safe) Exa Company call, at the same ~6× expensive cost as
  the person resolver.
- a `deferred` cheap truth when **no** member footprint clears the enrichment
  threshold — the company cost gate.

This is a facet-less producer exposing the single **atomic facet** (the exported
`ATOMIC_FACET` constant, never `"*"`).

### Continuity

input-driven: the company re-renders when a **new** eligible person maps to it or
its evidence materially changes. The diamond's payoff is memoization: when
`alice`'s footprint wakes `acme` it renders once; when `bob`'s footprint then
wakes the same `acme`, the company truth has **not** moved, so the resolver
memo-**skips** — the shared enrichment is paid once and **reused**, not re-run per
stargazer. Enrich each company once and share the receipt.
