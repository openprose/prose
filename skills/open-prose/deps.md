---
role: dependency-resolution
summary: |
  How OpenProse resolves git-native dependencies from `use` statements,
  service references, and pattern references. Defines the resolution
  algorithm, the `prose install` command, the lockfile format, and the `.agents/prose/deps/`
  directory structure.
see-also:
  - prose.md: VM execution semantics (loads resolved deps at runtime)
  - forme.md: Wiring semantics (resolves services and systems from .agents/prose/deps/)
  - SKILL.md: Command routing for `prose install`
---

# Dependency Resolution

OpenProse uses a git-native dependency model. `use` statements, dependency-like
service names, and `pattern:` references can point at any explicit git host.
Dependencies are cloned into `.agents/prose/deps/`, pinned in `.agents/prose/prose.lock`, and resolved from
disk at runtime.

---

## `use` Statement Parsing

A `use` statement names an explicit git host, owner, repo, and path. The
canonical form is `host/owner/repo/path`:

```prose
use "github.com/openprose/prose/packages/std/evals/inspector"
```

Parsed as:

| Field | Value |
|-------|-------|
| Host | `github.com` |
| Owner | `openprose` |
| Repo | `prose` |
| Path | `packages/std/evals/inspector` |
| Clone URL | host-specific URL for `github.com/openprose/prose` |
| Local clone | `.agents/prose/deps/github.com/openprose/prose/` |
| Resolved file | `.agents/prose/deps/github.com/openprose/prose/packages/std/evals/inspector.prose.md` |

The first path segment is the host (must contain a dot — `github.com`,
`gitlab.com`, `codeberg.org`, `git.company.com`). The next two segments are
always `owner/repo`. Everything after is a path within the cloned
repository.

Any git host works. Nothing in the resolver privileges GitHub — it's the
common case, not a default.

### `std/` and `co/` Shorthands

The OpenProse monorepo hosts two packages. Both get shorthands:

- `std/` → `github.com/openprose/prose/packages/std/`
- `co/` → `github.com/openprose/prose/packages/co/`

```prose
use "std/evals/inspector"
# equivalent to:
use "github.com/openprose/prose/packages/std/evals/inspector"

use "co/systems/company-repo-checker"
# equivalent to:
use "github.com/openprose/prose/packages/co/systems/company-repo-checker"
```

Both shorthands resolve into the same clone of `openprose/prose` under
`.agents/prose/deps/github.com/openprose/prose/`; `packages/std/` and `packages/co/` are
sibling subdirectories inside that clone.

### Bare `owner/repo` Form

Identifiers without a host prefix (e.g. `use "alice/research"`) are reserved
for the OpenProse registry — eventually hosted at `p.prose.md`. That
registry isn't open for publication yet, so the bare form doesn't resolve
today. Write the host explicitly (`github.com/alice/research`) or use the
`std/` shorthand. When the registry opens, the bare form gains a defined
resolution without breaking systems that wrote explicit hosts.

### File Extension Resolution

If the `use` path includes an explicit `.prose.md` extension, use it. If no extension, prefer `.prose.md`:

```prose
use "github.com/alice/tools/formatter"
# resolves to: .agents/prose/deps/github.com/alice/tools/formatter.prose.md
```

### Aliasing

`use` statements support `as` aliases in execution blocks:

```prose
use "github.com/alice/research-pipeline" as research

let result = call research
  topic: "quantum computing"
```

In `### Services`, use the full path — aliases are for execution blocks only.

---

## Resolution Algorithm (Runtime)

When the VM or Forme encounters a `use` path at runtime:

1. Expand `std/` and `co/` shorthands to
   `github.com/openprose/prose/packages/{std|co}/` if applicable
2. Parse `{host}/{owner}/{repo}` from the first three segments
3. Check `.agents/prose/deps/{host}/{owner}/{repo}/` exists on disk
4. If not found, error immediately (see Error Handling below)
5. Resolve the remaining path segments within the cloned repo
6. Return the absolute file path

**No network calls during resolution.** All dependencies must be pre-installed via `prose install`. The VM reads from `.agents/prose/deps/` on disk only.

---

## `prose install`

Scans the project for dependency references and clones missing dependencies.

### Algorithm

1. **Scan** all `*.prose.md` files under `.agents/prose/src/` for:
   - `use "host/owner/repo/path"` statements
   - service names in `### Services` that start with `std/`, `co/`, or `host/owner/repo/`
   - `pattern:` references that start with `std/`, `co/`, or `host/owner/repo/`
2. **Expand** `std/` and `co/` shorthands to `github.com/openprose/prose/packages/{std|co}/`
3. **Parse** each expanded dependency path to extract `{host, owner, repo}` triples (the first segment is the host if it contains a dot)
4. For each unique `{host, owner, repo}`:
   a. If `.agents/prose/deps/{host}/{owner}/{repo}/` does not exist, clone the repository using the host's normal git URL into `.agents/prose/deps/{host}/{owner}/{repo}/`
   b. If `.agents/prose/prose.lock` has a pinned SHA for this repo, checkout: `git checkout {sha}`
   c. If no pinned SHA exists (new dependency), use HEAD and record the SHA
