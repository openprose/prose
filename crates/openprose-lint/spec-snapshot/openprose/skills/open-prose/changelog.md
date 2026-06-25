---
role: upgrade-history
summary: |
  Compact OpenProse version history and model-guided upgrade instructions.
  Load only for `prose upgrade`, `prose upgrade --dry-run`, or when diagnosing
  potentially outdated project structure.
---

# OpenProse Changelog

This file is the deferred upgrade brain. `SKILL.md` names old-structure smells;
load this file only after the user asks for an upgrade or wants the migration
plan.

## Current Conventions

- Authored source files are `*.prose.md`.
- `kind: responsibility` files declare stable `id:` frontmatter. The id is
  generated once by tooling as UUIDv7-compatible bytes, rendered as uppercase
  Crockford base32, and preserved across display-name and filepath renames.
- `### Tools` applies to `function` and `responsibility`. Tool declarations
  support both `cli:<name>` and `mcp:<name>` and fail closed when the host
  cannot resolve a declared capability. Resolved responsibility tools are
  preserved in the compile-phase IR and run activation payloads.
- Every workspace has an active OpenProse root.
- Native repositories use the repository root as the OpenProse root.
- Attached repositories use `repo/.agents/prose`.
- User-global OpenProse uses `~/.agents/prose`.
- The root contains `src/`, `dist/`, `runs/`, `state/`, `deps/`,
  `prose.lock`, and `.env`.
- Durable cross-run agents live in `state/agents/`.
- Each responsibility's persisted world-model and its signed, append-only
  receipt ledger are the durable cross-run truth; there is no separate status or
  pressure store (the judge loop is retired).
- Multi-file systems conventionally use `index.prose.md`.
- Generated run internals include the compiled activation manifest,
  `root.prose.md`, and `vm.log.md`.

## History

- `v0.4.x`: early skill discovery, `prose help`, filesystem state, examples in
  the skill directory, migration guide.
- `v0.5.x`: SQLite state management, recursive blocks, PostgreSQL state backend.
- `v0.6.x` and `v0.7.x`: RLM examples, mid-program inputs, remote program
  resolution, registry URL documentation, meta-level examples.
- `v0.8.x`: library and memory programs, simplified registry syntax,
  interactive example, system-prompt support.
- `v0.9.0`: v2 migration. Legacy `.prose` files were removed, examples and
  library programs moved to Contract Markdown `.md`, and the old migration
  helper moved under the open-prose skill.
- CLI `0.1.x`: real `prose` CLI and harness support shipped, including Claude
  and Codex plugin surfaces.
- `v0.12.0`: Responsibility Runtime release. Vocabulary settled on `kind:
  service`, `kind: system`, `kind: gateway`, `kind: test`, `kind: pattern`,
  and `kind: responsibility`; patterns replaced topology/composite language;
  source files moved to `*.prose.md`; generated run files were disambiguated;
  the filesystem model settled on a single OpenProse root with `src/`, `dist/`,
  `runs/`, `state/`, and `deps/`; `prose compile` emits
  `dist/manifest.next.json`; `prose serve` consumes
  `dist/manifest.active.json`; `prose status` reads active IR, trigger plans,
  recent runs, and responsibility status/pressure from the OpenProse root.
- `v0.15.0` (`runtime_contract: 1 → 2`): **Intelligent React overhaul.** The
  judge → verdict → pressure → fulfillment loop is retired wholesale and
  replaced by a deterministic reconciler: a render runs only when a node's
  subscribed input fingerprints or its own contract fingerprint move, and the
  commit object is a `Receipt` carrying `fingerprints` / `wake` / `status`
  (`rendered` | `skipped` | `failed`) — there is no LLM in the wake/commit
  decision. The kind taxonomy is re-cleaved around the single render atom:
  `kind: service` is **renamed to `kind: function`** (a called, ephemeral
  helper with `### Parameters` → `### Returns`); `kind: system` is **deleted**
  (composition is intra-node ProseScript `call` or cross-node subscription, not
  a third autowired graph kind); `kind: responsibility` is **reshaped** into an
  executable mounted DAG node that gains `### Requires` + `### Maintains` and
  loses its judge framing; `kind: gateway` stays as sugar for an external-driven
  responsibility (now declares `### Continuity: external-driven`). `### Ensures`
  is **renamed to `### Maintains`** and re-purposed as the world-model schema
  (type / canonicalization spec / facets / postconditions), not just an output
  list. `### Criteria` folds into `### Maintains` postconditions; `### Memory`
  folds into the persisted world-model on a responsibility and is dropped on a
  function; `### Fulfillment` folds into the render or a delegated function.
  Forme moves from a per-`system` manifest compiler to a compile-phase render
  that wires the responsibility DAG (`### Requires` ↔ `### Maintains`) and
  registers external-driven entry points. ProseScript, the `prose
  compile`/`serve`/`run` command surface, dependency resolution (`deps.md`), and
  single-session `function` run semantics are unchanged in shape — only the
  vocabulary they carry moves. Existing runtime data (old `ReceiptV0` ledgers,
  the policy registry, bundled `runs/`/`state/`/`dist/`) is greenfield, not
  migrated; only **source text** upgrades. `prose upgrade` gains the source
  rewrites below — mechanical where safe, surfaced as manual-review diagnostics
  where judgment is needed (`system`/`### Wiring` flatten-or-split).

