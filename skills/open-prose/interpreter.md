# OpenProse Interpreter

This document defines how to execute OpenProse programs. An OpenProse interpreter is an intelligent orchestrator that spawns subagent sessions according to a structured program.

---

## The Execution Model

OpenProse treats an AI session as a Turing-complete computer. The orchestrator (you) acts as a virtual machine:

1. **You are the VM** - Parse and execute each statement
2. **Sessions are function calls** - Each `session` spawns a subagent via the Task tool
3. **Context is memory** - Variable bindings hold session outputs
4. **Control flow is explicit** - Follow the program structure exactly

### Core Principle

The orchestrator follows the program structure **strictly** but uses **intelligence** for:
- Evaluating discretion conditions (`**...**`)
- Determining when a session is "complete"
- Transforming context between sessions

---

## Syntax Grammar (Condensed)

```
program     := statement*

statement   := agentDef | session | letBinding | constBinding | assignment
             | parallelBlock | repeatBlock | forEachBlock | loopBlock
             | tryBlock | choiceBlock | ifStatement | doBlock | blockDef
             | throwStatement | comment

# Definitions
agentDef    := "agent" NAME ":" INDENT property* DEDENT
blockDef    := "block" NAME params? ":" INDENT statement* DEDENT
params      := "(" NAME ("," NAME)* ")"

# Sessions
session     := "session" (STRING | ":" NAME) properties?
properties  := INDENT property* DEDENT
property    := "model:" ("sonnet" | "opus" | "haiku")
             | "prompt:" STRING
             | "context:" (NAME | "[" NAME* "]" | "{" NAME* "}")
             | "retry:" NUMBER
             | "backoff:" ("none" | "linear" | "exponential")
             | "skills:" "[" STRING* "]"
             | "permissions:" INDENT permission* DEDENT

# Bindings
letBinding  := "let" NAME "=" expression
constBinding:= "const" NAME "=" expression
assignment  := NAME "=" expression

# Control Flow
parallelBlock := "parallel" modifiers? ":" INDENT branch* DEDENT
modifiers   := "(" (strategy | "on-fail:" policy | "count:" N)* ")"
strategy    := "all" | "first" | "any"
policy      := "fail-fast" | "continue" | "ignore"
branch      := (NAME "=")? statement

repeatBlock := "repeat" N ("as" NAME)? ":" INDENT statement* DEDENT
forEachBlock:= "parallel"? "for" NAME ("," NAME)? "in" collection ":" INDENT statement* DEDENT
loopBlock   := "loop" condition? ("(" "max:" N ")")? ("as" NAME)? ":" INDENT statement* DEDENT
condition   := ("until" | "while") discretion

# Error Handling
tryBlock    := "try:" INDENT statement* DEDENT catch? finally?
catch       := "catch" ("as" NAME)? ":" INDENT statement* DEDENT
finally     := "finally:" INDENT statement* DEDENT
throwStatement := "throw" STRING?

# Conditionals
choiceBlock := "choice" discretion ":" INDENT option* DEDENT
option      := "option" STRING ":" INDENT statement* DEDENT
ifStatement := "if" discretion ":" INDENT statement* DEDENT elif* else?
elif        := "elif" discretion ":" INDENT statement* DEDENT
else        := "else:" INDENT statement* DEDENT

# Composition
doBlock     := "do" (":" INDENT statement* DEDENT | NAME args?)
args        := "(" expression* ")"
arrowExpr   := session "->" session ("->" session)*

# Pipelines
pipeExpr    := collection ("|" pipeOp)+
pipeOp      := ("map" | "filter" | "pmap") ":" INDENT statement* DEDENT
             | "reduce" "(" NAME "," NAME ")" ":" INDENT statement* DEDENT

# Primitives
discretion  := "**" TEXT "**" | "***" TEXT "***"
STRING      := '"' ... '"' | '"""' ... '"""'
collection  := NAME | "[" expression* "]"
comment     := "#" TEXT
```

---

## Spawning Sessions

Each `session` statement spawns a subagent using the **Task tool**:

```
session "Analyze the codebase"
```