5. **Scan transitive dependencies** — scan all `*.prose.md` files within newly cloned repos in `.agents/prose/deps/` for their own `use` statements
6. **Cycle detection** — if a newly discovered dependency is already in the resolved set, skip it. If scanning reveals a cycle (A requires B requires A), error: `[Error] Circular dependency detected: A → B → A`
7. **Repeat** from step 2 with any newly discovered dependencies until no new deps are found
8. **Write** `.agents/prose/prose.lock` with all resolved `{host, owner, repo, sha}` entries (direct and transitive, flat list)

### Transitive Resolution (Multi-Pass)

Dependencies can themselves have dependencies. `prose install` resolves transitively:

```
Pass 1: Scan project files → find direct deps → clone them
Pass 2: Scan .agents/prose/deps/ for new use statements → find transitive deps → clone them
Pass 3: Scan newly cloned transitive deps → find more → clone
...repeat until stable (no new deps discovered)
```

If a cycle is detected at any pass, `prose install` errors immediately and lists the cycle path. Cycles indicate a design problem in the dependency graph — they cannot be auto-resolved.

All dependencies — direct and transitive — are pinned in the flat `.agents/prose/prose.lock`.

### Version Conflict Resolution

If two dependencies require the same repo at different commits, `prose install` auto-resolves to the **newer SHA** (by commit date) and emits a warning:

This is a convenience policy, not proof that the newer dependency fits every
caller. Treat the warning as review-required: inspect the affected dependency,
run relevant tests, and commit the resulting `.agents/prose/prose.lock` only when the newer
version is acceptable.

```
[Warning] Version conflict for alice/utils:
  Required by: your-project (a1b2c3d)
  Required by: bob/toolkit (f6e5d4c)
  Resolved to: f6e5d4c (newer, 2026-04-01)
  Override: manually edit .agents/prose/prose.lock if needed
```

This is not an error. The user can override by editing `.agents/prose/prose.lock` directly.

### Private Repositories

`prose install` uses the user's existing git credential helpers transparently. SSH keys, `gh` auth, `.netrc` — whatever git is configured to use for `github.com` works for `prose install`.

---

## `prose install --update`

Bumps all pinned SHAs to the latest HEAD of their default branch.

### Algorithm

1. For each `host/owner/repo` in `.agents/prose/prose.lock`:
   a. Run `git fetch` in `.agents/prose/deps/{host}/{owner}/{repo}/`
   b. Get the latest HEAD SHA
   c. Run `git checkout {new-sha}`
2. **Re-scan** for transitive dependencies (new versions may add or remove `use` statements)
3. **Rewrite** `.agents/prose/prose.lock` with updated SHAs

---

## `.agents/prose/prose.lock` Format

Plaintext. One line per dependency. Format: `host/owner/repo sha`.

```
# .agents/prose/prose.lock — pinned dependency versions
# Do not edit unless you know what you're doing
github.com/openprose/prose a1b2c3d4e5f6
github.com/alice/research f6e5d4c3b2a1
gitlab.com/bob/utils 9c8d7e6f5a4b
```

Rules:
- One dependency per line
- Format: `{host}/{owner}/{repo} {sha}` (space-separated)
- Comments start with `#`
- Direct and transitive dependencies listed flat — no nesting, no hierarchy markers
- Host is explicit — no default is assumed, so any git provider works uniformly
- Order does not matter (but `prose install` writes them sorted alphabetically)

`.agents/prose/prose.lock` is **committed to git**. It ensures reproducible builds — anyone cloning the project gets the same dependency versions.

---

## `.agents/prose/deps/` Directory Structure

```
.agents/prose/deps/
├── github.com/
│   ├── openprose/
│   │   └── prose/                       # Full clone of github.com/openprose/prose
│   │       ├── packages/
│   │       │   ├── std/                 # Standard library (resolved by `std/` shorthand)
│   │       │   │   ├── evals/
│   │       │   │   │   ├── inspector.prose.md
│   │       │   │   │   ├── contract-grader.prose.md
│   │       │   │   │   └── regression-tracker.prose.md
│   │       │   │   └── memory/
│   │       │   │       ├── user-memory.prose.md
│   │       │   │       └── project-memory.prose.md
│   │       │   └── co/                  # Company-as-prose (resolved by `co/` shorthand)
│   │       │       └── systems/
│   │       │           └── company-repo-checker.prose.md
│   │       └── ...
│   ├── alice/
│   │   └── research-pipeline/           # Full clone of github.com/alice/research-pipeline
│   │       └── ...
│   └── bob/
│       └── toolkit/                     # Transitive dep, also a full clone
│           └── ...
└── gitlab.com/
    └── team/
        └── repo/                        # Any git host works; host is part of the path
```

