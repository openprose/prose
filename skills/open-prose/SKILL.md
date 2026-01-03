---
name: open-prose
description: |
  OpenProse is a programming language for AI sessions. It structures English into
  unambiguous control flow for multi-agent orchestration. Ships as markdown files
  with zero dependencies.
---

# OpenProse Skill

OpenProse lets you script multi-step AI workflows. Instead of manually prompting an agent multiple times, you write a `.prose` file that defines each step - executed sequentially, in parallel, or conditionally.

## When to Activate

Activate this skill when the user:

- Asks to run a `.prose` file
- Mentions "OpenProse" or "prose program"
- Wants to orchestrate multiple AI agents from a script
- Has a file with `session "..."` or `agent name:` syntax
- Wants to create a reusable workflow

## Documentation Files

| File | Purpose | When to Read |
|------|---------|--------------|
| `interpreter.md` | Execution semantics | Always read for running programs |
| `prose.md` | Full language spec | For compilation, validation, or syntax questions |

### Typical Workflow

1. **Interpret**: Read `interpreter.md` to execute a valid program
2. **Compile/Validate**: Read `prose.md` when asked to compile or when syntax is ambiguous

## Quick Reference

### Sessions

```prose
session "Do something"                    # Simple session
session: myAgent                          # With agent
  prompt: "Task prompt"
  context: previousResult                 # Pass context
```

### Agents

```prose
agent researcher:
  model: sonnet                           # sonnet | opus | haiku
  prompt: "You are a research assistant"
```

### Variables

```prose
let result = session "Get result"         # Mutable
const config = session "Get config"       # Immutable
session "Use both"
  context: [result, config]               # Array form
  context: { result, config }             # Object form
```

### Parallel

```prose
parallel:
  a = session "Task A"
  b = session "Task B"
session "Combine" context: { a, b }
```

### Loops

```prose
repeat 3:                                 # Fixed
  session "Generate idea"

for topic in ["AI", "ML"]:                # For-each
  session "Research" context: topic

loop until **done** (max: 10):            # AI-evaluated
  session "Keep working"
```

### Error Handling

```prose
try:
  session "Risky" retry: 3
catch as err:
  session "Handle" context: err
```

### Conditionals

```prose
if **has issues**:
  session "Fix"
else:
  session "Approve"

choice **best approach**:
  option "Quick": session "Quick fix"
  option "Full": session "Refactor"
```

## Examples

The plugin ships with 27 examples in the `examples/` directory:

- **01-08**: Basics (hello world, research, code review, debugging)
- **09-12**: Agents and skills
- **13-15**: Variables and composition
- **16-19**: Parallel execution
- **20**: Fixed loops
- **21**: Pipeline operations
- **22-23**: Error handling
- **24-27**: Advanced (choice, conditionals, blocks, interpolation)

Start with `01-hello-world.prose` or `03-code-review.prose`.

## Execution

To execute a `.prose` file:

1. Read `interpreter.md` for execution semantics
2. Parse the program structure
3. For each `session`, spawn a subagent via the Task tool
4. Manage context passing between sessions
5. Handle parallel blocks by spawning concurrent Tasks

## Syntax at a Glance

```
session "prompt"              # Spawn subagent
agent name:                   # Define agent template
let x = session "..."         # Capture result
parallel:                     # Concurrent execution
repeat N:                     # Fixed loop
for x in items:               # Iteration
loop until **condition**:     # AI-evaluated loop
try: ... catch: ...           # Error handling
if **condition**: ...         # Conditional
choice **criteria**: option   # AI-selected branch
block name(params):           # Reusable block
do blockname(args)            # Invoke block
items | map: ...              # Pipeline
```

For complete syntax and validation rules, see `prose.md`.
