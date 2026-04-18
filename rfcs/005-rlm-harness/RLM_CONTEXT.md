# Recursive Language Model: Context Architecture via Heads Up Display

## Overview

This document captures an architecture for building Recursive Language Models (RLMs) based on insights from implementing several RLMs and studying the foundational paper by Alex L. Zhang, Tim Kraska, and Omar Khattab at MIT (arXiv:2512.24601).

### What is an RLM?

At its core, an RLM is a language model that can recursively call itself on chunks of input rather than processing everything at once. Instead of being limited by a fixed context window, the model breaks down a long input into manageable pieces, examines each one, and calls itself again on those pieces. This recursive decomposition is the defining feature—it enables handling of essentially unbounded context lengths.

The Zhang et al. paper proposes RLMs as an inference strategy where the model treats long prompts as part of an external environment and programmatically examines, decomposes, and recursively calls itself over snippets. Their RLM-Qwen3-8B outperforms the base model by ~28.3% on average and approaches GPT-5 quality on long-context tasks, handling inputs well beyond normal context limits (10M+ tokens).

### The Core Reframe: Context as Viewport

A crucial conceptual shift: **the context window is not a prompt—it's a viewport into a potentially massive environment.** The "context" in RLM thinking is not just a prompt, even a massive one. It could be an entire library, an entire codebase, the whole universe of relevant data. We need to get away from thinking of it as "the prompt."

The model's context is its **field of vision**, bandwidth-limited by context length on any given pass of intelligence (and there are many, many passes in the system). The context length is the bandwidth constraint—and the model may not even use the full context length on a given pass. It may just be looking at a piece of it.

Across recursive calls, the model builds understanding by taking different passes through the environment, each time examining a different slice.

---

## The Heads-Up Display (HUD)

The entire input context is structured as a **HUD**—a heads-up display that the model "sees" when it wakes up. The metaphor is deliberate: the model is waking up in the middle of a black box. It opens its eyes, and it immediately sees the HUD that surrounds everything and frames everything. The HUD needs to orient it completely.

The HUD is wrapped in a top-level XML tag (e.g., `<open_pres>`)—a branded outer wrapper that signals a break from the model's normal mode of operation and snaps it into the RLM paradigm.

### Why XML?

XML provides the scaffolding, the frame of reference, so the model knows what it's looking at and how to navigate. The nested, collapsible structure of XML maps naturally to the hierarchical nature of the HUD.

### The Fractal Structure

The HUD follows a **fractal pattern**:

- It **opens with the most compressed version of the whole**—a map of everything that's coming, like a table of contents. This orients the model immediately in the first several tokens.
- Each subsequent layer **zooms in with increasing detail**—the map gets richer and richer the deeper you go.
- The middle contains the **highest-granularity version**—the actual observed environment data, which is the **source of truth**.
- It then **collapses back down** toward the end, returning to compressed summaries.

This fractal design serves a specific purpose: **model attention dynamics**. Models pay strongest attention to the beginning and end of context (primacy and recency bias), with weaker attention in the middle. This mirrors how human attention works too. The fractal structure ensures that critical framing information appears at high-attention positions, while the detailed source-of-truth data sits in the middle where it can be referenced as needed.

**The distinction between source of truth and summaries must be clear.** Summaries elsewhere in the HUD are compressed representations of the ground truth, not independent sources. The model needs to understand which is which—the environment frame contains the source of truth, and synthesized summaries are labeled as such.

### HUD Components (nested in XML)

#### 1. Responsibility & Return Contract

This is the **most important** element—and the one most easily forgotten. Before the model even looks at the environment or understands the system, it needs to know what it's responsible for.

- **What is everyone else expecting you to ensure?** This is not instructions. It's a responsibility—accountability to the broader system.
- **What is the expected return value?** The responsibility section includes a description of what "done" looks like: the format, structure, and content of the expected return. This frames all subsequent exploration and decision-making. The model knows from the start what success looks like and what it needs to deliver back.

#### 2. System Purpose

