---
name: contract-source-projector
kind: function
version: 0.16.0
---

# Contract Source Projector

Continuously materialize settled design into one readable OpenProse directory
package.

### Parameters

- `rendered`: updated architecture, constraints, proposals, and diagnostics
- `current`: current package source, supporting decisions, and frozen-source facts
- `test_suite`: ordered test sources and readiness gates

### Returns

- `source_projection`: complete source tree containing:
    - full Contract source for resolved regions
    - explicit architect markers for provisional or unresolved regions
    - provenance per changed region: `compose-managed`, `human-frozen`, or
      `discovered-candidate`
    - source changes proposed for this cycle
    - package-level and Contract-level `kind: test` source for resolved behavior
    - compile readiness and remaining blockers

### Invariants

- The directory package is the canonical persisted program. The working
  architecture proposes changes to it; it does not remain a parallel truth
  after persistence.
- The root `index.prose.md` owns system-level intent and composition. Child
  Contracts own local promises and interfaces.
- Materialization is progressive, not a final batch generated after all
  questions are answered.
- Never fill an unresolved semantic boundary with plausible prose merely to
  make a file look complete.
- Never overwrite `human-frozen` procedure without an explicit decision.
- Every public promise change is visible in the mental-model sync before it is
  persisted.
- Keep tests beside the package they constrain. A public promise is not resolved
  until its package-level test expresses the observable outcome and important
  exclusions.
- Resolved source uses current Contract Markdown and remains suitable for
  focused refinement through `prose write`.

### Strategies

- Prefer stable filenames and Contract identities as specificity increases.
- Use concise HTML comments for unresolved architect decisions so ordinary
  Markdown remains readable.
- Remove a marker when its underlying constraint is resolved; do not retain a
  shadow checklist elsewhere.
- Report `compile-ready` only when no blocking markers remain.
