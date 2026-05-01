---
role: prosescript-language-reference
summary: |
  Canonical imperative scripting layer for OpenProse. ProseScript is used by
  `### Execution` blocks in Contract Markdown services and systems, and by
  fenced pattern `### Delegation` rules when the author needs pinned
  choreography.
see-also:
  - contract-markdown.md: Declarative service and system format
  - prose.md: VM execution semantics
  - forme.md: Manifest wiring semantics
---

# ProseScript

ProseScript describes exact workflow choreography: call this service, pass these
bindings, run these branches in parallel, loop until this condition holds, and
handle failures this way. Use it when order matters. Use Contract Markdown when
the end state matters and Forme can choose the graph.

## Surfaces

| Surface | Scope | Primary call style | Interface source |
|---------|-------|--------------------|------------------|
| `### Execution` in `*.prose.md` | Pinned service/system choreography | `call service-name` | `### Requires`, `### Ensures`, `### Services` |
| Pattern `### Delegation` | Slot interaction rules inside a pattern instance | `call slot-name` | `### Slots`, `### Config`, pattern instance bindings |

Contract Markdown owns the interface and service graph, so embedded ProseScript
must not redeclare caller inputs or public outputs. Use `### Requires`,
`### Ensures`, and `### Services` for those contracts.

Inside `### Execution`, prefer `call service`. Use `session`, `agent`, and
`resume` only for explicitly intentional one-off subagents that are outside the
Contract Markdown service graph.

## Lexical Rules

| Rule | Syntax |
|------|--------|
| Encoding | UTF-8 text |
| Indentation | Spaces define blocks; tabs are invalid |
| Comments | `#` starts a comment outside strings and runs to end of line |
| Identifiers | Letter or `_`, followed by letters, digits, `_`, or `-` |
| Case | Keywords are lowercase and case-sensitive |
| Blocks | A header ending in `:` followed by an indented body |
| Separators | Newlines separate statements; blank lines are ignored |

Comments may appear on their own line or after a statement:

```prose
# Gather evidence before synthesis.
let evidence = call researcher  # inline comment
  topic: topic
```

## Values

| Value | Examples | Notes |
|-------|----------|-------|
| String | `"short"`, `"""multi\nline"""` | Double quotes only |
| Number | `3`, `1.5` | Used for counts and simple data |
| Boolean | `true`, `false` | Lowercase |
| Null | `null` | Explicit absence |
| Array | `[a, "b", 3]` | Ordered values |
| Object | `{ a, b }`, `{ topic: topic, depth: "deep" }` | Shorthand keeps variable names |
| Reference | `draft`, `review.score` | Variable or property access |

Strings support these escapes: `\\`, `\"`, `\n`, `\t`, `\{`, and `\}`.
Unknown escapes are validation errors. Single-line strings must close on the
same line. Triple-quoted strings preserve internal line breaks and indentation.

String interpolation uses `{name}` or `{object.property}`:

```prose
session "Summarize {topic} for {audience}"

session """
Inputs:
- Topic: {topic}
- Evidence: {evidence}
"""
```

Interpolated names must resolve in the current scope. Empty braces are literal
text. Nested interpolation is invalid.

Natural-language conditions are called discretion text. Conditions may be bare
or wrapped for clarity:

```prose
if review has critical concerns:
if **review has critical concerns**:
if ***
  review has critical concerns
  and the concerns block release
***:
```

Bare and `**...**` conditions have the same semantics. Use markers when they
make the boundary easier to read.

## Grammar