- High-level description of the broader system the model is operating within.
- "Orient me—what is the high-level system I'm acting in?"
- This provides the mission briefing before any data is shown.

#### 3. Environmental Context

- How does this particular slice of the environment fit into the larger whole?
- "Help me understand how this slice fits into the bigger piece—the universe."
- This is the map that places the current viewport in context.

Together, the system purpose and environmental context give the model both the **mission briefing and the map**.

#### 4. Current Environment State (Source of Truth)

- The actual observed data at the highest granularity.
- "What do I see? Give me everything that my parent wants me to see as I'm waking up here."
- This is what the model's parent (or the top-level system) wants it to see right now.

#### 5. Action History

- What's been tried, what happened. Code written, results observed.
- This is the trajectory of exploration so far.
- **Critical design decision**: Action history gets folded into the XML structure inside the HUD—it is NOT left as separate user/assistant chat messages appended outside the structure. The entire context, including exploration history, must live within the XML. This matters enormously for delegation (see below).

#### 6. Available Actions (The Xbox Controller)

The model needs an "Xbox controller"—buttons to explore and interact with its environment. These are the actuators.

**Standard tooling:**

- Bash and command-line tools (the classic production code toolset—very broad)
- File editing
- Code execution
- General OS-level interaction—the model gets the whole operating system as its environment

**Special distinct actions (first-class, not buried in code):**

- **Return**: Invoked directly when the model is ready to deliver its result. **Key insight from implementation experience: this must NOT be a function called from within code.** An earlier implementation made this mistake—having code call a return function. The return action should be its own top-level invocation that the model reaches for explicitly when it's done. This was wrong on the first pass and will not be repeated.

- **RLM Delegation**: Invoke a new instance of itself to handle a subtask. This is also a first-class action, prominently called out—**not just another bash command or code operation**. One of the key concerns with current-generation RLMs is that models don't reach for the RLM tool enough because it blends into the environment. It's not strongly called out. The RLM function needs to be its own distinct call, almost like a special button that stands apart from the standard tooling.

#### 7. Program Registry

The HUD includes a **registry** of programs the node can delegate to. Each registry entry is a program's **public face**: its name, its `requires`/`ensures` contract, and a short description of when to reach for it. Bodies are not included—only the signatures. This is the classic signature-vs-implementation split applied to RLM programs.

The registry is a first-class HUD section. Like everything else in the HUD, it inherits via the spread operator when a child is spawned; children can augment it when they discover new capabilities; deltas back to the parent can include registry updates.

Critically, the registry is **not a pre-wired manifest**. Exploration itself is how the registry grows (see "Programs as First-Class Values" below). A parent describes a need by contract; the runtime resolves it against the registry at delegation time.

### Attention Dynamics and Repetition

Because of primacy/recency attention bias, key elements should be **restated at strategic points**:

- Critical framing (responsibility, available actions) appears **at the beginning** before the environment data.
- The same elements are **restated right before the response zone** (the end) to ensure they stay in focus.
- The fractal structure naturally handles this—compressed versions at the edges, expanded detail in the middle.

---

## The Core Loop: Act, Think, Observe

The model operates in a cycle within its context window:

1. **Think** — Output reasoning tokens, plan the next move.
2. **Act** — Write and execute code to explore or interact with the environment.
3. **Observe** — Code results are injected back into the context so the model sees them.
4. Repeat until ready to **return**.

The model is not passive—it has agency. It can execute actions, observe the results, learn from them within the session, and make better decisions. It's a loop: act, observe, learn, repeat.

This is the key insight from Zhang and Khattab: **the ability to write code in order to observe the environment is really important.** Code gives the model precision and repeatability in its exploration. The "Xbox controller" is primarily bash and code execution.

### Context as a Single Rebuilt Block

The entire system prompt (HUD + action history) is **rebuilt as a single XML block on every iteration**. There are no separate user/assistant message threads—everything is pure completion within the XML structure. The exploration commands, code outputs, and reasoning all get folded into XML blocks inside the HUD.

