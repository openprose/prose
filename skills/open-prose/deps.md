---
role: dependency-resolution
summary: |
  How OpenProse resolves git-native dependencies from `use` statements,
  service references, and composite references. Defines the resolution
  algorithm, the `prose install` command, the lockfile format, and the `.deps/`
  directory structure. GitHub is the registry.
see-also:
  - prose.md: VM execution semantics (loads resolved deps at runtime)
  - forme.md: Wiring semantics (resolves service components from .deps/)
  - SKILL.md: Command routing for `prose install`
---

# Dependency Resolution

OpenProse uses a git-native dependency model. `use` statements, dependency-like
service names, and `compose:` references can point at GitHub repositories. There
is no registry server — GitHub IS the registry. Dependencies are cloned into
`.deps/`, pinned in `prose.lock`, and resolved from disk at runtime.

---

## `use` Statement Parsing

A `use` statement resolves to a GitHub repository and a path within it.

```prose
use "openprose/std/evals/inspector"
```

Parsed as:

| Component | Value |
|-----------|-------|
| Owner | `openprose` |
| Repo | `std` |
| Path | `evals/inspector` |
| GitHub URL | `github.com/openprose/std` |
| Local clone | `.deps/openprose/std/` |
| Resolved file | `.deps/openprose/std/evals/inspector.md` |

The first two segments of the `use` path are always `owner/repo`. Everything after is a path within the cloned repository.

### `std/` Shorthand

`std/` expands to `openprose/std/`:

```prose
use "std/evals/inspector"
# equivalent to:
use "openprose/std/evals/inspector"
```

### File Extension Resolution

If the `use` path includes an explicit extension (`.md` or `.prose`), use it. If no extension, prefer `.md`:

```prose
use "alice/tools/formatter"
# resolves to: .deps/alice/tools/formatter.md
```

### Aliasing

`use` statements support `as` aliases in execution blocks:

```prose
use "alice/research-pipeline" as research

let result = research(topic: "quantum computing")
```

In `### Services`, use the full path — aliases are for execution blocks only.

---

## Resolution Algorithm (Runtime)

When the VM or Forme encounters a `use` path at runtime:

1. Expand `std/` shorthand to `openprose/std/` if applicable
2. Parse `owner/repo` from the first two segments
3. Check `.deps/{owner}/{repo}/` exists on disk
4. If not found, error immediately (see Error Handling below)
5. Resolve the remaining path segments within the cloned repo
6. Return the absolute file path

**No network calls during resolution.** All dependencies must be pre-installed via `prose install`. The VM reads from `.deps/` on disk only.

---

## `prose install`

Scans the project for dependency references and clones missing dependencies.

### Algorithm

1. **Scan** all `.md` and `.prose` files in the project for:
   - `use "owner/repo/path"` statements
   - service names in `### Services` that start with `std/` or `owner/repo/`
   - `compose:` paths that start with `std/` or `owner/repo/`
2. **Parse** each dependency path to extract `owner/repo` pairs
3. **Expand** `std/` shorthand to `openprose/std/`
4. For each unique `owner/repo`:
   a. If `.deps/{owner}/{repo}/` does not exist, full clone: `git clone github.com/{owner}/{repo} .deps/{owner}/{repo}/`
   b. If `prose.lock` has a pinned SHA for this repo, checkout: `git checkout {sha}`
   c. If no pinned SHA exists (new dependency), use HEAD and record the SHA
5. **Scan transitive dependencies** — scan all `.md` and `.prose` files within newly cloned repos in `.deps/` for their own `use` statements
6. **Cycle detection** — if a newly discovered dependency is already in the resolved set, skip it. If scanning reveals a cycle (A requires B requires A), error: `[Error] Circular dependency detected: A → B → A`
7. **Repeat** from step 2 with any newly discovered dependencies until no new deps are found
8. **Write** `prose.lock` with all resolved SHAs (direct and transitive, flat list)

### Transitive Resolution (Multi-Pass)

Dependencies can themselves have dependencies. `prose install` resolves transitively:

```
Pass 1: Scan project files → find direct deps → clone them
Pass 2: Scan .deps/ for new use statements → find transitive deps → clone them
Pass 3: Scan newly cloned transitive deps → find more → clone
...repeat until stable (no new deps discovered)
```

If a cycle is detected at any pass, `prose install` errors immediately and lists the cycle path. Cycles indicate a design problem in the dependency graph — they cannot be auto-resolved.

All dependencies — direct and transitive — are pinned in the flat `prose.lock`.

### Version Conflict Resolution

If two dependencies require the same repo at different commits, `prose install` auto-resolves to the **newer SHA** (by commit date) and emits a warning:

This is a convenience policy, not a proof of compatibility. Treat the warning as
review-required: inspect the affected dependency, run relevant tests, and commit
the resulting `prose.lock` only when the newer version is acceptable.

```
[Warning] Version conflict for alice/utils:
  Required by: your-project (a1b2c3d)
  Required by: bob/toolkit (f6e5d4c)
  Resolved to: f6e5d4c (newer, 2026-04-01)
  Override: manually edit prose.lock if needed
```

This is not an error. The user can override by editing `prose.lock` directly.

### Private Repositories

`prose install` uses the user's existing git credential helpers transparently. SSH keys, `gh` auth, `.netrc` — whatever git is configured to use for `github.com` works for `prose install`.

---

## `prose install --update`