```text
script          ::= WS? top_item* EOF
top_item        ::= use_decl | agent_def | block_def | statement

use_decl        ::= "use" string ["as" identifier] NEWLINE
agent_def       ::= "agent" identifier ":" NEWLINE INDENT agent_property+ DEDENT
agent_property  ::= "model:" expression NEWLINE
                  | "prompt:" string NEWLINE
                  | "persist:" expression NEWLINE
                  | "skills:" array NEWLINE
                  | "shape:" NEWLINE INDENT shape_property+ DEDENT
shape_property  ::= ("self" | "delegates" | "prohibited") ":" expression NEWLINE

statement       ::= binding | assignment | return_stmt
                  | call_stmt | session_stmt | resume_stmt | do_block | do_call
                  | parallel_block | repeat_block | for_block | loop_block
                  | if_stmt | choice_block | try_block | throw_stmt

binding         ::= ("let" | "const") target "=" expression NEWLINE
assignment      ::= reference "=" expression NEWLINE
target          ::= identifier | "{" identifier ("," identifier)* "}"
return_stmt     ::= "return" expression? NEWLINE

expression      ::= pipeline_expr | atom
atom            ::= literal | reference | object | array | call_expr
                  | session_expr | resume_expr | do_block | do_call
literal         ::= string | number | boolean | null
boolean         ::= "true" | "false"
null            ::= "null"
reference       ::= identifier ("." identifier)*
target_name     ::= identifier | string
string          ::= quoted_string | triple_quoted_string
number          ::= "-"? digit+ ("." digit+)?
array           ::= "[" [expression ("," expression)*] "]"
object          ::= "{" [object_entry ("," object_entry)*] "}"
object_entry    ::= identifier | identifier ":" expression

call_stmt       ::= ["let" target "="] call_expr NEWLINE?
call_expr       ::= "call" target_name property_block?
session_stmt    ::= ["let" target "="] session_expr NEWLINE?
session_expr    ::= "session" ( string | ":" identifier | identifier ":" identifier )
                    property_block?
resume_stmt     ::= ["let" target "="] resume_expr NEWLINE?
resume_expr     ::= "resume" ":" identifier property_block?

property_block  ::= NEWLINE INDENT property+ DEDENT
property         ::= identifier ":" expression NEWLINE

parallel_block  ::= ["let" identifier "="] "parallel" parallel_mods? ":"
                    NEWLINE INDENT statement+ DEDENT
parallel_mods   ::= "(" parallel_mod ("," parallel_mod)* ")"
parallel_mod    ::= string | "count:" number | "on-fail:" string

repeat_block    ::= "repeat" number ["as" identifier] ":" block_body
for_block       ::= ["parallel"] "for" identifier ["," identifier] "in" expression
                    [parallel_mods] ":" block_body
loop_block      ::= "loop" loop_head? loop_mods? ["as" identifier] ":" block_body
loop_head       ::= "until" discretion | "while" discretion
                  | "for each" identifier "in" expression
loop_mods       ::= "(" "max:" number ")"

if_stmt         ::= "if" discretion ":" block_body elif_clause* else_clause?
elif_clause     ::= "elif" discretion ":" block_body
else_clause     ::= "else:" block_body
choice_block    ::= "choice" discretion ":" NEWLINE INDENT option+ DEDENT
option          ::= "option" string ":" block_body

try_block       ::= "try:" block_body catch_clause? finally_clause?
catch_clause    ::= "catch" ["as" identifier] ":" block_body
finally_clause  ::= "finally:" block_body
throw_stmt      ::= "throw" expression? NEWLINE

block_def       ::= "block" identifier params? ":" block_body
params          ::= "(" identifier ("," identifier)* ")"
do_block        ::= ["let" identifier "="] "do:" block_body
do_call         ::= ["let" identifier "="] "do" identifier args?
args            ::= "(" [expression ("," expression)*] ")"

pipeline_expr   ::= atom NEWLINE? pipe_op+
pipe_op         ::= "|" ("map" | "filter" | "pmap") ":" block_body
                  | "|" "reduce" "(" identifier "," identifier ")" ":" block_body

discretion      ::= bare_text | "**" text "**" | "***" text "***"
bare_text       ::= text_until_colon
text            ::= text_character+
text_until_colon ::= text_no_colon_character+
block_body      ::= NEWLINE INDENT statement+ DEDENT

identifier      ::= (letter | "_") (letter | digit | "_" | "-")*
quoted_string   ::= '"' (string_character | escape)* '"'
triple_quoted_string ::= '"""' (triple_string_character | escape)* '"""'
string_character ::= any UTF-8 scalar except double quote, backslash, and line break
triple_string_character ::= any UTF-8 scalar except an unescaped '"""' delimiter
text_character  ::= any UTF-8 scalar
text_no_colon_character ::= any UTF-8 scalar except colon and line break
escape          ::= "\\" | '\"' | "\n" | "\t" | "\{" | "\}"
letter          ::= "A".."Z" | "a".."z"
digit           ::= "0".."9"
NEWLINE         ::= line break, with blank lines ignored between statements
INDENT          ::= increased leading spaces after a block header
DEDENT          ::= return to a previous indentation level
WS              ::= spaces, comments, and blank lines
```