This was a deliberate design choice. Leaving action history as chat messages appended outside the XML structure is undesirable because:

- It breaks the clean hierarchical structure.
- It makes delegation messy (the inner RLM would inherit a jumble of messages rather than a clean context).
- It conflicts with the principle that everything should be wrappable in JSON-free XML.

### Growth and the Append-vs-Update Question

As the model acts and observes, the context grows. An important early design question was: **should new observations be appended to the HUD, or should the HUD itself be updated?**

The ideal would be to update the HUD—refreshing what the model sees based on what it's learned, keeping things tight and meaningful. But the risk is **losing the existing environment state** from before the action was taken. You don't want to lose what you knew before.

**Resolution for now**: Just append. Keep the original environment snapshot, add the action taken, add the response received. Let the context grow with the full trajectory. The compaction/optimization step can come later (and as it turns out, delegation itself solves this—see below).

---

## Compaction: The Two-Step Loop (and Why It Gets Replaced)

### Original Framing: Act-Observe with Periodic Synthesis

An early version of the architecture introduced a two-step loop: an **actor model** and an **observer/synthesizer model**. The actor explores (act, think, act, think), and periodically a synthesis step occurs—a second model call that integrates what was learned back into the HUD structure, updating the fractal map at various levels.

This raised several concerns:

- **Who does the synthesis?** If a smaller/faster model does it for efficiency, it might miss subtle observations that matter for the outer context. Subtle things can be important for the broader picture.
- **Which parts of the map need updating?** The very top of the context (system purpose, responsibilities) is unlikely to change from most observations. But if the model discovers something deeply inconsistent with the top-level framing, that could "wreck" the outer context. So you can't just protect top-level elements from updates.
- **Cadence**: You don't want to compact after every single turn (too expensive), but you can't let it go too long or the context becomes incoherent. Every few turns felt right as a starting point.
- **Labeling**: If a fast model writes the summaries, they should be clearly labeled as summaries (not source of truth) so the main model understands the difference.

### The Elegant Resolution: Delegation IS Compaction

This complexity collapses once you realize that **compaction is just an RLM call where you override the environment/history section with a summarized version.** It's the same mechanism as delegation—spread the parent HUD, override the relevant blocks, invoke.

This means:

- There's no separate compaction step.
- There's no second model with a different role.
- It's all one recursive mechanism.
- When the outer model delegates, it **curates** the environment for the inner RLM—zooming in on relevant details, filtering noise, stitching together disparate pieces. This is more powerful than compaction because it's not just shrinking, it's **intelligent curation** of the environment itself.

---

## Delegation via Recursive Calls

### The Spread Operator Pattern

When the outer model delegates to an inner RLM, it uses a **spread operator** pattern (borrowing the JavaScript metaphor):

```
{ ...parentHUD, responsibility: newResponsibility, returnContract: newReturnContract, environment: curatedSlice, registry: scopedRegistry }
```

- The inner RLM **inherits the full parent HUD**—including the complete trajectory of where the outer model got to.
- The **caller specifies the overrides**. The inner model doesn't decide its own overrides—the outer model does. It's the outer model saying: "here's what I'm delegating, here's the updated responsibility and return I want, take everything else from my context."
- Typically overridden: responsibility, return contract, a curated/focused view of the environment, and a scoped registry of callees available to the child.
- The registry is usually *narrowed* for the child—the child only sees the programs it could plausibly need—but children can also register new programs they discover during their own exploration.
- Everything else carries over unchanged.

This is an efficient way of delegating: "You get everything I get. I can even pass you the entire environment I can see."

### Forking History

When the outer RLM delegates, it's essentially **forking its own history**. The inner RLM receives the full context—all the exploration, all the observations—and then operates within the narrowed responsibility before returning.

### Scoped HUD Instances (No Global State)

Each RLM invocation gets its **own HUD instance**—not a global singleton. When you call a sub-RLM and pass overrides, you're creating a new scoped HUD for that context, not mutating a shared one.

