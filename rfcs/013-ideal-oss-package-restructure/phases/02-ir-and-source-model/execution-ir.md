# Structured Execution IR Slice

**Date:** 2026-04-25
**Phase:** 02.2 Replace Raw Execution Text With Structured Execution IR

`### Execution` blocks now preserve the original fenced prose body and emit a
structured `steps` array.

## Supported Step Kinds

- `call`: `let name = call target` or `call target`, with indented bindings
- `parallel`: `parallel:` with nested steps
- `condition`: `if condition:` with nested steps
- `loop`: `for each item in items:` or `loop:` with nested steps
- `try`: `try:` with nested steps
- `return`: `return value`
- `text`: explicit fallback for lines that cannot yet be structured

Unknown lines produce `unparsed_execution_line` diagnostics. Unknown indented
call bindings produce `unparsed_execution_binding` diagnostics.

## Golden Fixtures

Focused execution fixtures live under `fixtures/execution-ir/`:

- `simple-call-return.prose.md`
- `parallel.prose.md`
- `control-flow.prose.md`

Their structured summaries live under `fixtures/execution-ir/goldens/`.

## Current Gaps

- The parser is intentionally line-oriented. It is not a complete programming
  language parser.
- `try` does not yet model `catch` or `finally`.
- Conditions and loops capture expressions as strings. Schema-aware expression
  checking belongs in later IR/type phases.
- Runtime execution still ignores structured steps until the meta-harness phase.
