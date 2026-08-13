# Preflight Briefing — Design Spec

**Date:** 2026-04-08
**Author:** Raymond Weitekamp + Claude

## Problem

The Prose-Complete VM agent reads the program file, `prose.md`, `forme.md`, and other spec files before execution. The program file is markdown — the agent must re-parse frontmatter, contract sections, service lists, and resolution paths from prose. This is redundant work that a fast, deterministic Rust tool can do better, and the parsing introduces room for the agent to misread structure.

## Solution

A new `briefing` subcommand in `openprose-lint` that outputs a versioned, structured markdown block (~200 tokens) containing pre-parsed structural analysis of a Prose program. The briefing is read by the VM agent alongside the spec files before execution.

## Design Principles

1. **Structured data, not narrative.** The format primes the agent into compiler headspace. No prose, no explanation — just extracted facts.
2. **Earn every token.** The briefing competes for context window with the spec and the program itself. ~200-400 tokens max. If a section doesn't save the agent work, cut it.
3. **Deterministic.** Same program file → same briefing output. No LLM in the loop.
4. **Versioned.** The briefing schema is a contract between the linter and the VM spec. The header `<!-- openprose-lint briefing v1 -->` lets the VM spec gate on version.
5. **No interpretation.** The linter extracts structure, not meaning. Strategies, execution logic, and natural-language content pass through to the agent unprocessed.

## Flow

```
prose run program.md
  → linter runs first (Rust, fast, deterministic)
  → briefing output read into agent context
  → agent reads prose.md + forme.md + program file
  → agent executes with structural pre-knowledge
```

## Briefing Schema (v1)

```
<!-- openprose-lint briefing v1 -->
## {name}
kind: {kind} | services: {count} | imports: {count}

### contract
requires:
- {name}: {description}
- {name}: (optional) {description}
ensures:
- {name}
errors:
- {name}: {description}
environment:
- {VAR_NAME}

### services
{service-name} → {resolution}
{service-name} → use: {import-path}

### features
environment: {yes|no} | use-imports: {yes|no} | run-inputs: {yes|no} | execution-block: {yes|no}

### diagnostics
{N} errors, {N} warnings | spec: openprose/prose@{sha}
```

### Section Details

**Header** (`<!-- openprose-lint briefing v1 -->`)
- Version gate. The VM spec can say "if briefing v1 present, read contract and services before wiring."
- Bumped when the schema changes in a way that would confuse a VM expecting the old format.

**Program identity** (one line after `##`)
- `kind`: program, service, or test
- `services`: count of declared services
- `imports`: count of `use:` imports

**Contract** (`### contract`)
- Pre-parsed `requires`, `ensures`, `errors`, `environment` from frontmatter + body.
- Each item on its own line with `- name: description` format.
- Optional items marked with `(optional)` and default values where declared.
- Sections with no items show `(none)`.
- This is the highest-value section — the agent's I/O specification, extracted deterministically.

**Services** (`### services`)
- One line per declared service: `name → resolution`.
- Resolution types:
  - `local ({relative-path})` — found as a .md file
  - `use: {import-path}` — resolved via `use:` import from `.deps/`
  - `inline (### Execution)` — defined implicitly via call statements
  - `vm-managed` — pure-contract program, VM creates the service
  - `unresolved` — not found (linter would also emit MDE051)

**Features** (`### features`)
- Boolean flags for current spec features present in this program.
- Tells the VM which spec paths are load-bearing: a program with `environment: no` doesn't need the env-var verification path from prose.md.

**Diagnostics** (`### diagnostics`)
- One-line summary: error count, warning count, pinned spec SHA.
- Not individual messages — those go to the human via normal lint output.

## Excluded from v1

| Candidate | Reason for exclusion |
|---|---|
| Execution block pre-parse | Interpretation, not extraction. Agent reads `### Execution` directly. |
| Strategy summary | Natural language — linter can't compress without losing info. |
| Cross-program provenance | Runtime concern (run-typed inputs), not static analysis. |
| Full diagnostic messages | For humans, not the VM. Summary line is sufficient. |

## CLI Interface

```bash
# Emit briefing to stdout
openprose-lint briefing program.md

# Emit briefing for a program directory
openprose-lint briefing programs/delivery/

# Pipe into a file for the harness to inject
openprose-lint briefing program.md > .prose/briefing.md
```

Exit code 0 on success (even if diagnostics have warnings). Exit code 1 only on parse failure.

When given a directory, emit one briefing per root program file (`kind: program`), separated by a blank line. The VM runs one program at a time — combined briefings would be noise.

## Versioning Policy

- The `v1` in `<!-- openprose-lint briefing v1 -->` is the schema version.
- Bumped when: section added/removed, section header renamed, field format changes.
- NOT bumped when: new feature flag added to `### features`, new resolution type added to `### services`.
- The VM spec (`prose.md`) should reference the minimum briefing version it understands.

## Testing

- Golden artifact tests: known programs → expected briefing output, compared byte-for-byte.
- Test against all example-app programs + delivery composites + evals + example-lib.
- Regression: any change to briefing output for existing programs must be intentional.

## Future Candidates

- Execution block call graph (if it proves valuable after v1 usage)
- `run`-typed input metadata (upstream run IDs, staleness)
- Cross-service contract compatibility matrix
- Token cost estimate for the briefing itself
