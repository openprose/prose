---
role: prosescript-language-reference
summary: |
  Imperative scripting layer for OpenProse. ProseScript is used by `.prose`
  files and by `### Execution` blocks in Contract Markdown programs when an
  author wants to pin choreography explicitly.
see-also:
  - contract-markdown.md: Declarative program format
  - prose.md: VM execution semantics
  - forme.md: Manifest wiring semantics
  - v0/compiler.md: Historical full grammar reference
---

# ProseScript

ProseScript is OpenProse's imperative scripting language. It describes exact
workflow choreography: call this service, then that service, loop until this
condition, run these branches in parallel, handle this error.

Use ProseScript when order matters. Use Contract Markdown when the end state
matters and Forme can choose the graph.

## Where ProseScript Appears

| Location | Meaning |
|----------|---------|
| `*.prose` files | Standalone ProseScript programs |
| `### Execution` in `.md` files | Pinned choreography inside Contract Markdown |
| Composite `### Delegation` sections | Slot interaction pattern |

## Core Calls

Inside Contract Markdown, call named services:

```prose
let findings = call researcher
  topic: topic

let report = call writer
  findings: findings

return report
```

In standalone `.prose` files, direct sessions remain valid:

```prose
let findings = session "Research the topic"

session "Write a concise report"
  context: findings
```

Prefer `call service` inside `### Execution` because Contract Markdown already
defines the services. Use raw `session` when writing a standalone script or an
intentional one-off subagent.

## Variables

```prose
let draft = call writer
  brief: brief

const threshold = "high confidence"

draft = call editor
  draft: draft
```

`let` values are mutable. `const` values are not. `return` identifies the value
or values returned to the caller.

Use an object return when a Contract Markdown component declares multiple
ensured outputs:

```prose
return {
  report: report
  sources: sources
}
```

## Inputs to Calls

Indented key/value lines bind inputs:

```prose
let review = call critic
  artifact: draft
  focus: "correctness and clarity"
```

Values may be variables, strings, arrays, or simple object-shaped data. The VM
passes large values by reference through bindings wherever possible.

## Parallel Blocks

```prose
parallel:
  let security = call security-reviewer
    code: code
  let performance = call performance-reviewer
    code: code

let report = call synthesizer
  security: security
  performance: performance
```

Join modifiers:

```prose
parallel ("all"):
parallel ("first"):
parallel ("any", count: 2):
parallel (on-fail: "continue"):
parallel (on-fail: "ignore"):
```

Default join is `"all"`. Default failure policy is `"fail-fast"`.

## Loops

```prose
repeat 3:
  call generator

for item in items:
  call processor
    item: item

parallel for item in items:
  call processor
    item: item

loop for each item in items (max: 20):
  call processor
    item: item

loop until all tests pass (max: 5):
  let results = call tester
  if failures:
    call fixer
      test-results: results
```

Natural-language conditions are model-evaluated. These are equivalent:

```prose
loop until all tests pass (max: 5):
loop until **all tests pass** (max: 5):
```

Use `**...**` when the boundary helps readability or when preserving older
syntax. Use bare natural language when it reads better.

`loop for each` is a bounded collection loop. Use it when the collection is
model-produced, externally supplied, or otherwise worth capping even though it
has an apparent finite length.

Every open-ended or model-sized loop should include `max: N`.

## Conditionals

```prose
if review has critical concerns:
  call reviser
    review: review
elif review has minor concerns:
  call polisher
    review: review
else:
  call approver
```

Conditions are evaluated in the current execution context. Prefer concrete,
observable conditions over vague ones.

## Choice Blocks

```prose
choice best recovery path:
  option "retry":
    call retryer
  option "fallback":
    call fallback
  option "abort":
    throw "No safe recovery path"
```

Only the chosen option executes.

## Error Handling

```prose
try:
  let response = call external-api
    retry: 3
    backoff: "exponential"
catch as err:
  call fallback
    error: err
finally:
  call cleanup
```

`throw` re-raises inside a catch block. `throw "message"` raises a new error.

## Blocks

```prose
block review-and-fix(artifact):
  let review = call critic
    artifact: artifact
  if review has critical issues:
    return call fixer
      artifact: artifact
      review: review
  return artifact

let result = do review-and-fix(draft)
```

Blocks are reusable local choreography. Use them when a repeated control-flow
pattern is clearer than another service contract.

## Pipelines

```prose
let summaries = articles
  | filter:
      call relevance-checker
        article: item
  | map:
      call summarizer
        article: item
```

Pipeline operations:

| Operation | Meaning |
|-----------|---------|
| `map` | Transform each item sequentially |
| `pmap` | Transform each item concurrently |
| `filter` | Keep items whose result is truthy |
| `reduce(acc, item)` | Accumulate to one result |

## Persistent Agents

Standalone ProseScript supports persistent agents:

```prose
agent captain:
  persist: project
  prompt: "Coordinate work and preserve project context."

let plan = session: captain
  prompt: "Create the plan"

let review = resume: captain
  prompt: "Review the implementation"
  context: plan
```

Inside Contract Markdown, prefer `### Runtime` on services and `call service` in
execution blocks. `session:` and `resume:` remain available for standalone
scripts and compatibility.

## Compatibility

ProseScript intentionally preserves the useful parts of the original `.prose`
language:

- `session "prompt"`
- `agent name:`
- `resume: agent`
- `parallel:`
- `repeat`, `for`, `parallel for`
- `loop until **condition**`
- `try` / `catch` / `finally`
- `choice`, `if` / `elif` / `else`
- `block`, `do`
- pipelines

When validating historical syntax in detail, consult `v0/compiler.md`. When
writing new programs, prefer this document's `call service` style inside
Contract Markdown execution blocks.

## Complete Execution Sketch

```text
execute(script):
  collect definitions and imports
  bind inputs
  for each statement:
    call/session -> spawn subagent or service
    parallel -> spawn branches concurrently
    loop -> evaluate condition and bound, execute body
    if/choice -> evaluate natural-language condition
    try -> execute, catch failures, run finally
    block -> push frame, bind args, execute, pop frame
  return declared output
```

The VM follows ProseScript order strictly. It uses intelligence only where the
script asks for natural-language judgment.
