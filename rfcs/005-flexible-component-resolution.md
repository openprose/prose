# RFC 005: Package-Bounded Component Resolution

**Status:** Proposed
**Date:** 2026-04-21
**Author:** Dan B. (OpenProse)

## Problem

Forme's component resolution (`forme.md` §Step 2) accepts four locations:

1. `./<name>.md` — same directory as the entry point
2. `./<name>/index.md` — a subdirectory with an `index.md`
3. `.deps/<owner>/<repo>/<path>.md` — git-native dependencies
4. Registry shorthand (compatibility)

This works for **flat** layouts (all services in one directory), **single-subdir** layouts (`./name/index.md`), and **externalized-as-dep** (`use "my-org/shared-bits"`). It does not accommodate the **layered / categorized** shape that appears as soon as a customer project grows past a handful of files:

```
customers/acme/
  responsibilities/     # orchestration programs that coordinate services
  services/             # leaf services shared across programs
    firehose/           # categorized subdirectories
    enrichment/
  delivery/             # cadence + channel wrappers around responsibilities
  evals/
```

A delivery composite in `delivery/` that references a responsibility in `responsibilities/` (which delegates to services under `services/firehose/` and `services/`) has no resolution path today. The spec's four rules only look inside the entry point's own directory, one level deeper, or in `.deps/`.

Today's workarounds:

1. **Flatten the tree.** Collapse every service into one directory alongside the program that uses it. Destroys the architectural separation; shared services get duplicated or ambiguously assigned.
2. **`./name/index.md` subdirs.** Force every service into its own named subdirectory with an `index.md`. Fights natural Markdown conventions and produces deep, sparse trees.
3. **`use` everything.** Turn every internal module into a `.deps/`-installed git dep. Massive overhead for an internal refactor.
4. **Rely on runtime fuzzy matching.** Fail Phase 1 wiring and let the VM agent grep/glob for the file. Silently undermines tenet T16 ("Components don't discover each other — Forme discovers them"); no deterministic linter can reproduce it.

## Scenarios

1. **Niural GTM pipeline (`customers/prose-niural/`).** Delivery composite in `delivery/`, responsibility in `responsibilities/`, 7 services spread across `services/` and `services/firehose/`. No cross-directory references resolve today.

2. **Rippling GTM (`customers/prose-rippling/`).** Delivery composites in `programs/delivery/` reference core programs in `programs/startup-gtm/`. Under current rules these never resolve. The actual run traces in `.prose/runs/` all target core programs standalone — the delivery composites appear to have never been successfully wire-tested.

3. **Internal stdlib.** A customer building reusable workers/critics/renderers under `customers/acme/lib/{roles,renderers,evals}/` today cannot reference `markdown-renderer` from a program outside `lib/renderers/` without externalizing `lib/` as a git dep.

## Proposal

Forme resolves components by walking the **package**, bounded by a package root marker. No per-program configuration required.

### Expanded resolution order

For each entry in `### Services`, locate the corresponding `.md` file:

1. `./<name>.md` — entry point's own directory
2. `./<name>/index.md` — subdirectory with an `index.md`
3. **Package-bounded walk.** From the entry point, walk up the filesystem to the nearest ancestor that contains any package root marker (see below). From that ancestor, recursively scan every `.md` file under the subtree, skipping excluded directories. A component matches when its frontmatter `name:` equals the wanted name, or — if the file declares no `name:` frontmatter — when its filename stem matches.
4. `.deps/` — git-native dependencies (unchanged).
5. Registry shorthand (compatibility, unchanged).

A structured service entry may carry an explicit `path:` field. `path:` is an absolute override — Forme resolves the entry directly against that path (relative to the program file) and skips all other rules. Use `path:` for one-off cross-package references or forced disambiguation; the primary pattern remains plain name references resolved through the package walk.

### Package root

The package root is the nearest ancestor directory (walking up from the entry point file, inclusive) containing any of:

- `.prose/` — the runtime's workspace directory
- `prose.lock` — the dependency lockfile

If no ancestor carries a marker, the entry point's own directory is the package root (single-file programs keep working with no setup).