Bumps all pinned SHAs to the latest HEAD of their default branch.

### Algorithm

1. For each `owner/repo` in `prose.lock`:
   a. Run `git fetch` in `.deps/{owner}/{repo}/`
   b. Get the latest HEAD SHA
   c. Run `git checkout {new-sha}`
2. **Re-scan** for transitive dependencies (new versions may add or remove `use` statements)
3. **Rewrite** `prose.lock` with updated SHAs

---

## `prose.lock` Format

Plaintext. One line per dependency. Format: `owner/repo sha`.

```
# prose.lock — pinned dependency versions
# Do not edit unless you know what you're doing
openprose/std a1b2c3d4e5f6
alice/research f6e5d4c3b2a1
alice/utils 9c8d7e6f5a4b
```

Rules:
- One dependency per line
- Format: `{owner}/{repo} {sha}` (space-separated)
- Comments start with `#`
- Direct and transitive dependencies listed flat — no nesting, no hierarchy markers
- URL is derivable: `github.com/{owner}/{repo}`
- Order does not matter (but `prose install` writes them sorted alphabetically)

`prose.lock` is **committed to git**. It ensures reproducible builds — anyone cloning the project gets the same dependency versions.

---

## `.deps/` Directory Structure

```
.deps/
├── openprose/
│   └── std/                          # Full clone of github.com/openprose/std
│       ├── evals/
│       │   ├── inspector.md
│       │   ├── vm-improver.md
│       │   ├── program-improver.md
│       │   ├── cost-analyzer.md
│       │   ├── calibrator.md
│       │   ├── profiler.md
│       │   └── error-forensics.md
│       └── memory/
│           ├── user-memory.md
│           └── project-memory.md
├── alice/
│   └── research-pipeline/            # Full clone of github.com/alice/research-pipeline
│       └── ...
└── bob/
    └── toolkit/                      # Transitive dep, also a full clone
        └── ...
```

**`.deps/` MUST be in `.gitignore`.** It is a cache, fully reproducible from `prose.lock` via `prose install`.

Each entry under `.deps/` is a full git clone (or shallow clone) of the corresponding GitHub repository, checked out to the SHA pinned in `prose.lock`.

---

## Runtime Behavior

At execution time, the VM and Forme resolve `use` paths by reading from `.deps/` on disk.

- **No git operations** during execution
- **No network calls** during execution
- **No auto-install** — `prose run` does not run `prose install` implicitly

If a dependency is missing or `.deps/` does not exist:

```
[Error] Dependency not found: openprose/std
  Run `prose install` to install dependencies.
```

If `prose.lock` exists but `.deps/` is missing or incomplete, the same error applies. The user must run `prose install`.

---

## Interaction with Forme

When Forme resolves a service listed in `### Services`, it checks `.deps/` as part of its resolution order (see `forme.md`, Step 2):

1. Same directory as the entry point: `./researcher.md`
2. A subdirectory matching the name: `./researcher/index.md`
3. **`.deps/` directory:** `.deps/{owner}/{repo}/{path}.md`
4. Registry shorthand (if contains `/`): fetch from `https://p.prose.md/{path}` (compatibility path)

A service name like `std/evals/inspector` in `### Services` resolves to `.deps/openprose/std/evals/inspector.md` after `std/` shorthand expansion.

---

## Interaction with the VM

When the VM encounters a `use` statement during execution:

1. Expand shorthand (`std/` → `openprose/std/`)
2. Parse `owner/repo` and remaining path
3. Read the program from `.deps/{owner}/{repo}/{path}.md`
4. Parse the imported program's contract (`### Requires` / `### Ensures`)
5. Register the import (with alias if `as` was used)

This replaces the historical behavior of fetching from `p.prose.md` at runtime. Programs resolved from `.deps/` are already on disk — no fetch needed.

### Backward Compatibility with ProseScript

ProseScript gains an additional resolution step for `use` statements:

1. If the path matches `owner/repo/...`, check `.deps/owner/repo/...` first
2. If found in `.deps/`, load from disk (no network)
3. If not found, fall back to `https://p.prose.md/{path}` (existing behavior)

Existing `.prose` programs without `.deps/` continue to work via the p.prose.md fallback.

---

## Interaction with p.prose.md

The registry at `p.prose.md` shifts to a **discovery-only** role:

| Use case | Resolution |
|----------|------------|
| `use "owner/repo/path"` in a program | Git-native via `.deps/` (requires `prose install`) |
| `prose run handle/slug` at the CLI | Still resolves via `https://p.prose.md/{path}` |
| Browsing/searching for programs | `p.prose.md` website |

`use` statements resolve via git. The CLI `prose run handle/slug` shorthand can still use p.prose.md as a convenience for ad-hoc execution.

---

## Summary

| Concept | Detail |
|---------|--------|
| Registry | GitHub (no custom registry server) |
| Install command | `prose install` (explicit, not auto) |
| Update command | `prose install --update` |
| Lockfile | `prose.lock` (plaintext, committed) |
| Cache directory | `.deps/` (gitignored) |
| Shorthand | `std/` → `openprose/std/` |
| Clone strategy | Full clone (supports SHA checkout without refetch) |
| Transitive deps | Multi-pass scan until stable (errors on cycles) |
| Version conflicts | Auto-resolve to newer SHA with warning |
| Runtime resolution | Disk only, no network |
| Private repos | Uses existing git credentials |