Execute as:
```
Task({
  description: "OpenProse session",
  prompt: "Analyze the codebase",
  subagent_type: "general-purpose"
})
```

### With Agent Configuration

```
agent researcher:
  model: opus
  prompt: "You are a research expert"

session: researcher
  prompt: "Research quantum computing"
```

Execute as:
```
Task({
  description: "OpenProse session",
  prompt: "Research quantum computing\n\nSystem: You are a research expert",
  subagent_type: "general-purpose",
  model: "opus"
})
```

### Property Precedence

Session properties override agent defaults:
1. Session-level `model:` overrides agent `model:`
2. Session-level `prompt:` replaces (not appends) agent `prompt:`
3. Agent `prompt:` becomes system context if session has its own prompt

---

## Parallel Execution

`parallel:` blocks spawn multiple sessions concurrently:

```prose
parallel:
  a = session "Task A"
  b = session "Task B"
  c = session "Task C"
```

Execute by calling Task multiple times in parallel:
```
// All three spawn simultaneously
Task({ prompt: "Task A", ... })  // result -> a
Task({ prompt: "Task B", ... })  // result -> b
Task({ prompt: "Task C", ... })  // result -> c
// Wait for all to complete, then continue
```

### Join Strategies

| Strategy | Behavior |
|----------|----------|
| `"all"` (default) | Wait for all branches |
| `"first"` | Return on first completion, cancel others |
| `"any"` | Return on first success |
| `"any", count: N` | Wait for N successes |

### Failure Policies

| Policy | Behavior |
|--------|----------|
| `"fail-fast"` (default) | Fail immediately on any error |
| `"continue"` | Wait for all, then report errors |
| `"ignore"` | Treat failures as successes |

---

## Evaluating Discretion Conditions

Discretion markers (`**...**`) signal AI-evaluated conditions:

```prose
loop until **the code is bug-free**:
  session "Find and fix bugs"
```

### Evaluation Approach

1. **Context awareness**: Consider all prior session outputs
2. **Semantic interpretation**: Understand the intent, not literal parsing
3. **Conservative judgment**: When uncertain, continue iterating
4. **Progress detection**: Exit if no meaningful progress is being made

### Multi-line Conditions

```prose
if ***
  the tests pass
  and coverage exceeds 80%
  and no linting errors
***:
  session "Deploy"
```

Triple-asterisks allow complex, multi-line conditions.

---

## Context Passing

Variables capture session outputs and pass them to subsequent sessions:

```prose
let research = session "Research the topic"

session "Write summary"
  context: research
```

### Context Forms

| Form | Usage |
|------|-------|
| `context: var` | Single variable |
| `context: [a, b, c]` | Multiple variables as array |
| `context: { a, b, c }` | Multiple variables as named object |
| `context: []` | Empty context (fresh start) |

### How Context is Passed

When spawning a session with context:
1. Include the referenced variable values in the prompt
2. Format appropriately (summarize if needed)
3. The subagent receives this as additional information

Example execution:
```
// research = "Quantum computing uses qubits..."

Task({
  prompt: "Write summary\n\nContext:\nresearch: Quantum computing uses qubits...",
  ...
})
```

---

## Loop Execution

### Fixed Loops

```prose
repeat 3:
  session "Generate idea"
```

Execute the body exactly 3 times sequentially.

```prose
for topic in ["AI", "ML", "DL"]:
  session "Research"
    context: topic
```

Execute once per item, with `topic` bound to each value.

### Parallel For-Each

```prose
parallel for item in items:
  session "Process"
    context: item
```

Fan-out: spawn all iterations concurrently, wait for all.

### Unbounded Loops

```prose
loop until **task complete** (max: 10):
  session "Work on task"
```

1. Check condition before each iteration
2. Exit if condition satisfied OR max reached
3. Execute body if continuing

---

## Error Propagation

### Try/Catch Semantics

```prose
try:
  session "Risky operation"
catch as err:
  session "Handle error"
    context: err
finally:
  session "Cleanup"
```

Execution order:
1. **Success**: try -> finally
2. **Failure**: try (until fail) -> catch -> finally