A package root marker is load-bearing: it declares "this directory and its subtree are one coherent OpenProse project." Authors who want to split one filesystem tree into multiple independent packages do so by placing markers at the desired boundaries.

### Walk exclusions

The walk never traverses:

- `.deps/` — dependencies are resolved through rule (4), not the walk
- `.prose/` — runtime artifacts, not source
- `.git/`, `node_modules/`, `.venv/`, `dist/`, `build/`, `target/` — conventional non-source directories
- Any directory whose name begins with `_` — author convention for "ignore me" (mirrors many language toolchains)

### Name uniqueness as convention

Within a package, a component name is a unique identifier. Authors name components by purpose; Forme finds them. Multiple `.md` files in the walk matching the same name is a **hard error**:

```
[Error] Ambiguous component 'entity-resolver'
  Found in package root ./customers/acme/:
    - ./services/entity-resolver.md
    - ./lib/enrichment/entity-resolver.md
  Forme will not silently prefer one over the other.
  Fix: rename one of them, or pin the intended file with an explicit 'path:' in the service entry.
```

This preserves tenet T2 ("do not add deterministic fallbacks or type systems to replace model judgment") — there is no "first wins" or "closer wins" rule that authors must remember.

### Error messages

"Component not found" lists every location checked. For the walk, it summarizes rather than enumerating every `.md` file scanned:

```
[Error] Component not found: 'pre-fundraise-radar'
  Searched:
    - ./pre-fundraise-radar.md
    - ./pre-fundraise-radar/index.md
    - package walk rooted at ./customers/prose-niural/ (47 .md files scanned, 0 matches)
    - .deps/ (no matching path)
  Entry point: customers/prose-niural/delivery/niural-pre-fundraise-daily.md

  Hint: Forme expects 'pre-fundraise-radar' to be the frontmatter `name:` of
  some .md file in the package. Verify the name or add a `path:` override.
```

### Manifest transparency

The manifest already records each service's resolved source path. Authors debug resolution by reading the manifest (or running `prose lint`, which produces the same walk resolution). No silent behavior: the walk is reproducible and its output is inspectable.

## Tenet Check

