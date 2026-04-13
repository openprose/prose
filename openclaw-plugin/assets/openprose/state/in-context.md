---
role: in-context-state-management
summary: |
  In-context state management using the narration protocol with text markers.
  This approach tracks execution state within the conversation history itself.
  The OpenProse VM "thinks aloud" to persist state—what you say becomes what you remember.
see-also:
  - ../prose.md: VM execution semantics
  - filesystem.md: File-system state management (alternative approach)
  - sqlite.md: SQLite state management (experimental)
  - postgres.md: PostgreSQL state management (experimental)
  - ../primitives/session.md: Session context and compaction guidelines
---

# In-Context State Management

This document describes how the OpenProse VM tracks execution state using **structured narration** in the conversation history. This is one of two state management approaches (the other being file-based state in `filesystem.md`).

## Overview

In-context state uses text-prefixed markers to persist state within the conversation. The VM "thinks aloud" about execution—what you say becomes what you remember.

**Key principle:** Your conversation history IS the VM's working memory.

---

## When to Use In-Context State

In-context state is appropriate for:

| Factor | In-Context | Use File-Based Instead |
|--------|------------|------------------------|
| Statement count | < 30 statements | >= 30 statements |
| Parallel branches | < 5 concurrent | >= 5 concurrent |
| Imported programs | 0-2 imports | >= 3 imports |
| Nested depth | <= 2 levels | > 2 levels |
| Expected duration | < 5 minutes | >= 5 minutes |

Announce your state mode at program start:

```
OpenProse Program Start
   State mode: in-context (program is small, fits in context)
```

---

## The Narration Protocol

Use **compact markers** to track state with minimal token overhead. The VM's conversation history is the primary state—markers exist for clarity and potential resumption, not as verbose logs.

### Core Markers

| Marker | Meaning | Example |
|--------|---------|---------|
| `N→ name ✓` | Statement N complete, bound to name | `1→ research ✓` |
| `N→ ✓` | Anonymous session complete | `3→ ✓` |
| `N→ ✗ error` | Statement failed | `2→ ✗ timeout` |
| `∥ [a b c]` | Parallel started | `∥ [security perf style]` |
| `∥ [a✓ b✓ c→]` | Parallel progress | `∥ [security✓ perf✓ style→]` |
| `∥ done` | Parallel joined | `∥ done` |
| `loop:I/M` | Loop iteration | `loop:2/5` |
| `loop exit` | Loop condition satisfied | `loop:3/5 exit` |
| `#ID name` | Block invocation | `#43 process` |
| `#ID done` | Block complete | `#43 done` |
| `try→` | Entering try | `try→` |
| `catch→` | Entering catch | `catch→ err` |
| `finally→` | Entering finally | `finally→` |

---

## Narration Patterns by Construct

### Session Statements

```
1→ research ✓
```

That's it. One line. The Task tool call and result are in the conversation—no need to narrate them again.

### Parallel Blocks

```
∥ [a b c]
  [Task calls for a, b, c]
∥ [a✓ b✓ c✓] done
```

### Loop Blocks

```
loop:1/5
  3→ synthesis ✓
loop:2/5
  3→ synthesis ✓
loop:3/5 exit(**complete**)
```

### Error Handling

```
try→
  2→ ✗ timeout
catch→ err
  3→ recovery ✓
finally→
  4→ cleanup ✓
```

### Block Invocation

```
#1 process(data,5)
  5→ parts ✓
  #2 process(parts[0],4)
    6→ subparts ✓
  #2 done
  7→ combined ✓
#1 done
```

Block invocations nest visually. The `#ID` uniquely identifies each invocation for scoped bindings.

### Scoped Bindings

When inside a block, bindings are implicitly scoped to the current `#ID`:

```
#43 process
  5→ result ✓   (scoped to #43)
```

### Program Imports

```
use alice/research → research
research(topic:"quantum") → result ✓
```

---

## Context Serialization

**In-context state passes values, not references.** The VM holds binding values directly in conversation history.

When passing context to sessions, format appropriately:

| Context Size | Strategy |
|--------------|----------|
| < 2000 chars | Pass verbatim |
| 2000-8000 chars | Summarize to key points |
| > 8000 chars | Extract essentials only |

**Limitation:** In-context state cannot support RLM-style patterns with arbitrarily large bindings. For large intermediate values, use file-based or PostgreSQL state.

---

## Complete Execution Trace Example

```prose
agent researcher:
  model: sonnet

let research = session: researcher
  prompt: "Research AI safety"

parallel:
  a = session "Analyze risk A"
  b = session "Analyze risk B"

loop until **analysis complete** (max: 3):
  session "Synthesize"
    context: { a, b, research }
```

**Compact narration:**
```
1→ research ✓
∥ [a b]
∥ [a✓ b✓] done
loop:1/3
  3→ synthesis ✓
loop:2/3 exit(**complete**)
---end
```

That's the entire execution trace in 7 lines instead of 40+. The Task tool calls and their results are in the conversation history—the markers just track position and completion.

---

## What the VM Tracks Implicitly

The VM's conversation naturally contains:

| Information | Where It Lives |
|-------------|----------------|
| Agent/block definitions | Read at program start, in early context |
| Binding values | Task tool results in conversation |
| Current position | VM knows what it just executed |
| Loop iteration | VM is counting |
| Parallel status | VM spawned the tasks, sees returns |
| Call stack | VM invoked the blocks |

The compact markers exist for **clarity and resumption**, not as the primary state store. The conversation IS the state.

---

## Independence from File-Based State

In-context state and file-based state (`filesystem.md`) are **independent approaches**. You choose one or the other based on program complexity.

- **In-context**: State lives in conversation history
- **File-based**: State lives in `.prose/runs/{id}/`

They are not designed to be complementary—pick the appropriate mode at program start.

---

## Summary

In-context state management:

1. Uses **compact markers** (`1→ research ✓`) instead of verbose narration
2. Relies on **conversation history** as the primary state
3. Is appropriate for **smaller, simpler programs** (<30 statements)
4. Generates **minimal tokens** per statement
5. Enables resumption by reading prior markers

The conversation IS the state. Markers provide structure and resumability without token bloat.