This is the full ProseScript grammar. Construct sections below define the
surface-specific validation and execution behavior.

## Interfaces

ProseScript does not own public interfaces in current OpenProse source.
Caller inputs and public outputs are declared by Contract Markdown:

- `### Requires` declares variables available to `### Execution`.
- `### Ensures` declares public outputs the service or system must produce.
- `return` chooses the execution block's result for the enclosing contract.

Legacy standalone `.prose` files used `input` and `output` declarations. Treat
those as upgrade inputs, not current syntax: warn and recommend `prose upgrade
--dry-run`.

Validation:

| Check | Result |
|-------|--------|
| `input` or `output` inside current ProseScript | Error |
| `return` value does not satisfy enclosing `### Ensures` | Contract failure |
| Referenced `### Requires` variable is missing | Error |

## Dependency Declarations

`use` declares an external dependency for pinned choreography:

```prose
use "github.com/openprose/prose/packages/std/evals/inspector" as inspector
use "std/memory/project-memory" as project_memory
```

The supported keyword is `use`. It is processed before agents, blocks, and
statements in the current ProseScript block. Resolution follows the same
disk-only rules as `prose run`:
explicit git host identifiers, `std/...` and `co/...` expansions, pinned
versions, and `.agents/prose/deps/`.

A used service or system can be invoked with `call alias`:

```prose
let inspection = call inspector
  run-path: run_path
```

Validation:

| Check | Result |
|-------|--------|
| Empty dependency string | Error |
| Unresolved dependency | Error |
| Duplicate alias | Error |
| Alias is not a valid identifier | Error |
| Dependency declared after executable statements | Error |
| `use` inside embedded Contract Markdown ProseScript | Error; declare it in `### Services` |

## Calls

`call` invokes a Contract Markdown service, system, pattern instance, pattern
slot, or used dependency.

```prose
let findings = call researcher
  topic: topic
  depth: "deep"

let { report, sources } = call writer
  findings: findings
```

Input bindings are indented `name: expression` lines. The target receives only
the declared inputs or slot/config bindings that apply to it. The result is the
target's declared ensured outputs. A single output may be bound directly; a
multi-output target returns an object unless destructured.

`retry` and `backoff` are call modifiers:

```prose
let response = call external-api
  request: request
  retry: 3
  backoff: exponential
```

Validation:

| Check | Result |
|-------|--------|
| Unknown call target | Error |
| Direct call to a pattern definition rather than an instantiated pattern or slot | Error |
| Missing required input | Error |
| Unknown input name | Error, unless the target declares open-ended input handling |
| Duplicate input key | Error |
| Destructured output not declared by target | Error |
| Call modifier conflicts with target input name | Error; rename or wrap the data |

Inside `### Execution`, each `call` must resolve to a service, system, or
pattern instance declared in `### Services`, or to the current service when the
service owns the execution block. Inside pattern `### Delegation`, each `call`
must resolve to a slot name, a bound nested pattern instance, or a helper
explicitly declared by the pattern.

## Sessions, Agents, And Resume

Pinned execution blocks can spawn direct subagent sessions when the work is
intentionally outside the static service graph:

```prose
agent researcher:
  model: sonnet
  persist: project
  prompt: "Research thoroughly and keep a compact project memory."
  skills: ["web-search"]
  shape:
    self: ["research", "source evaluation"]
    prohibited: ["writing source files", "running shell commands"]

let findings = session: researcher
  prompt: "Research {topic}"
  context: topic

let review = resume: researcher
  prompt: "Review the new draft"
  context: findings
```

