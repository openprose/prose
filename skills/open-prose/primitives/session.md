---
role: session-context-management
summary: |
  Guidelines for subagents on context handling, state management, and memory compaction.
  This file is loaded into all subagent sessions at start time to ensure consistent
  behavior around state persistence and context flow.
see-also:
  - ../prose.md: VM execution semantics
  - ../compiler.md: Full language specification
  - ../state/filesystem.md: File-system state management (default)
  - ../state/in-context.md: In-context state management (on request)
---

# Session Context Management

You are a subagent operating within an OpenProse program. This document explains how to work with the context you receive and how to preserve state for future sessions.

---

## 1. Understanding Your Context Layers

When you start, you receive context from multiple sources. Understand what each represents:

### 1.1 Outer Agent State

The **outer agent state** is context from the orchestrating VM or parent agent. It tells you:

- What program is running
- Where you are in the execution flow
- What has happened in prior steps

Look for markers like:

```
## Execution Context
Program: feature-implementation.prose
Current phase: Implementation
Prior steps completed: [plan, design]
```

**How to use it:** This orients you. You're not starting from scratch—you're continuing work that's already in progress. Reference prior steps when relevant.

### 1.2 Persistent Agent Memory

If you are a **persistent agent**, you'll receive a memory file with your prior observations and decisions. This is YOUR accumulated knowledge from previous segments.

Look for:

```
## Agent Memory: [your-name]
```

**How to use it:** This is your continuity. You reviewed something yesterday; you remember that review today. Reference your prior decisions. Build on your accumulated understanding. Don't contradict yourself without acknowledging the change.

### 1.3 Task Context

The **task context** is the specific input for THIS session—the code to review, the plan to evaluate, the feature to implement.

Look for:

```
## Task Context
```

or

```
Context provided:
---
[specific content]
---
```

**How to use it:** This is what you're working on RIGHT NOW. Your primary focus. The other context layers inform how you approach this.

### 1.4 Layering Order

When context feels overwhelming, process in this order:

1. **Skim outer state** → Where am I in the bigger picture?
2. **Read your memory** → What do I already know?
3. **Focus on task context** → What am I doing right now?
4. **Synthesize** → How does my prior knowledge inform this task?

---

## 2. Working with Persistent State

If you're a persistent agent, you maintain state across sessions via a memory file.

### 2.1 Reading Your Memory

At session start, your memory file is provided. It contains:

- **Current Understanding**: Your overall grasp of the project/task
- **Decisions Made**: What you've decided and why
- **Open Concerns**: Things you're watching for
- **Recent Segments**: What happened in recent sessions

**Read it carefully.** Your memory is your continuity. A persistent agent that ignores its memory is just a stateless agent with extra steps.

### 2.2 Building on Prior Knowledge

When you encounter something related to your memory:

- Reference it explicitly: "In my previous review, I noted X..."
- Build on it: "Given that I already approved the plan, I'm now checking implementation alignment..."
- Update it if wrong: "I previously thought X, but now I see Y..."

### 2.3 Maintaining Consistency

Your decisions should be consistent across segments unless you explicitly change your position. If you approved a plan in segment 1, don't reject the same approach in segment 3 without acknowledging the change and explaining why.

---

## 3. Memory Compaction Guidelines

At the end of your session, you'll be asked to update your memory file. This is **compaction**—preserving what matters for future sessions.

### 3.1 Compaction is NOT Summarization

**Wrong approach:** "I reviewed the code and found some issues."

This loses all useful information. A summary generalizes; compaction preserves specifics.

**Right approach:** "Reviewed auth module (src/auth/login.ts:45-120). Found: (1) SQL injection risk in query builder line 67, (2) missing rate limiting on login endpoint, (3) good error handling pattern worth reusing. Requested fixes for #1 and #2, approved overall structure."

### 3.2 What to Preserve

Preserve **specific details** that future-you will need:

| Preserve                     | Example                                                  |
| ---------------------------- | -------------------------------------------------------- |
| **Specific locations**       | "src/auth/login.ts:67" not "the auth code"               |
| **Exact findings**           | "SQL injection in query builder" not "security issues"   |
| **Decisions with rationale** | "Approved because X" not just "Approved"                 |
| **Numbers and thresholds**   | "Coverage at 73%, target is 80%" not "coverage is low"   |
| **Names and identifiers**    | "User.authenticate() method" not "the login function"    |
| **Open questions**           | "Need to verify: does rate limiter apply to OAuth flow?" |

### 3.3 What to Drop

Drop information that won't help future sessions:

| Drop             | Why                                                                         |
| ---------------- | --------------------------------------------------------------------------- |
| Reasoning chains | The conclusion matters, not how you got there                               |
| False starts     | You considered X but chose Y—just record Y and a brief note about why not X |
| Obvious context  | Don't repeat the task prompt back                                           |
| Verbose quotes   | Reference by location, don't copy large blocks                              |

### 3.4 Compaction Structure

Update your memory file in this structure:

```markdown
## Current Understanding

[What you know about the overall project/task—update, don't replace entirely]

## Decisions Made

[Append new decisions with dates and rationale]

- [date]: [decision] — [why]

## Open Concerns

[Things to watch for in future sessions—add new, remove resolved]

## Segment [N] Summary

[What happened THIS session—specific, not general]

- Reviewed: [what, where]
- Found: [specific findings]
- Decided: [specific decisions]
- Next: [what should happen next]
```

### 3.5 Compaction Examples

**Bad compaction (too general):**

```
## Segment 3 Summary
Reviewed the implementation. Found some issues. Requested changes.
```

**Good compaction (specific and useful):**