| Tenet | Impact |
|-------|--------|
| **T2** (trust the model; no deterministic fallbacks) | **Strengthened.** The walk leans into the intelligent-container framing rather than requiring explicit configuration. Ambiguity is still a hard error, not a silent pick. |
| **T7** (two things — component and container) | Preserved. No new component kind. Package root is a filesystem convention, not a new kind of thing. |
| **T11** (interpreter-spec pattern) | Preserved. The walk algorithm lives in `forme.md`, expressed as prose. |
| **T12** (Forme owns opinions about program structure) | **Strengthened.** Forme now has an opinion about package boundaries and name uniqueness, which is where the opinion belongs. |
| **T16** (components don't discover each other; Forme discovers them) | **Strengthened.** Components never know anything about the filesystem layout. The package root marker is read only by Forme. |

## Compatibility

Fully backward compatible. Existing programs resolve identically because:

- The current rules (1), (2), (4), (5) remain as-is.
- The new walk rule (3) only fires when the current rules don't match. A flat program where every service is a sibling of the entry point still resolves in rule (1).
- A program at the filesystem root (no marker above it) treats its own directory as the package root, so the walk searches only the flat directory — same as today.
- No file layout becomes invalid.

A program that today relies on a service being unresolvable (why would it?) could theoretically break if the walk now finds it. This is unlikely in practice; it would indicate the name had been chosen for something else in the tree and the program author did not realize.

## Non-Goals

- **Cross-package resolution via walks.** The walk stops at the package root. To reference a component in another package, install it as a dep or use `path:`. This keeps packages self-contained and predictable.
- **Recursive package roots.** If two nested directories both carry package markers, the walk stops at the nearest (closest to the entry point). Authors who nest packages are explicitly declaring they want resolution bounded tighter.
- **Glob patterns in `### Services`.** Services should still be named. The walk resolves names; it does not enumerate them.
- **Name-mangling / auto-namespacing.** A collision within a package means the author needs to pick better names or use `path:`. Auto-prefixing with the directory name would make refactors silently change names.

## Trade-offs

**In favor:**

- Zero per-program configuration. Conventional layouts just work.
- Name uniqueness is a natural hygiene signal. Authors hit collisions early and fix them by clarifying intent.
- Aligns tighter with the "trust the model" bet: more intelligence in the container, less configuration ritual.
- Package boundary is explicit (the marker file) but lightweight (one file per project).

**Against:**

- Phase 1 cost is O(files-in-package). For a customer project with a few hundred `.md` files, the walk scans all of them on every `prose run` / `prose lint`. Still one-time-per-run and typically well under a second; can be cached if it ever becomes a hot path.
- Collisions at scale — a project with 500+ components risks accidental name overlap. Mitigated by name-by-purpose discipline and the hard-error behavior (you find out immediately).
- Requires a package root marker. Any author using `.prose/` (i.e., everyone who has ever run `prose run`) already has one; greenfield projects need to `mkdir .prose` or add `prose.lock` via `prose install`. This is a one-time setup cost.

## Worked Example

### Before (current spec — cannot wire)

```
customers/prose-niural/
  .prose/                                      # package root marker
  delivery/
    niural-pre-fundraise-daily.md              # kind: program
  responsibilities/
    pre-fundraise-radar.md                     # kind: program
  services/
    entity-resolver.md                         # kind: service
    fusion-scorer.md
    outbound-drafter.md
    same-day-news-backstop.md
    firehose/
      form-d-daily.md
      first-cfo-hire-daily.md
      ch-sh01-cluster-daily.md
```

Running `prose lint` on `delivery/niural-pre-fundraise-daily.md` today:

```
[Error] Component not found: 'pre-fundraise-radar'
  Searched:
    - ./pre-fundraise-radar.md
    - ./pre-fundraise-radar/index.md
    - .deps/ (no matching path)
```

### After (with package walk)

No changes to the files. Same layout. Same `### Services` lists.

```markdown
---
name: niural-pre-fundraise-daily
kind: program
---

### Services

- `pre-fundraise-radar`
```

Forme walks the package rooted at `customers/prose-niural/` (marked by `.prose/`), scans `.md` files, finds `responsibilities/pre-fundraise-radar.md` with frontmatter `name: pre-fundraise-radar`, resolves. The sub-program's `### Services` then resolves `entity-resolver`, `fusion-scorer`, etc. via the same walk.

Authors organize files however they want; names are the contract.

## Spec Changes

This RFC corresponds to a single edit in `skills/open-prose/forme.md` §Step 2:

1. Rewrite the **Resolution order** from 4 items to 5, inserting the package-bounded walk as item (3).
2. Add a new subsection **Package root and walk scope** documenting the marker files, walk exclusions, and name-matching rules.
3. Add a new subsection **Explicit paths** documenting the `path:` field on structured service entries.
4. Extend the "Component not found" error example to show the walk summary.
5. Add an **Ambiguity across the package walk** error to the Errors table in §Step 6.

The accompanying patch to `forme.md` is in the same pull request that opens this RFC.

## Open Questions

1. **Should any existing directory name in `std/` be added to the exclusion list?** Today `composites/`, `controls/`, `roles/`, etc. under `std/` are already reachable via `.deps/openprose/std/`. An author's own `customers/acme/composites/` should be walked. I don't think we need to exclude anything else, but worth flagging.

2. **What about `kind: test` files?** They live alongside programs and have frontmatter `name:`. The walk currently finds them. They're never resolved as components (they're entry points), so this is fine. But if an author names a test the same as a service by accident, the hard-error surfaces it. Acceptable behavior or worth calling out?

3. **Do we want a `.proseignore` file** analogous to `.gitignore`, for authors who want to exclude additional directories from the walk beyond the default exclusions? Probably not for V1 — the default exclusion list is already reasonable. Can be added later if real demand emerges.

4. **Runtime fuzzy resolution.** Today's runtime agent sometimes finds components through grep/glob when Forme's Phase 1 fails. With this RFC, Phase 1 should succeed for all reasonable layouts — should we explicitly forbid the runtime fallback, making Phase 1 the single source of truth for resolution? I lean toward "yes" — one resolution algorithm, expressed in `forme.md`, full stop. But this is a runtime behavior change worth calling out.