Session forms:

| Form | Meaning |
|------|---------|
| `session "prompt"` | Spawn a one-off subagent with the prompt |
| `session: agent` | Spawn using an `agent` definition |
| `session name: agent` | Spawn with a local session label and agent config |
| `resume: agent` | Continue a persistent agent with memory |

Agent properties:

| Property | Values |
|----------|--------|
| `model` | Host-defined model identifier, such as `sonnet`, `opus`, or `haiku` |
| `prompt` | String |
| `persist` | `true`, `project`, `user`, or a string path |
| `skills` | Array of strings or dependency aliases |
| `shape` | Indented map with `self`, `delegates`, and `prohibited` behavioral boundaries |

`shape` is the ProseScript equivalent of Contract Markdown `### Shape`.
Host-level sandbox permissions, if any, remain a host adapter concern; scripts
express behavioral boundaries, not raw secret or permission values.

Session and resume properties:

| Property | Values |
|----------|--------|
| `prompt` | String |
| `model` | Host-defined model identifier |
| `context` | Context form described below |
| `retry` | Positive integer |
| `backoff` | `none`, `linear`, or `exponential` |

Validation:

| Check | Result |
|-------|--------|
| Duplicate agent name | Error |
| `resume` target is not persistent | Error |
| `resume` target has no existing memory | Error unless host policy allows first-use creation |
| Undefined agent | Error |
| Duplicate property | Error |
| Invalid shape property | Error |
| Direct `session` in Contract Markdown when an equivalent service exists | Warning |

## Variables And Context

`let` creates a mutable binding. `const` creates an immutable binding.

```prose
let draft = call writer
  brief: brief

const threshold = "high confidence"

draft = call editor
  draft: draft
  threshold: threshold
```

Destructuring is supported for object results:

```prose
let { findings, sources } = call researcher
  topic: topic
```

Scope is lexical. Top-level bindings are visible to nested blocks. Block
parameters, loop variables, catch variables, and pipeline variables are scoped
to their body and are immutable within one iteration or invocation.

Context forms pass prior bindings to sessions and one-off subagents:

```prose
context: findings
context: [brief, findings, sources]
context: { brief, findings, sources }
context: { brief: brief, evidence: findings }
context: []
```

The object shorthand `{ brief, findings }` means
`{ brief: brief, findings: findings }`. `context: []` starts without inherited
context beyond the session prompt and agent definition.

Validation:

| Check | Result |
|-------|--------|
| Undefined variable | Error |
| Duplicate binding in the same scope | Error |
| Reassigning `const`, parameter, loop variable, or catch variable | Error |
| Assignment before declaration | Error |
| Context array or object contains unresolved reference | Error |
| Shadowing outer binding | Warning |

## Return

`return` exits the current block or top-level script/execution body.

```prose
return report

return {
  report: report
  sources: sources
}

return call fixer
  artifact: artifact
  review: review
```

In a block, `return` returns to the `do block(...)` caller. At top level, it
returns to the script caller or satisfies the surrounding Contract Markdown
`### Ensures`. A bare `return` returns `null`.

Embedded `### Execution` should return a value whose shape matches the enclosing
service or system `### Ensures`. Pattern `### Delegation` should return the
pattern instance result or the result expected by the current delegation rule.

## Parallel Blocks

```prose
parallel:
  let security = call security-reviewer
    code: code
  let performance = call performance-reviewer
    code: code
  let style = call style-reviewer
    code: code

let report = call synthesizer
  context: { security, performance, style }
```

Branch-local statements run concurrently. Branch outputs become available after
the join according to modifiers:

```prose
parallel ("all"):
parallel ("first"):
parallel ("any", count: 2):
parallel (on-fail: "fail-fast"):
parallel (on-fail: "continue"):
parallel (on-fail: "ignore"):
parallel ("any", count: 2, on-fail: "continue"):
```