Implementation approach: pass the HUD as a parameter or wrap it in a closure. Each RLM call gets its own scoped copy. Modifications create a new HUD rather than mutating the original—immutable by default. This prevents accidental global state pollution and keeps each delegation cleanly isolated.

### Delegation as Environment Curation

The delegating model's job is to **focus the attention of the inner model** on just the thing it needs to worry about and not all the other stuff being delegated to other instances. It can:

- **Zoom in** on relevant environment details.
- **Filter out** noise and irrelevant history.
- **Stitch together disparate pieces** of the environment that are relevant to the subtask.

This isn't just telescoping or microscoping—it can involve bringing in pieces from different parts of the environment. The synthesis step is key because it saves context, saves attention, and provides a much better alternative to mechanical compaction.

---

## The Abstraction Layer Problem (and Its Resolution)

### The Tension

A core tension emerged: the model needs to specify complex delegation patterns (loops, fan-outs, conditional spawning) at the **code level**, but those delegations involve overrides to the HUD structure that lives at the **XML/system-prompt level**. You're crossing abstraction boundaries—code logic reaching up to modify the structural HUD.

This is uncomfortable because the spread operator pattern lives in XML territory, but the code is invoking it. How do you keep these worlds clean?

### Why Code-Level Delegation is Necessary

Despite the discomfort, delegation **must** be expressible in code. This is one of Zhang's key insights, emphasized in his follow-up writing: you need programming constructs to express intelligent delegation strategies.

For example: "Loop over this directory. For every file, spin out a sub-RLM." You need loops, conditionals, all the standard constructs so the model can write intelligent fan-out patterns based on what it observes. Without code, you can't express this.

This is also what makes the embedded-in-code approach powerful for map-reduce patterns—you can write code that involves chunking and multiple mappings to inner RLMs.

### The Resolution: HUD as a JavaScript Object

The abstraction layer problem is solved by **exposing the HUD as a first-class variable in the JavaScript/code environment**. The HUD becomes a concrete, tangible object within the code world:

- Code can reference HUD fields directly.
- The spread-and-override pattern is naturally expressible: `{ ...HUD, responsibility: "new task" }`.
- Delegation loops work naturally—iterate over items, construct overrides, spawn sub-RLMs.
- No conceptual break between the code layer and the structural layer.

This makes the HUD concrete and learnable. Instead of hoping the model figures out the bridge between code and XML on its own, the HUD is right there as an object it can inspect, modify, and pass along.

**The HUD becomes part of the environment.** By exposing it as a variable, it's no longer a meta-structure that exists outside the code world—it's something the model interacts with like any other piece of its environment.

---

## Complex Delegation Patterns

### Current State: Fan-Out and Map-Reduce

Because delegation happens in code, you get full programming expressiveness. The patterns that are clearly needed:

- **Fan-out / Map-Reduce**: Loop over items, spawn parallel sub-RLMs, collect results. (This is what Claude Code's "tasks" feature does with subagents—fanning out async tasks.)
- **Conditional delegation**: Explore the environment first, then decide what to delegate based on what you find.
- **Async/parallel execution**: Multiple RLMs running concurrently.

### Open Design Space

There's a rich design space around delegation patterns that draws on classical programming paradigms:

- **Sync vs. async**: Does the caller wait or continue?
- **Error handling**: What happens when a sub-RLM fails? (Try-catch, circuit breakers)
- **Reactive patterns**: One RLM's output triggers another (like Excel where certain cells trigger other cells).
- **Scatter-gather**: Fan out, collect partial results, synthesize.
- **Streaming/incremental**: Results flowing back progressively.

The question is which of these actually matter for real use cases and which are overkill. JavaScript's async/await, Promise.all, and error handling patterns are a natural reference point.

### The Planning vs. Reactivity Tension

Should the outer RLM architect a complex computation graph upfront (like an Excel spreadsheet where certain cells trigger others), or should it explore and delegate reactively as it learns?

**Both.** The architecture needs to support both modes:

- **Reactive**: These models are good at environment learning. To learn, you can't specify everything upfront—you need to observe and make decisions on the fly.
- **Planned**: In many scenarios, the model will want to lay out a full computation structure and execute it all at once.

The danger of pure planning is that you lose the adaptive, learning-oriented nature of environment exploration. But the delegation syntax needs to be rich enough for planned computation while the core act-think loop supports reactive exploration.

---

## Programs as First-Class Values

### The Interpreter / Program Split

The architecture cleanly separates two concerns that are often fused:

- **The interpreter** — how a node reads a HUD, decides when to delegate, composes returns. Fixed; identical at every layer of the recursion.
- **The program** — what the node is trying to accomplish on this particular invocation: its responsibility, return contract, and initial environment slice.

The interpreter is program-agnostic. It says nothing about directories, summaries, reports, schedules, or any particular task. The program is injected at invocation time via the HUD's responsibility / return-contract / environment sections. Same relationship as a language runtime to a program running on it: one runtime, many programs.

### Public Face vs. Body

Each program has two surfaces:

- **Public face** — name, `requires`, `ensures`, and a short description of when it's appropriate to call. This is what appears in a parent's registry.
- **Body** — the actual instructions and curated environment that get injected as the child's HUD when delegation happens.

The public face is what *callers* see. The body is what *callees* run. A parent never sees its callees' bodies; a child never sees its siblings. Information hiding across call frames.

### Late-Bound Inversion of Control

The registry is an IoC pattern. Parents don't construct their callees—they describe needs by contract (`requires` / `ensures`), and the runtime resolves matches from the registry.

This is closely analogous to Spring's bean wiring, with one critical difference: Spring resolves eagerly at bootstrap because its universe is static (jars on the classpath). RLMs can't do that—the universe is partially unknown until exploration happens. So RLM resolution is **lazy**: contracts match to programs at delegation time, not at startup.

Concretely:
- No upfront wiring phase that must succeed before execution.
- No global manifest of all programs everywhere.
- The registry is **per-node and per-moment** — a snapshot of what's callable right now, in this scope.

### Exploration Is Wiring

The elegant consequence: there is no phase boundary between "discovering the environment" and "wiring up callees." They are the same activity.

When the outer RLM `ls`'s the environment and sees subdirectories it needs to fan out across, that single observation is simultaneously:

- A new environmental fact (what's on disk),
- A new contract need ("I need something that explores a directory and summarizes"),
- A new registry state (the `explore_directory` program is now in scope because its contract just became relevant),
- A new resolution (bind the call to the registry entry and delegate).

Spring's universe is static. RLM's universe is constructed as it's explored. Wiring is continuous.

### Composability: Programs Take Programs

Once programs are first-class values with public faces, they compose. A program can take another program as an argument—analogous to a higher-order function.

Example: `Scheduled<P>`. A program whose responsibility is "hold P, wait until time T, then invoke P in a fresh session." Scheduled never executes P itself; it only needs P's public face to hand off. This only works because programs are values, not hardcoded branches in the interpreter.

The interpreter never encodes this composability explicitly. It falls out of treating programs as values.

### Why the Registry Lives in the HUD

The registry belongs **in the HUD**, not beside it. This preserves the scoped-HUD-no-global-state property stated above: each node has its own registry instance, which inherits from its parent via the spread operator, can be augmented by children during exploration, and flows back via deltas. No shared mutable global state—just scoped values propagating through the recursion tree.

---

## Key Insights from Building RLMs

_Collected for an upcoming talk on RLMs (approximately 2 months out)._

### 1. Return Must Be a Distinct Action

Don't bury it inside code as a function call. The model should invoke return directly as its own first-class action when it's ready to deliver. Having code call a `return()` function was a mistake on the first implementation pass—it conflates the code execution layer with the RLM control layer.

### 2. One-Shotting an RLM from the Paper Teaches You Nothing

The first time you see the RLM paper, it's tempting to one-shot an implementation and call it done. This produces a working RLM but zero learning. Real understanding comes from intentionally handcrafting multiple RLMs, building them wrong at first (often by a lot), and iterating. It took building two RLMs in a more intentional, handcrafted way to really understand their ins and outs.

### 3. The Paper Defines a Cloud, Not a Point

The RLM paper introduces a new **class of harnesses**, not a single architecture. There are many RLM-ish (or "RLM child") architectures with similar attributes that people have asked Zhang and Khattab about. The critical requirements form a cloud—a spectrum of architectures that share key attributes: code interaction with the environment, observation, and recursive delegation.

### 4. Recursive Call Placement Matters

Burying the RLM call inside code (as the original paper does) makes it map-reducible and powerful for chunking and multiple mappings. There's likely an entire unexplored tree of RLM use cases that leverage this embedded approach.

However, embedding the call in code makes **models less willing to delegate**. It blends into the environment and doesn't stand out as a special capability. Placing RLM delegation as a **top-level distinct tool call** (as done in OpenPros) improves delegation behavior. The RLM call should feel like a special button, not just another line of code.

Both approaches have value—the question is which is appropriate for which use case.

### 5. Models Resist Deep Recursion

The original RLM in the paper only went to depth 1. Attempts to break beyond that yielded poor results—models seem to naturally not want to recurse deeply. This may be related to the delegation placement issue: when the recursive call doesn't stand out, models default to handling things themselves rather than delegating.

### 6. You Need to Explain When to Delegate

One of the key challenges is describing to the model **what are the useful scenarios for delegation and what are not**. Models need explicit guidance on when to reach for the RLM tool versus when to keep exploring locally. The trade-off between spinning up another instance versus continuing current exploration needs to be made legible.

---

## Relationship to OpenProse

OpenProse contributes the **contract vocabulary**: `requires` and `ensures` are the lingua franca for programs describing what they need and what they promise. The RLM architecture adopts this vocabulary directly—registry entries and return contracts both use OpenProse semantics.

The RLM architecture intentionally **diverges from OpenProse's Forme phase**. Forme pre-wires a multi-service program by reading all services upfront and producing a wiring manifest before execution. That model is correct for static OpenProse programs where the full graph is knowable. It is the wrong commitment for RLMs, where the graph is discovered during execution. The RLM runtime keeps contract-based resolution but makes it lazy and per-scope (see "Late-Bound Inversion of Control" above).

Other alignments already present in OpenProse:

- RLM delegation as a top-level tool call (not buried in code).
- Fan-out and map-reduce patterns as first-class delegation constructs.

---

## Open Questions

1. **Delegation syntax richness**: Beyond map-reduce and fan-out, what other delegation patterns are actually needed? What can we learn from JavaScript's async patterns, reactive programming, and classical event-driven architectures?

2. **Compaction cadence fallback**: When delegation-as-curation isn't appropriate (e.g., a long exploration with no natural delegation point), how often should explicit compaction occur in the act-think loop? Every few turns was the initial intuition.

3. **Summary labeling and trust**: Summaries synthesized by fast models should be clearly distinguished from source-of-truth environment data. How explicit should this labeling be, and how does the model weigh summaries vs. source data when they conflict?

4. **Fractal map propagation**: When new observations conflict with top-level summaries, how should reconciliation work? Can a small/fast model handle this, or do subtle inconsistencies require the full model's attention? The concern is that subtle things can actually be really important for the outer context.

5. **Model size for synthesis**: If a separate model handles HUD updates/compaction, can it be a smaller, faster model? The worry is that small models miss subtle but important signals. One possible mitigation: clearly label synthesized content as summaries so the main model knows to treat them as compressed approximations, not ground truth.

6. **Depth of recursion**: How do we get models to naturally recurse deeper than depth 1? Is prominent placement of the delegation call sufficient, or are there other architectural changes needed?

7. **The planning problem**: When a model lays out a complex delegation graph upfront vs. exploring reactively—how do you guide it toward the right mode for a given task? Is this something the HUD's responsibility section should address?