```
## Segment 3 Summary
- Reviewed: Step 2 implementation (UserService.ts, AuthController.ts)
- Found:
  - Missing null check in UserService.getById (line 34)
  - AuthController.login not using the approved error format from segment 1
  - Good: Transaction handling follows pattern I recommended
- Decided: Request fixes for null check and error format before proceeding
- Next: Re-review after fixes, then approve for step 3
```

### 3.6 The Specificity Test

Before finalizing your compaction, ask: "If I read only this summary in a week, could I understand exactly what happened and make consistent follow-up decisions?"

If the answer is no, add more specifics.

---

## 4. Context Size Management

### 4.1 When Your Memory Gets Long

Over many segments, your memory file grows. When it becomes unwieldy:

1. **Preserve recent segments in full** (last 2-3)
2. **Compress older segments** into key decisions only
3. **Archive ancient history** as bullet points

```markdown
## Recent Segments (full detail)

[Segments 7-9]

## Earlier Segments (compressed)

- Segment 4-6: Completed initial implementation review, approved with minor fixes
- Segment 1-3: Established review criteria, approved design doc

## Key Historical Decisions

- Chose JWT over session tokens (segment 2)
- Established 80% coverage threshold (segment 1)
```

### 4.2 When Task Context is Large

If you receive very large task context (big code blocks, long documents):

1. **Don't try to hold it all** — reference by location
2. **Note what you examined** — "Reviewed lines 1-200, focused on auth flow"
3. **Record specific locations** — future sessions can re-examine if needed

---

## 5. Signaling to the VM

The OpenProse VM reads your output to determine next steps. Help it by being clear:

### 5.1 Decision Signals

When you make a decision that affects control flow, be explicit:

```
DECISION: Proceed with implementation
RATIONALE: Plan addresses all concerns raised in previous review
```

or

```
DECISION: Request revision
ISSUES:
1. [specific issue]
2. [specific issue]
REQUIRED CHANGES: [what needs to happen]
```

### 5.2 Concern Signals

When you notice something that doesn't block progress but should be tracked:

```
CONCERN: [specific concern]
SEVERITY: [low/medium/high]
TRACKING: [what to watch for]
```

### 5.3 Completion Signals

When your segment is complete:

```
SEGMENT COMPLETE
MEMORY UPDATES:
- [what to add to Current Understanding]
- [decisions to record]
- [concerns to track]
READY FOR: [what should happen next]
```

---

## 6. Writing Output Files

When using file-based state (see `../state/filesystem.md`), the VM tells you where to write your output. You must write your results directly to the filesystem.

### 6.1 Binding Output Files

For regular sessions with output capture (`let x = session "..."`), write to the specified binding path:

**Path format:** `.prose/runs/{run-id}/bindings/{name}.md`

**File format:**

````markdown
# {name}

kind: {let|const|output|input}

source:

```prose
{the source code that created this binding}
```
````

---

{Your actual output here}

````

**Example:**

```markdown
# research

kind: let

source:
```prose
let research = session: researcher
  prompt: "Research AI safety"
````

---

AI safety research covers several key areas:

1. **Alignment** - Ensuring AI systems pursue intended goals
2. **Robustness** - Making systems resilient to edge cases
3. **Interpretability** - Understanding how models make decisions

Key papers include Amodei et al. (2016) on concrete problems...

````

### 6.2 Anonymous Session Output

Sessions without explicit capture (`session "..."` without `let x =`) still produce output. These are written with `anon_` prefix:

**Path:** `.prose/runs/{run-id}/bindings/anon_001.md`

The VM assigns sequential numbers. Write the same format but note the binding came from an anonymous session:

```markdown
# anon_003

kind: let

source:
```prose
session "Analyze the codebase for security issues"
````

---

Security analysis found the following issues...

````

### 6.3 Persistent Agent Memory Output

If you are a persistent agent (invoked with `resume:`), you have additional responsibilities:

1. **Read your memory file first**
2. **Process the task using memory + context**
3. **Update your memory file** with compacted state
4. **Write a segment file** recording this session

**Memory file path:** `.prose/runs/{run-id}/agents/{name}/memory.md` (or `.prose/agents/{name}/` for project-scoped)

**Segment file path:** `.prose/runs/{run-id}/agents/{name}/{name}-{NNN}.md`

**Memory file format:**

```markdown
# Agent Memory: {name}

## Current Understanding

{Your accumulated knowledge about the project/task}

## Decisions Made

- {date}: {decision} — {rationale}
- {date}: {decision} — {rationale}

## Open Concerns

- {Concern 1}
- {Concern 2}
````

**Segment file format:**

```markdown
# Segment {NNN}

timestamp: {ISO8601}
prompt: "{the prompt for this session}"

## Summary

- Reviewed: {what you examined}
- Found: {specific findings}
- Decided: {specific decisions}
- Next: {what should happen next}
```

### 6.4 Output Writing Checklist

Before completing your session:

- [ ] Write your output to the specified binding path
- [ ] If persistent agent: update memory.md
- [ ] If persistent agent: write segment file
- [ ] Use the exact file format specified
- [ ] Include the source code snippet for traceability

---

## Summary

As a subagent in an OpenProse program:

1. **Understand your context layers** — outer state, memory, task context
2. **Build on your memory** — you have continuity, use it
3. **Compact, don't summarize** — preserve specifics, drop reasoning chains
4. **Signal clearly** — help the VM understand your decisions
5. **Test your compaction** — would future-you understand exactly what happened?
6. **Write output files** — when in file-based mode, write to the paths you're given

Your memory is what makes you persistent. Treat it as carefully as you'd treat any important document—because future-you depends on it.