Defaults are `("all", on-fail: "fail-fast")`.

| Modifier | Meaning |
|----------|---------|
| `"all"` | Wait for all branches |
| `"first"` | Use the first successful branch and cancel remaining branches |
| `"any"` | Use the first success, or `count` successes when provided |
| `count: N` | Required successful branch count for `"any"` |
| `on-fail: "fail-fast"` | Fail the block on the first unhandled branch error |
| `on-fail: "continue"` | Wait for all branches and surface failures as results |
| `on-fail: "ignore"` | Drop failed branches and continue with successful results |

Validation:

| Check | Result |
|-------|--------|
| Invalid join strategy or failure policy | Error |
| `count` without `"any"` | Error |
| `count` less than 1 | Error |
| `count` greater than branch count | Error |
| Branch result read before join | Error |
| Duplicate binding produced by two branches | Error |

## Loops

Fixed repetition:

```prose
repeat 3:
  call generator

repeat 3 as attempt:
  call generator
    attempt: attempt
```

Collection iteration:

```prose
for item in items:
  call processor
    item: item

for item, i in items:
  call processor
    item: item
    index: i

parallel for item in items:
  call processor
    item: item
```

Open or model-sized iteration:

```prose
loop (max: 20):
  call next-step

loop until all tests pass (max: 5):
  let results = call tester
  if results include failures:
    call fixer
      test-results: results

loop while more pages remain (max: 50) as page:
  call scraper
    page: page

loop for each item in model-produced-items (max: 20):
  call processor
    item: item
```

Loop validation:

| Check | Result |
|-------|--------|
| Non-positive or non-integer `repeat` count | Error |
| Non-collection in `for` or `parallel for` | Error |
| Open `loop` without `max` | Warning; error in generated canonical docs |
| `loop for each` without `max` | Error |
| `max` less than 1 or non-integer | Error |
| Empty natural-language condition | Error |
| Loop variable read outside loop body | Error |

`parallel for` preserves input order in its result collection unless the author
explicitly requests race semantics through a parallel modifier.

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

Conditions are evaluated in the current execution context. The first true branch
executes and the rest are skipped. Prefer concrete, observable conditions over
vague ones.

Validation:

| Check | Result |
|-------|--------|
| Empty condition | Error |
| `elif` or `else` without a preceding `if` | Error |
| More than one `else` | Error |
| Empty branch body | Warning |

## Choice

`choice` lets the VM select exactly one labeled branch according to criteria:

```prose
choice best recovery path:
  option "retry":
    call retryer
  option "fallback":
    call fallback
  option "abort":
    throw "No safe recovery path"
```

Use `choice` when options are peers and the branch label matters. Use `if` when
conditions are ordered tests.

Validation:

| Check | Result |
|-------|--------|
| No options | Error |
| Empty criteria | Error |
| Duplicate option label | Warning |
| Empty option body | Warning |

## Errors, Retry, And Backoff

```prose
try:
  let response = call external-api
    request: request
    retry: 3
    backoff: exponential
catch as err:
  call fallback
    error: err
finally:
  call cleanup
```

`try` executes its body. `catch` handles an unhandled failure from the body.
`catch as err` binds error context for the catch body. `finally` always runs
after `try` and any `catch`.

`throw` re-raises the active error inside `catch`. `throw expression` raises a
new error:

```prose
catch as err:
  if err is recoverable:
    call fallback
      error: err
  else:
    throw err

throw "Required source is unavailable"
```

`retry: N` retries a failed `call`, `session`, or `resume` up to `N` additional
attempts before the failure reaches surrounding error handling. `backoff` may be
`none`, `linear`, or `exponential`; quoted strings are accepted, but bare
identifiers are canonical.

Validation:

| Check | Result |
|-------|--------|
| `try` without `catch` or `finally` | Error |
| `catch` after `finally` | Error |
| More than one `catch` or `finally` on the same `try` | Error |
| `throw` with no active error outside `catch` | Error |
| Non-positive or non-integer `retry` | Error |
| Unknown `backoff` strategy | Error |
| `backoff` without `retry` | Warning |

