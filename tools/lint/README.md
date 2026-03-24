# openprose-lint

Deterministic linter for OpenProse programs. Validates both legacy `.prose` files and `.md` programs against the language spec.

OpenProse programs are executed by LLMs — the intelligence is in the model. The linter checks the **static, spec-driven parts** that should remain deterministic regardless of which model runs the program:

- Structure and syntax (legacy: indentation, blocks, strings; frontmatter, headings)
- Declaration and reference consistency (agents, nodes, components)
- Property validation (models, permissions, skills)
- Contract quality (hedging in ensures, missing requires/ensures — detects contracts in `## requires` sections, bare top-level `requires:`, and code blocks under `## Contract`)
- Prompt hygiene (empty prompts, overly long prompts)
- Spec/corpus drift detection (`discover` command)

## Install

```bash
cd tools/lint
cargo build --release
```

The binary is at `target/release/openprose-lint`.

## Usage

### Lint legacy programs (.prose files)

```bash
# Lint a file or directory of .prose files
openprose-lint lint skills/open-prose/examples/

# Use strict profile (errors instead of warnings for legacy constructs)
openprose-lint lint --profile strict skills/open-prose/examples/
```

### Lint .md programs (.md files)

```bash
# Lint individual files or directories
openprose-lint lint-md path/to/program/

# Multi-file programs are auto-detected — if a directory contains a
# root file (kind: program), sibling .md files are linted as a unit
openprose-lint lint-md path/to/programs/
```

### Discover spec gaps

Analyze a corpus of .md programs and report vocabulary not documented in the spec:

```bash
openprose-lint discover path/to/programs/
```

## Profiles

| Profile | Behavior |
|---------|----------|
| `compat` (default) | Warnings for legacy/compatibility constructs |
| `strict` | Errors for anything outside the current spec |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | No errors |
| 1 | One or more errors |
| 2 | CLI usage or filesystem error |

Warnings do not fail the run.

## Architecture

```
tools/lint/
├── build.rs          # Extracts vocabulary from skills/open-prose/compiler.md
├── src/
│   ├── main.rs       # CLI entry point
│   ├── lib.rs        # Public API
│   ├── lint_legacy.rs # legacy engine (.prose files) (.prose files)
│   ├── lint.rs    # .md program engine (.md programs)
│   ├── diag.rs       # Diagnostic types
│   ├── profile.rs    # Lint profiles (strict/compat)
│   ├── fs.rs         # File collection utilities
│   └── wasm.rs       # WASM bindings (for browser/plugin use)
└── fixtures/         # Test fixtures
```

The `build.rs` script reads `skills/open-prose/compiler.md` at compile time to extract vocabulary (model names, property names, permission types). If the spec isn't found (e.g., building the crate standalone), hardcoded fallbacks are used.

## Legacy Rules (.prose)

### Errors

| Code | Description |
|------|-------------|
| E001 | Unterminated string literal |
| E003 | Session missing prompt or agent |
| E006 | Duplicate agent definition |
| E007 | Undefined agent reference |
| E008 | Invalid model value |
| E009 | Duplicate property |
| E010 | Duplicate `use` statement |
| E011 | Empty `use` path |
| E012 | Invalid `use` alias/path shape |
| E013 | Skills must be an array |
| E014 | Skill name must be a string |
| E015 | Permissions must be a block |
| E016 | Malformed permission pattern/value |
| E017 | `resume:` requires persistent agent |
| E019 | Duplicate variable declaration |
| E020 | Empty input name |
| E021 | Duplicate input declaration |
| E024 | Duplicate output declaration |
| OPE001 | Tabs used for indentation |
| OPE002 | Gate missing prompt |
| OPE003 | Invalid loop max value |

### Warnings

| Code | Description |
|------|-------------|
| W001 | Empty session prompt |
| W002 | Whitespace-only session prompt |
| W003 | Prompt exceeds 10,000 characters |
| W004 | Empty prompt property |
| W005 | Unknown property name |
| W006 | Unknown import source format |
| W008 | Unknown permission type |
| W010 | Empty skills array |
| OPW001 | Unbounded loop without max iterations |
| OPW002 | Discretion condition may be ambiguous |
| OPW003 | Legacy `import` syntax |
| OPW004 | Legacy labeled session syntax |
| OPW005 | Legacy session block syntax |
| OPW007 | `input` after executable statements |

## Rules (.md programs)

### Errors

| Code | Description |
|------|-------------|
| V2E001 | Missing YAML frontmatter |
| V2E002 | Unterminated YAML frontmatter |
| V2E003 | Duplicate frontmatter key |
| V2E010 | Missing required field: name |
| V2E011 | Missing required field: kind |
| V2E012 | Unknown component kind |
| V2E013 | Program without nodes/services |
| V2E020 | Unterminated fenced code block |
| V2E030 | Duplicate component name |
| V2E040 | Node declared but not defined in body (single-file mode) |
| V2E050 | No root program file in directory |
| V2E051 | Node file missing from program directory |

### Warnings

| Code | Description |
|------|-------------|
| V2W001 | Unknown frontmatter key |
| V2W002 | Unknown component role |
| V2W003 | Missing version |
| V2W004 | Component name contains spaces |
| V2W005 | Kind used in corpus but not in spec (strict only) |
| V2W010 | Empty contract clause |
| V2W011 | Hedging language in ensures clause |
| V2W012 | Strategy clause too terse |
| V2W014 | Service/program-node without ensures |
| V2W015 | Program without requires |
| V2W020 | Component without code block |
| V2W021 | Component code block missing role |
| V2W030 | Component in body but not in frontmatter nodes |

## WASM

The linter can be compiled to WASM for browser or plugin use:

```bash
cargo build --target wasm32-unknown-unknown --release
```

The `wasm.rs` module exposes `lint_wasm(source: &str) -> JsValue` for use from JavaScript.