## Upgrade Command

`prose upgrade --dry-run`:

1. Inspect the current working directory, repository root when detectable, and
   any explicitly supplied path.
2. Look for old structures: `.prose/`, `~/.prose/`, `.deps/`,
   `.agents/prose/agents/`, `dist/prose/`, lockfiles outside the active
   OpenProse root, plain source `*.md` with `kind:`, standalone `*.prose`,
   `index.md`, `manifest.md`, `root.md`, and `state.md`.
3. Inspect nearby files before deciding. Do not rely only on filenames.
4. Print the exact planned moves, renames, content rewrites, and skipped
   ambiguous items. Do not edit files.

`prose upgrade`:

1. Run the same inspection and planning pass.
2. Apply only changes with clear source and destination paths.
3. Preserve content and provenance. Prefer moves/renames over delete/recreate.
4. Update nearby references after renaming files.
5. Report every change and every ambiguity left for the user.

## Migration Map

| Old | Current |
|-----|---------|
| `.prose/.env` | `<openprose-root>/.env` |
| `.prose/runs/` | `<openprose-root>/runs/` |
| `.prose/agents/` | `<openprose-root>/state/agents/` |
| `.agents/prose/agents/` | `<openprose-root>/state/agents/` |
| `~/.prose/` | `~/.agents/prose/` |
| `.deps/` | `<openprose-root>/deps/` |
| `dist/prose/` | `<openprose-root>/dist/` |
| misplaced `prose.lock` | `<openprose-root>/prose.lock` |
| source `*.md` with `kind:` | `*.prose.md` under `<openprose-root>/src/` |
| `index.md` system root | `index.prose.md` |
| standalone `*.prose` | `*.prose.md` with Contract Markdown frontmatter and `### Execution` |
| run `manifest.md` | compiled activation manifest |
| run `root.md` | `root.prose.md` |
| run `state.md` | `vm.log.md` |

## Migration Map: Kinds & Sections (`runtime_contract: 1 → 2`)

This is the `v0.15.0` source rewrite. `prose upgrade` keys its applicability off
`runtime_contract`: a file or root still on contract `1` (or unversioned) is a
candidate. Rename kinds and sections, fold deleted sections with provenance
preserved, and surface judgment calls as diagnostics rather than guessing.

| Old | New | Note |
|-----|-----|------|
| `kind: service` | `kind: function` | callable; `### Requires`/`### Ensures` → `### Parameters`/`### Returns` |
| `kind: system` + `### Services`/`### Wiring` | *(removed)* | flatten to intra-node `call`, or split into responsibilities wired by Forme — **manual-review diagnostic**, never auto-guessed (sequential workflows flatten; parallel fan-in splits) |
| `kind: responsibility` (judge-era) | `kind: responsibility` (reshaped) | add `### Requires` + `### Maintains`; fold `### Criteria` → `### Maintains` postconditions, `### Fulfillment` → render/function, `### Constraints` → `### Invariants`/`### Shape` |
| `kind: gateway` | `kind: gateway` | add explicit `### Continuity: external-driven` |
| `### Ensures` | `### Maintains` | world-model schema (type / canonicalization / facets / postconditions) — re-purpose, not just rename |
| `### Memory` | *(removed)* | folds into the persisted world-model (responsibility) / dropped (function) |
| `### Criteria` (responsibility) | *(removed)* | folds into `### Maintains` postconditions — no separate judge beat |
| `### Wiring` / `### Services` (system) | *(removed)* | deleted with `system`; composition is `call` or subscription |
| judge runtime (`runtime/judge-responsibility.prose.md`, status/pressure/verdict) | *(removed)* | retired; the deterministic reconciler replaces it |

**What is greenfield, not migrated.** The vocabulary upgrade covers **source
text only**. Existing runtime data — old `ReceiptV0`-shaped ledgers, the policy
registry, and bundled `runs/`/`state/`/`dist/` artifacts — is **abandoned**, not
converted. No receipt-data migrator is written.

**Manual-review diagnostics.** `prose upgrade --dry-run` flags, without
auto-applying: any `kind: system` (flatten vs split), any `### Wiring`, any
judge-era `kind: responsibility`, and any `service`-with-subscription-shaped
`### Requires` that is only *called* (it may be a `function`, not a node). Each
is surfaced with a clear explanation so the author decides.

## Standalone `.prose` Migration

Infer the Contract Markdown wrapper:

- `input name: "description"` becomes a `### Parameters` entry `name` (callable)
  or a `### Requires` entry `name` (a mounted, subscribed responsibility).
- `output name = expression` becomes a `### Returns` entry `name` on a
  `function`, or a `### Maintains` truth on a `responsibility`; preserve the
  expression in `### Execution`.
- `return value` remains the execution result.
- `use` declarations remain in the execution block when the script intentionally
  calls installed dependency `function`s directly via ProseScript `call`.
- Add `kind: function` for a plain callable. A standalone script that composes
  several steps becomes one `responsibility` (intra-node `call` choreography in
  `### Execution`) or several responsibilities wired by Forme — never `kind:
  system`, which no longer exists.

When the old script's interface cannot be inferred confidently, dry-run must
name the uncertainty. Full upgrade should ask before changing that file.