### Throw Behavior

- `throw` inside catch: re-raise to outer handler
- `throw "message"`: raise new error with message
- Unhandled throws: propagate to outer scope or fail program

### Retry Mechanism

```prose
session "Flaky API"
  retry: 3
  backoff: "exponential"
```

On failure:
1. Retry up to N times
2. Apply backoff delay between attempts
3. If all retries fail, propagate error

---

## State Tracking

For in-context execution, track state implicitly:

| State | Tracking Approach |
|-------|-------------------|
| Agent definitions | Collect at program start |
| Block definitions | Collect at program start (hoisted) |
| Variable bindings | Hold in working memory |
| Current position | Track which statement you're executing |
| Loop counters | Maintain for each active loop |

### Execution Log Pattern

As you execute, maintain mental notes:
- "Completed session A, result stored in `research`"
- "Entering parallel block with 3 branches"
- "Loop iteration 2 of max 5, condition not yet met"
- "Caught error, executing catch block"

---

## Choice and Conditional Execution

### Choice Blocks

```prose
choice **the severity level**:
  option "Critical":
    session "Escalate immediately"
  option "Minor":
    session "Log for later"
```

1. Evaluate the discretion criteria
2. Select the most appropriate option
3. Execute only that option's body

### If/Elif/Else

```prose
if **has security issues**:
  session "Fix security"
elif **has performance issues**:
  session "Optimize"
else:
  session "Approve"
```

1. Evaluate conditions in order
2. Execute first matching branch
3. Skip remaining branches

---

## Block Invocation

### Defining Blocks

```prose
block review(topic):
  session "Research {topic}"
  session "Analyze {topic}"
```

Blocks are hoisted - can be used before definition.

### Invoking Blocks

```prose
do review("quantum computing")
```

1. Substitute arguments for parameters
2. Execute block body
3. Return to caller

---

## Pipeline Execution

```prose
let results = items
  | filter:
      session "Keep? yes/no"
        context: item
  | map:
      session "Transform"
        context: item
```

Execute left-to-right:
1. **filter**: Keep items where session returns truthy
2. **map**: Transform each item via session
3. **reduce**: Accumulate items pairwise
4. **pmap**: Like map but concurrent

---

## String Interpolation

```prose
let name = session "Get user name"
session "Hello {name}, welcome!"
```

Before spawning, substitute `{varname}` with variable values.

---

## Complete Execution Algorithm

```
function execute(program):
  1. Collect all agent definitions
  2. Collect all block definitions
  3. For each statement in order:
     - If session: spawn via Task, await result
     - If let/const: execute RHS, bind result
     - If parallel: spawn all branches, await per strategy
     - If loop: evaluate condition, execute body, repeat
     - If try: execute try, catch on error, always finally
     - If choice/if: evaluate condition, execute matching branch
     - If do block: invoke block with arguments
  4. Handle errors according to try/catch or propagate
  5. Return final result or error
```

---

## Implementation Notes

### Task Tool Usage

Always use Task for session execution:
```
Task({
  description: "OpenProse session",
  prompt: "<session prompt with context>",
  subagent_type: "general-purpose",
  model: "<optional model override>"
})
```

### Parallel Execution

Make multiple Task calls in a single response for true concurrency:
```
// In one response, call all three:
Task({ prompt: "A" })
Task({ prompt: "B" })
Task({ prompt: "C" })
```

### Context Serialization

When passing context to sessions:
- Prefix with clear labels
- Keep relevant information
- Summarize if very long
- Maintain semantic meaning

---

## Summary

The OpenProse interpreter:

1. **Parses** the program structure
2. **Collects** definitions (agents, blocks)
3. **Executes** statements sequentially
4. **Spawns** sessions via Task tool
5. **Coordinates** parallel execution
6. **Evaluates** discretion conditions intelligently
7. **Manages** context flow between sessions
8. **Handles** errors with try/catch/retry
9. **Tracks** state in working memory

The language is self-evident by design. When in doubt about syntax, interpret it as natural language structured for unambiguous control flow.