## Blocks And `do`

Anonymous `do` groups sequential statements:

```prose
let initial = do:
  let outline = call planner
    brief: brief
  call drafter
    outline: outline
```

Named blocks are reusable local choreography:

```prose
block review-and-fix(artifact, max_rounds):
  let review = call critic
    artifact: artifact
  if review has critical issues:
    return call fixer
      artifact: artifact
      review: review
  return artifact

let result = do review-and-fix(draft, 3)
```

Block definitions are collected before execution, so a block may be invoked
before its definition. Parameters are immutable within the block call. Each
block invocation has its own scope.

Validation:

| Check | Result |
|-------|--------|
| Duplicate block name | Error |
| Undefined block in `do name(...)` | Error |
| Argument count mismatch | Error |
| Parameter name duplicated | Error |
| Block name collides with agent or dependency alias | Error |

## Pipelines

Pipelines transform collections left to right:

```prose
let summaries = articles
  | filter:
      call relevance-checker
        article: item
  | map:
      call summarizer
        article: item
  | reduce(combined, summary):
      call combiner
        combined: combined
        summary: summary
```

| Operation | Body variable | Result |
|-----------|---------------|--------|
| `map` | `item` | Collection of transformed values |
| `pmap` | `item` | Collection transformed concurrently, preserving order |
| `filter` | `item` | Original items whose body result is truthy |
| `reduce(acc, item)` | Explicit names | Single accumulated value |

Validation:

| Check | Result |
|-------|--------|
| Pipeline input is not a collection | Error |
| Unknown pipeline operation | Error |
| `reduce` missing accumulator or item name | Error |
| Pipeline body produces no value | Warning |
| Pipeline variable read outside operation body | Error |

## Embedded Execution Blocks

In Contract Markdown, a `### Execution` fenced `prose` block pins choreography:

````markdown
### Execution

```prose
let findings = call researcher
  topic: topic

parallel:
  let legal = call legal-reviewer
    findings: findings
  let technical = call technical-reviewer
    findings: findings

return call writer
  findings: findings
  context: { legal, technical }
```
````

Forme validates that every `call` target appears in `### Services` or is the
current service's declared internal execution. The Prose VM follows the written
sequence exactly, including explicit `parallel` blocks. It does not infer new
parallelism, reorder calls, or add missing services.

Embedded validation also checks that the returned value satisfies the enclosing
`### Ensures` and that each call input can be satisfied from `### Requires`,
prior call outputs, local variables, or literals.

## Pattern Delegation

Pattern `### Delegation` describes how bound slots interact. When written as
fenced `prose`, it is validated as ProseScript with pattern-specific scope:

```prose
loop until critic accepts output (max: config.max_rounds):
  let output = call worker
    task: task
    feedback: feedback
  let verdict = call critic
    output: output
    quality-bar: config.quality-bar
  if verdict is not accepted:
    let feedback = verdict.feedback

return output
```

Slot names, `config` keys, and parent-provided inputs are in scope. Calls may
target slots or nested pattern instances. Pattern files are not directly
runnable; a system instantiates the pattern and binds its slots before the
delegation runs.

## Execution And Validation Model

Execution has three phases:

1. Parse lexical structure, blocks, declarations, and statements.
2. Validate names, scopes, target contracts, inputs, outputs, loop bounds, and
   surface-specific restrictions.
3. Execute in source order, using the Prose VM from `prose.md` for service
   calls, sessions, state, bindings, retries, and final result publication.

Contract Markdown `### Execution`:

```text
Forme resolves Services, Requires, Ensures
parse execution block
validate call targets and binding flow against contracts
emit pinned manifest
Prose VM executes exactly the written choreography
```

Pattern `### Delegation`:

```text
instantiate pattern from a system Services entry
bind slots and config
execute delegation rules inside the pattern instance
enforce pattern invariants and termination bounds
return the pattern instance outputs
```

Validation errors block execution. Warnings do not block execution, but
canonical generated docs should resolve warnings where possible.