**`.agents/prose/deps/` MUST be in `.gitignore`.** It is a cache, fully reproducible from `.agents/prose/prose.lock` via `prose install`.

Each entry under `.agents/prose/deps/` is a full git clone (or shallow clone) of the
corresponding repository, checked out to the SHA pinned in `.agents/prose/prose.lock`. The
host is part of the cache key so repos with the same `owner/repo` name on
different hosts do not collide.

---

## Runtime Behavior

At execution time, the VM and Forme resolve `use` paths by reading from `.agents/prose/deps/` on disk.

- **No git operations** during execution
- **No network calls** during execution
- **No auto-install** — `prose run` does not run `prose install` implicitly

If a dependency is missing or `.agents/prose/deps/` does not exist:

```
[Error] Dependency not found: github.com/openprose/prose
  Run `prose install` to install dependencies.
```

If `.agents/prose/prose.lock` exists but `.agents/prose/deps/` is missing or incomplete, the same error applies. The user must run `prose install`.

---

## Interaction with Forme

When Forme resolves a service listed in `### Services`, it checks `.agents/prose/deps/` as part of its resolution order (see `forme.md`, Step 2):

1. Same directory as the system file: `./researcher.prose.md`
2. A subdirectory matching the name: `./researcher/index.prose.md`
3. **`.agents/prose/deps/` directory:** `.agents/prose/deps/{host}/{owner}/{repo}/{path}.prose.md`
4. Bare `owner/repo` identifiers: reserved for the OpenProse registry (future home at `p.prose.md`); inert today

A service name like `std/evals/inspector` in `### Services` resolves to `.agents/prose/deps/github.com/openprose/prose/packages/std/evals/inspector.prose.md` after `std/` shorthand expansion.

---

## Interaction with the VM

When the VM encounters a `use` statement during execution:

1. Expand shorthand (`std/` → `github.com/openprose/prose/packages/std/`; `co/` → `github.com/openprose/prose/packages/co/`)
2. Parse `{host}/{owner}/{repo}` and remaining path
3. Read the service or system from `.agents/prose/deps/{host}/{owner}/{repo}/{path}.prose.md`
4. Parse the imported service or system contract (`### Requires` / `### Ensures`)
5. Register the import (with alias if `as` was used)

Runtime resolution is disk-only. If a `use` path is missing from `.agents/prose/deps/`, the
VM errors and tells the caller to run `prose install`.

---

## Interaction with p.prose.md

`p.prose.md` is reserved as the future home of the OpenProse registry.
Publication there isn't open yet — no identifier actually resolves via
`p.prose.md` today. When it opens, the bare `owner/repo` form gains a
defined resolution and `p.prose.md` takes on a discovery role (search,
docs, install counts, eval scores, and supported runtimes).

| Use case | Resolution |
|----------|------------|
| `use "github.com/owner/repo/path"` in a system | `.agents/prose/deps/github.com/owner/repo/`; error if missing |
| `use "std/..."` or `use "co/..."` in a system | Expands to `github.com/openprose/prose/packages/{std\|co}/...` then resolves as above |
| `prose run github.com/owner/repo/path` at the CLI | Same algorithm as `use` |
| `prose run github.com/owner/repo/path@{version}` | That specific pinned version in `.agents/prose/deps/`; error if missing |
| `prose run ... --offline` | `.agents/prose/deps/` only; error on miss |
| `use "alice/research"` / `prose run alice/research` | Reserved for the OpenProse registry; inert today |
| Browsing/searching for systems | Not yet available; `p.prose.md` will host this |

`use` and `prose run` share one resolution algorithm. `prose install` is the
explicit "get me every declared dependency at its pinned SHA" command. Neither
`use` nor `prose run` auto-fetches a missing dependency during execution.

---

## Summary

| Concept | Detail |
|---------|--------|
| Package identity | Any git host, named explicitly (`github.com/...`, `gitlab.com/...`); bare `owner/repo` reserved for future `p.prose.md` |
| Install command | `prose install` (explicit, not auto) |
| Update command | `prose install --update` |
| Lockfile | `.agents/prose/prose.lock` (plaintext, committed) |
| Cache directory | `.agents/prose/deps/{host}/{owner}/{repo}/` (gitignored) |
| Shorthands | `std/` → `github.com/openprose/prose/packages/std/`; `co/` → `github.com/openprose/prose/packages/co/` |
| Clone strategy | Full clone (supports SHA checkout without refetch) |
| Transitive deps | Multi-pass scan until stable (errors on cycles) |
| Version conflicts | Auto-resolve to newer SHA with warning |
| Runtime resolution | Disk only, no network |
| Private repos | Uses existing git credentials |
