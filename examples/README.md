# OpenProse Examples

These examples demonstrate workflows using OpenProse's full feature set.

## Available Examples

### Basics (01-08)

| File | Description |
|------|-------------|
| `01-hello-world.prose` | Simplest possible program - a single session |
| `02-research-and-summarize.prose` | Research a topic, then summarize findings |
| `03-code-review.prose` | Multi-perspective code review pipeline |
| `04-write-and-refine.prose` | Draft content and iteratively improve it |
| `05-debug-issue.prose` | Step-by-step debugging workflow |
| `06-explain-codebase.prose` | Progressive exploration of a codebase |
| `07-refactor.prose` | Systematic refactoring workflow |
| `08-blog-post.prose` | End-to-end content creation |

### Agents & Skills (09-12)

| File | Description |
|------|-------------|
| `09-research-with-agents.prose` | Custom agents with model selection |
| `10-code-review-agents.prose` | Specialized reviewer agents |
| `11-skills-and-imports.prose` | External skill imports |
| `12-secure-agent-permissions.prose` | Agent permissions and access control |

### Variables & Composition (13-15)

| File | Description |
|------|-------------|
| `13-variables-and-context.prose` | let/const bindings, context passing |
| `14-composition-blocks.prose` | Named blocks, do blocks |
| `15-inline-sequences.prose` | Arrow operator chains |

### Parallel Execution (16-19)

| File | Description |
|------|-------------|
| `16-parallel-reviews.prose` | Basic parallel execution |
| `17-parallel-research.prose` | Named parallel results |
| `18-mixed-parallel-sequential.prose` | Combined parallel and sequential patterns |
| `19-advanced-parallel.prose` | Join strategies, failure policies |

### Loops (20)

| File | Description |
|------|-------------|
| `20-fixed-loops.prose` | repeat, for-each, parallel for patterns |

### Pipelines (21)

| File | Description |
|------|-------------|
| `21-pipeline-operations.prose` | map, filter, reduce, pmap transformations |

### Error Handling (22-23)

| File | Description |
|------|-------------|
| `22-error-handling.prose` | try/catch/finally patterns |
| `23-retry-with-backoff.prose` | Resilient API calls with retry/backoff |

### Advanced Features (24-27)

| File | Description |
|------|-------------|
| `24-choice-blocks.prose` | AI-selected branching |
| `25-conditionals.prose` | if/elif/else patterns |
| `26-parameterized-blocks.prose` | Reusable blocks with arguments |
| `27-string-interpolation.prose` | Dynamic prompts with {var} syntax |

## Running Examples

Ask Claude to run any example:

```
Run the code review example from the OpenProse examples
```

Or reference the file directly:

```
Execute examples/03-code-review.prose
```

## Feature Reference

### Core Syntax

```prose
# Comments
session "prompt"                    # Simple session
let x = session "..."               # Variable binding
const y = session "..."             # Immutable binding
```

### Agents

```prose
agent name:
  model: sonnet                     # haiku, sonnet, opus
  prompt: "System prompt"
  skills: ["skill1", "skill2"]
  permissions:
    read: ["*.md"]
    bash: deny
```

### Parallel

```prose
parallel:                           # Basic parallel
  a = session "A"
  b = session "B"

parallel ("first"):                 # Race - first wins
parallel ("any", count: 2):         # Wait for N successes
parallel (on-fail: "continue"):     # Don't fail on errors
```

### Loops

```prose
repeat 3:                           # Fixed iterations
  session "..."

for item in items:                  # For-each
  session "..."

parallel for item in items:         # Parallel for-each
  session "..."

loop until **condition** (max: 10): # Unbounded with AI condition
  session "..."
```

### Pipelines

```prose
items | map:                        # Transform each
  session "..."
items | filter:                     # Keep matching
  session "..."
items | reduce(acc, x):             # Accumulate
  session "..."
items | pmap:                       # Parallel transform
  session "..."
```

### Error Handling

```prose
try:
  session "..."
catch as err:
  session "..."
finally:
  session "..."

session "..."
  retry: 3
  backoff: "exponential"            # none, linear, exponential

throw "message"                     # Raise error
```

### Conditionals

```prose
if **condition**:
  session "..."
elif **other condition**:
  session "..."
else:
  session "..."
```

### Choice

```prose
choice **criteria**:
  option "Label A":
    session "..."
  option "Label B":
    session "..."
```

### Blocks

```prose
block name(param):                  # Define with parameters
  session "... {param} ..."

do name("value")                    # Invoke with arguments
```

### String Interpolation

```prose
let x = session "Get value"
session "Use {x} in prompt"         # Single-line

session """                         # Multi-line
Multi-line prompt with {x}
"""
```

## Learn More

See `prose.md` in the skill directory for the complete language specification.
