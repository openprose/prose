---
name: construction-lane
kind: responsibility
---

# Construction Lane

> The shape of EACH of the six statically-mounted construction lanes
> (`lane-sdk-world-model`, `lane-sdk-runtime`, `lane-sdk-compile`,
> `lane-skill-contract`, `lane-examples-tests`, `lane-docs-signposts`). They are
> declared up front and never created at run time. A lane wakes only when its own
> work-plan facet OR the foundation moves; when it has no work it publishes an
> explicit no-op `LaneState` and memo-skips on later unchanged runs.

### Goal

Each lane proposes the file changes, tests, and export requests for ONLY its owned
paths, conforming to the shared foundation, without reading or editing another
lane's paths.

### Requires

Each lane subscribes to a NARROW input set — its own work-plan facet plus the
shared foundation. This is the facet-level lane invalidation the example teaches:
a lane never wakes on a sibling lane's change.

- `lane`: the lane's OWN slice of the work plan — e.g. `lane:sdk-runtime` for the
  SDK Runtime lane. *(A named facet of `implementation-work-plan`.)*
- `shared-shapes`: the shared foundation every lane conforms to. *(A named facet
  of `foundation-builder`.)*
- `foundation-review`: the gate that must accept the foundation first.

### Maintains

The world-model schema — one `LaneState` per lane.

**Type** — the maintained truth carries:

- `status`: `proposed`, `no-op`, or `out-of-bounds`
- `owned_paths`: the path prefix this lane is allowed to touch
- `patch_set`: the proposed file changes (CONFINED to `owned_paths`)
- `tests_added`, `exports_needed`, `signpost`, `open_issues`, `verification_notes`

**Canonicalization spec** — the lane's atomic truth. A lane that proposes a patch
OUTSIDE its owned paths (or into a forbidden file) is flagged `out-of-bounds`; the
`construction-review` will reject it and `integration-builder` will exclude it.

### Continuity

Input-driven. Skip when the lane facet and the foundation fingerprints are
unchanged — an unrelated lane's change never wakes this lane. A construction lane
does NOT commit; it publishes a lane state for the review to accept or reject.
