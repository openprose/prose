---
role: best-practices
summary: |
  Design patterns for robust, efficient, and maintainable OpenProse programs.
  Read this file when authoring new programs or reviewing existing ones.
see-also:
  - ../prose.md: Execution semantics, how to run programs
  - ../prosescript.md: Imperative syntax for .prose files and execution blocks
  - ../contract-markdown.md: Contract Markdown authoring surface
  - antipatterns.md: Patterns to avoid
---

# OpenProse Design Patterns

This document catalogs proven patterns for orchestrating AI agents effectively. Each pattern addresses specific concerns: robustness, cost efficiency, speed, maintainability, or self-improvement capability.

Most examples use ProseScript because control-flow patterns are easiest to show
imperatively. When authoring canonical Contract Markdown, translate patterns
into contracts first:

| Pattern Need | Prefer in Contract Markdown | Use ProseScript When |
|--------------|-----------------------------|----------------------|
| Independent services | `### Services` plus matching `### Requires` / `### Ensures` | Exact branch order or join policy matters |
| Collection guarantees | `each ...` postconditions in `### Ensures` | Per-item ordering, batching, or recovery matters |
| Retry or refinement | `### Strategies`, `### Errors`, conditional `### Ensures`, or a composite | The loop count, stop condition, or recovery path must be pinned |
| Specialized roles | One service per role with `### Shape` and `### Runtime` | The role is a one-off standalone `.prose` agent |
| Reusable topology | A `kind: composite` with slots and config | The topology is local and not worth naming |

---

## Structural Patterns

#### parallel-independent-work

When tasks have no data dependencies, execute them concurrently. This maximizes throughput and minimizes wall-clock time.

```prose
# Good: Independent research runs in parallel
parallel:
  market = session "Research market trends"
  tech = session "Research technology landscape"
  competition = session "Analyze competitor products"

session "Synthesize findings"
  context: { market, tech, competition }
```

The synthesis session waits for all branches, but total time equals the longest branch rather than the sum of all branches.

Contract Markdown equivalent:

```markdown
---
name: landscape-review
kind: program
---

### Services

- `market-researcher`
- `tech-researcher`
- `competition-analyst`
- `synthesizer`

### Requires

- `brief`: what landscape to investigate

### Ensures

- `report`: synthesized market, technology, and competition review
```

Each researcher requires `brief` and ensures a distinct output. The synthesizer
requires those outputs. Forme can infer that the three researchers are
parallelizable because they depend only on caller input.

#### fan-out-fan-in

For processing collections, fan out to parallel workers then collect results. Use `parallel for` instead of manual parallel branches.

```prose
let topics = ["AI safety", "interpretability", "alignment", "robustness"]

parallel for topic in topics:
  session "Deep dive research on {topic}"

session "Create unified report from all research"
```

This scales naturally with collection size and keeps code DRY.

#### pipeline-composition

Chain transformations using pipe operators for readable data flow. Each stage has a single responsibility.

```prose
let candidates = session "Generate 10 startup ideas"

let result = candidates
  | filter:
      session "Is this idea technically feasible? yes/no"
        context: item
  | map:
      session "Expand this idea into a one-page pitch"
        context: item
  | reduce(best, current):
      session "Compare these two pitches, return the stronger one"
        context: [best, current]
```

#### agent-specialization

Define agents with focused expertise. Specialized agents produce better results than generalist prompts.

```prose
agent security-reviewer:
  model: balanced
  prompt: """
    You are a security expert. Focus exclusively on:
    - Authentication and authorization flaws
    - Injection vulnerabilities
    - Data exposure risks
    Ignore style, performance, and other concerns.
  """

agent performance-reviewer:
  model: balanced
  prompt: """
    You are a performance engineer. Focus exclusively on:
    - Algorithmic complexity
    - Memory usage patterns
    - I/O bottlenecks
    Ignore security, style, and other concerns.
  """
```

Contract Markdown equivalent:

```markdown
---
name: security-reviewer
kind: service
---

### Runtime

- `model`: balanced

### Shape

- `self`: authentication, authorization, injection, and data exposure risks
- `prohibited`: style review, performance review, product prioritization

### Requires

- `code`: code to inspect

### Ensures

- `security-findings`: security issues with severity and evidence
```

Use `### Shape` to create the role boundary. Use `### Runtime` only for runtime
hints such as persistence or model tier.

#### reusable-blocks

Extract repeated workflows into parameterized blocks. Blocks are the functions of OpenProse.

```prose
block review-and-revise(artifact, criteria):
  let feedback = session "Review {artifact} against {criteria}"
  session "Revise {artifact} based on feedback"
    context: feedback

# Reuse the pattern
do review-and-revise("the architecture doc", "clarity and completeness")
do review-and-revise("the API design", "consistency and usability")
do review-and-revise("the test plan", "coverage and edge cases")
```

---

#### declarative-each

Express collection processing as a postcondition rather than a loop. The `each` construct belongs in `### Ensures` — it declares that every item must satisfy a property, without prescribing how to get there.

**Pinned imperative (execution block):**

```prose
for each article in articles:
  session "Summarize article and score relevance"
    context: article
```

**Declarative (contract):**

```markdown
### Ensures

- `articles`: collected articles from the feed
- each article has: a summary, a relevance score (0-1), and key claims extracted
```

The imperative version prescribes sequential iteration. The declarative version states the end condition and lets the model (or Forme) decide whether to iterate, fan out, or batch. A smarter model can satisfy the same contract more efficiently — this is the "bitter lesson" principle (tenet 14) applied to collections.

Use declarative `each` when the processing strategy doesn't matter to the caller. Use explicit iteration in an execution block when ordering, batching, or error handling per item requires author control.

---

## Robustness Patterns

#### bounded-iteration

Always constrain loops with `max:` to prevent runaway execution. Even well-crafted conditions can fail to terminate.

```prose
# Good: Explicit upper bound
loop until **all tests pass** (max: 20):
  session "Identify and fix the next failing test"

# The program will terminate even if tests never fully pass
```

#### graceful-degradation

Use `on-fail: "continue"` when partial results are acceptable. Collect what you can rather than failing entirely.

```prose
parallel (on-fail: "continue"):
  primary = session "Query primary data source"
  backup = session "Query backup data source"
  cache = session "Check local cache"

# Continue with whatever succeeded
session "Merge available data"
  context: { primary, backup, cache }
```

#### retry-with-backoff

External services fail transiently. Retry with exponential backoff to handle rate limits and temporary outages.

```prose
session "Call external API"
  retry: 5
  backoff: "exponential"
```

For critical paths, combine retry with fallback:

```prose
try:
  session "Call primary API"
    retry: 3
    backoff: "exponential"
catch:
  session "Use fallback data source"
```

Contract Markdown equivalent:

```markdown
### Ensures

- `data`: validated data from the primary source
- if the primary source is unavailable: validated fallback data with provenance and caveats

### Errors

- `no-data`: neither primary nor fallback source produced usable data

### Strategies

- when the primary source times out: retry with exponential backoff before using fallback
- when fallback data is stale: include freshness caveats in `data`
```

Use this declarative form when the caller cares about the acceptable outcomes.
Use a `### Execution` block when the exact retry count, backoff schedule, or
fallback order must be pinned.

#### error-context-capture

Capture error context for intelligent recovery. The error variable provides information for diagnostic or remediation sessions.

```prose
try:
  session "Deploy to production"
catch as err:
  session "Analyze deployment failure and suggest fixes"
    context: err
  session "Attempt automatic remediation"
    context: err
```

#### defensive-context

Validate assumptions before expensive operations. Cheap checks prevent wasted computation.

```prose
let prereqs = session "Check all prerequisites: API keys, permissions, dependencies"

if **prerequisites are not met**:
  session "Report missing prerequisites and exit"
    context: prereqs
  throw "Prerequisites not satisfied"

# Expensive operations only run if prereqs pass
session "Execute main workflow"
```

#### idempotent-scheduled-intake

A scheduled service that re-runs nightly, weekly, or whenever should produce the
same result when replayed on the same window. Re-runs must not double-count,
corrupt cumulative memory, or publish the same draft twice. State this
explicitly as a `### Strategies` bullet and write the code to honor it.

```markdown
### Strategies

- **idempotence**: re-running with the same `since` window is safe — source
  logs are immutable once written, so parsed counts are stable. The
  cumulative registry merge is idempotent (an entry seen twice updates
  `last_seen` but does not double-count). A failed run that never reaches
  the memory write leaves state untouched, so the next run reprocesses the
  same window cleanly.
```

Concrete rules that usually follow from this commitment:

- The memory write is **the last step** — fail loudly before the write, not after.
- Dedupe keys are canonical (e.g., a GitHub `login`, not a display name).
- Deltas are computed from caller-supplied `previous_*` inputs, not from
  wall-clock comparisons the service reads on its own.
- Human-review gates sit between drafts and published posts, so a replayed
  draft cannot produce a duplicate external effect.

#### top-level-cursor-emission

Anything a downstream consumer needs to be idempotent — high-water marks,
cursor tokens, run IDs, `last_processed_at` timestamps — belongs at the **top
level** of `### Ensures`, not nested inside a `memory_update` sub-object.

```markdown
### Ensures

- `high_water_mark`: the newest `starred_at` processed this run (ISO timestamp)
- `records`: classified stargazer records
- `memory_update`: opaque object written to project memory
```

Memory is for the next invocation of the same service. The return value is for
the next responsibility in the pipeline. Burying a cursor inside
`memory_update` forces every downstream caller to know the memory schema of
the upstream service — exactly the coupling that tenet 16 (components don't
discover each other) forbids. Promote cursor fields to the contract surface.

---

## Cost Efficiency Patterns

#### model-tiering

Match model capability to task complexity:

| Capability Tier | Best For | Examples |
|-----------------|----------|----------|
| **Balanced orchestrator** | Orchestration, control flow, coordination | VM execution, captain's chair, workflow routing |
| **Deep reasoner** | Hard work requiring broad context or novel reasoning | Complex analysis, strategic decisions, ambiguous architecture |
| **Fast specialist** | Simple, self-evident transformations | Classification, formatting, extraction with clear criteria |

**Key insight:** orchestration usually needs reliability and structure more than
maximum depth. Reserve the deepest model available for genuinely hard
intellectual work. Use fast models only when the acceptance criteria are crisp
and the cost of a mistake is low.

**Detailed task-to-model mapping:**

| Task Type | Tier | Rationale |
|-----------|------|-----------|
| Orchestration, routing, coordination | Balanced orchestrator | Follows structure and manages state well |
| Investigation, debugging, diagnosis | Balanced orchestrator or deep reasoner | Escalate when evidence is sparse or ambiguous |
| Triage, classification, categorization | Fast specialist or balanced orchestrator | Clear criteria, deterministic decisions |
| Code review, verification checklist | Balanced orchestrator | Follows defined review criteria |
| Simple implementation, fixes | Balanced orchestrator | Applies known patterns |
| Complex multi-file synthesis | Deep reasoner | Needs to hold many things in context |
| Novel architecture, strategic planning | Deep reasoner | Requires creative problem-solving |
| Ambiguous problems, unclear requirements | Deep reasoner | Needs to reason through uncertainty |

Map these tiers to the models available in the current host. For example, a
Claude host might map balanced/deep/fast to Sonnet/Opus/Haiku. A Codex host
might map them to medium-reasoning, high-reasoning, and mini agents. The program
should name capability intent when portability matters.

```prose
agent captain:
  model: balanced  # Orchestration and coordination
  persist: true  # Execution-scoped (dies with run)
  prompt: "You coordinate the team and review work"

agent researcher:
  model: deep  # Hard analytical work
  prompt: "You perform deep research and analysis"

agent formatter:
  model: fast  # Simple transformation with crisp acceptance criteria
  prompt: "You format text into consistent structure"

agent preferences:
  model: balanced
  persist: user  # User-scoped (survives across projects)
  prompt: "You remember user preferences and patterns"

# Captain orchestrates, specialists do the hard work
session: captain
  prompt: "Plan the research approach"

let findings = session: researcher
  prompt: "Investigate the technical architecture"

resume: captain
  prompt: "Review findings and determine next steps"
  context: findings
```

#### context-minimization

Pass only relevant context. Large contexts slow processing and increase costs.

```prose
# Bad: Passing everything
session "Write executive summary"
  context: [raw_data, analysis, methodology, appendices, references]

# Good: Pass only what's needed
let key_findings = session "Extract key findings from analysis"
  context: analysis

session "Write executive summary"
  context: key_findings
```

#### early-termination

Exit loops as soon as the goal is achieved. Don't iterate unnecessarily.

```prose
# The condition is checked each iteration
loop until **solution found and verified** (max: 10):
  session "Generate potential solution"
  session "Verify solution correctness"
# Exits immediately when condition is met, not after max iterations
```

#### early-signal-exit

When observing or monitoring, exit as soon as you have a definitive answer—don't wait for the full observation window.

```prose
# Good: Exit on signal
let observation = session: observer
  prompt: "Watch the stream. Signal immediately if you detect a blocking error."
  timeout: 120s
  early_exit: **blocking_error detected**

# Bad: Fixed observation window
loop 30 times:
  resume: observer
    prompt: "Keep watching..."  # Even if error was obvious at iteration 2
```

This respects signals when they arrive rather than waiting for arbitrary timeouts.

#### defaults-over-prompts

For standard configuration, use constants or environment variables. Only prompt when genuinely variable.

```prose
# Good: Sensible defaults
const API_URL = "https://api.example.com"
const TEST_PROGRAM = "# Simple test\nsession 'Hello'"

# Slower: Prompting for known values
let api_url = input "Enter API URL"  # Usually the same value
let program = input "Enter test program"  # Usually the same value
```

If 90% of runs use the same value, hardcode it. Let users override via CLI args if needed.

#### race-for-speed

When any valid result suffices, race multiple approaches and take the first success.

```prose
parallel ("first"):
  session "Try algorithm A"
  session "Try algorithm B"
  session "Try algorithm C"

# Continues as soon as any approach completes
session "Use winning result"
```

#### batch-similar-work

Group similar operations to amortize overhead. One session with structured output beats many small sessions.

```prose
# Inefficient: Many small sessions
for file in files:
  session "Analyze {file}"

# Efficient: Batch analysis
session "Analyze all files and return structured findings for each"
  context: files
```

#### cheap-floor-first

When a service composes a free signal (a local CLI, a cached file, a value
already in memory) with a metered one (a paid search API, a scraper that
charges per call), populate the free floor for **every** item before spending
any metered budget on the top slice.

```prose
# Good: free CLI first, metered Exa after
let with_floor = parallel for star in stargazers:
  let gh_meta = call gh-profile-fetcher  # free (local gh CLI)
    login: star.login
  yield { ...star, gh_meta }

let to_enrich = pick top 10 from with_floor by signal

let enriched = parallel for star in to_enrich:
  let exa = try call exa-enricher  # metered
    query: star.gh_meta.profile_url
  yield { ...star, exa }
```

Why this matters: the deferred bucket (items that never got metered
enrichment) is only actionable if every item has *some* signal. A run that
defers the bottom 80% with nothing but a username produces a black-hole
cohort downstream can't triage. Populating the cheap floor first keeps the
deferred bucket shippable and preserves the option to spend more budget
later without re-running the free step.

This pattern generalizes: local `gh`/`git` before paid web search; filesystem
cache before network fetch; in-context rule check before a paid judge call.

---

## Self-Improvement Patterns

#### self-verification-in-prompt

For tasks that would otherwise require a separate verifier, include verification as the final step in the prompt. This saves a round-trip while maintaining rigor.

```prose
# Good: Combined work + self-verification
agent investigator:
  model: balanced
  prompt: """Diagnose the error.
  1. Examine code paths
  2. Check logs and state
  3. Form hypothesis
  4. BEFORE OUTPUTTING: Verify your evidence supports your conclusion.

  Output only if confident. If uncertain, state what's missing."""

# Slower: Separate verifier agent
let diagnosis = session: researcher
  prompt: "Investigate the error"
let verification = session: verifier
  prompt: "Verify this diagnosis"  # Extra round-trip
  context: diagnosis
```

Use a separate verifier when you need genuine adversarial review (different perspective), but for self-consistency checks, bake verification into the prompt.

#### iterative-refinement

Use feedback loops to progressively improve outputs. Each iteration builds on the previous.

```prose
let draft = session "Create initial draft"

loop until **draft meets quality bar** (max: 5):
  let critique = session "Critically evaluate this draft"
    context: draft
  draft = session "Improve draft based on critique"
    context: [draft, critique]

session "Finalize and publish"
  context: draft
```

#### multi-perspective-review

Gather diverse viewpoints before synthesis. Different lenses catch different issues.

```prose
parallel:
  user_perspective = session "Evaluate from end-user viewpoint"
  tech_perspective = session "Evaluate from engineering viewpoint"
  business_perspective = session "Evaluate from business viewpoint"

session "Synthesize feedback and prioritize improvements"
  context: { user_perspective, tech_perspective, business_perspective }
```

#### adversarial-validation

Use one agent to challenge another's work. Adversarial pressure improves robustness.

```prose
let proposal = session "Generate proposal"

let critique = session "Find flaws and weaknesses in this proposal"
  context: proposal

let defense = session "Address each critique with evidence or revisions"
  context: [proposal, critique]

session "Produce final proposal incorporating valid critiques"
  context: [proposal, critique, defense]
```

#### consensus-building

For critical decisions, require agreement between independent evaluators.

```prose
parallel:
  eval1 = session "Independently evaluate the solution"
  eval2 = session "Independently evaluate the solution"
  eval3 = session "Independently evaluate the solution"

loop until **evaluators agree** (max: 3):
  session "Identify points of disagreement"
    context: { eval1, eval2, eval3 }
  parallel:
    eval1 = session "Reconsider position given other perspectives"
      context: { eval1, eval2, eval3 }
    eval2 = session "Reconsider position given other perspectives"
      context: { eval1, eval2, eval3 }
    eval3 = session "Reconsider position given other perspectives"
      context: { eval1, eval2, eval3 }

session "Document consensus decision"
  context: { eval1, eval2, eval3 }
```

---

## Maintainability Patterns

#### descriptive-agent-names

Name agents for their role, not their implementation. Names should convey purpose.

```prose
# Good: Role-based naming
agent code-reviewer:
agent technical-writer:
agent data-analyst:

# Bad: Implementation-based naming
agent opus-agent:
agent session-1-handler:
agent helper:
```

#### prompt-as-contract

Write prompts that specify expected inputs and outputs. Clear contracts prevent misunderstandings.

```prose
agent json-extractor:
  model: fast
  prompt: """
    Extract structured data from text.

    Input: Unstructured text containing entity information
    Output: JSON object with fields: name, date, amount, status

    If a field cannot be determined, use null.
    Never invent information not present in the input.
  """
```

#### separation-of-concerns

Each session should do one thing well. Combine simple sessions rather than creating complex ones.

```prose
# Good: Single responsibility per session
let data = session "Fetch and validate input data"
let analysis = session "Analyze data for patterns"
  context: data
let recommendations = session "Generate recommendations from analysis"
  context: analysis
session "Format recommendations as report"
  context: recommendations

# Bad: God session
session "Fetch data, analyze it, generate recommendations, and format a report"
```

#### explicit-context-flow

Make data flow visible through explicit context passing. Avoid relying on implicit conversation history.

```prose
# Good: Explicit flow
let step1 = session "First step"
let step2 = session "Second step"
  context: step1
let step3 = session "Third step"
  context: [step1, step2]

# Bad: Implicit flow (relies on conversation state)
session "First step"
session "Second step using previous results"
session "Third step using all previous"
```

---

## Performance Patterns

#### lazy-evaluation

Defer expensive operations until their results are needed. Don't compute what might not be used.

```prose
session "Assess situation"

if **detailed analysis needed**:
  # Expensive operations only when necessary
  parallel:
    deep_analysis = session "Perform deep analysis"
      model: deep
    historical = session "Gather historical comparisons"
  session "Comprehensive report"
    context: { deep_analysis, historical }
else:
  session "Quick summary"
    model: fast
```

#### progressive-disclosure

Start with fast, cheap operations. Escalate to expensive ones only when needed.

```prose
# Tier 1: Fast screening
let initial = session "Quick assessment"
  model: fast

if **needs deeper review**:
  # Tier 2: Balanced analysis
  let detailed = session "Detailed analysis"
    model: balanced
    context: initial

  if **needs expert review**:
    # Tier 3: Deep reasoning
    session "Expert-level analysis"
      model: deep
      context: [initial, detailed]
```

#### work-stealing

Use `parallel ("any", count: N)` to get results as fast as possible from a pool of workers.

```prose
# Get 3 good ideas as fast as possible from 5 parallel attempts
parallel ("any", count: 3, on-fail: "ignore"):
  session "Generate creative solution approach 1"
  session "Generate creative solution approach 2"
  session "Generate creative solution approach 3"
  session "Generate creative solution approach 4"
  session "Generate creative solution approach 5"

session "Select best from the first 3 completed"
```

---

## Composition Patterns

#### workflow-template

Create blocks that encode entire workflow patterns. Instantiate with different parameters.

```prose
block research-report(topic, depth):
  let research = session "Research {topic} at {depth} level"
  let analysis = session "Analyze findings about {topic}"
    context: research
  let report = session "Write {depth}-level report on {topic}"
    context: [research, analysis]

# Instantiate for different needs
do research-report("market trends", "executive")
do research-report("technical architecture", "detailed")
do research-report("competitive landscape", "comprehensive")
```

#### middleware-pattern

Wrap sessions with cross-cutting concerns like logging, timing, or validation.

```prose
block with-validation(task, validator):
  let result = session "{task}"
  let valid = session "{validator}"
    context: result
  if **validation failed**:
    throw "Validation failed for: {task}"

do with-validation("Generate SQL query", "Check SQL for injection vulnerabilities")
do with-validation("Generate config file", "Validate config syntax")
```

#### circuit-breaker

After repeated failures, stop trying and fail fast. Prevents cascading failures.

```prose
let failures = 0
let max_failures = 3

loop while **service needed and failures < max_failures** (max: 10):
  try:
    session "Call external service"
    # Reset on success
    failures = 0
  catch:
    failures = failures + 1
    if **failures >= max_failures**:
      session "Circuit open - using fallback"
      throw "Service unavailable"
```

---

## Observability Patterns

#### checkpoint-narration

For long workflows, emit progress markers. Helps with debugging and monitoring.

```prose
session "Phase 1: Data Collection"
# ... collection work ...

session "Phase 2: Analysis"
# ... analysis work ...

session "Phase 3: Report Generation"
# ... report work ...

session "Phase 4: Quality Assurance"
# ... QA work ...
```

#### structured-output-contracts

Request structured outputs that can be reliably parsed and validated.

```prose
agent structured-reviewer:
  model: balanced
  prompt: """
    Always respond with this exact JSON structure:
    {
      "verdict": "pass" | "fail" | "needs_review",
      "issues": [{"severity": "high"|"medium"|"low", "description": "..."}],
      "suggestions": ["..."]
    }
  """

let review = session: structured-reviewer
  prompt: "Review this code for security issues"
```

---

## Dependency Management Patterns

#### dependency-management

Declare dependencies via `use` statements. Run `prose install` to clone repos into `.deps/`. Commit `prose.lock`, gitignore `.deps/`.

```prose
# Good: Use standard library programs (via shorthand)
use "std/evals/inspector"
use "std/memory/project-memory"

# Good: Use third-party programs with an explicit git host
use "github.com/alice/research-pipeline" as research

let result = research(topic: "quantum computing")
```

Pin versions via `prose.lock`. Run `prose install --update` deliberately — don't update dependencies as a side effect of other work. Review changes to `prose.lock` in code review just like any other code change.

#### stable-imports

Prefer explicit, stable import paths in examples and shared programs. Shorthands can remain convenient in an interactive shell, but published docs should show the path that resolves unambiguously.

```prose
# Good: explicit git host
use "github.com/openprose/prose/packages/std/evals/inspector"

# Also valid (and preferred for readability): std shorthand
use "std/evals/inspector"
```

---

## Summary

The most effective OpenProse programs combine these patterns:

1. **Structure**: Parallelize independent work, use blocks for reuse
2. **Robustness**: Bound loops, handle errors, retry transient failures
3. **Efficiency**: Tier models, minimize context, terminate early
4. **Quality**: Iterate, get multiple perspectives, validate adversarially
5. **Maintainability**: Name clearly, separate concerns, make flow explicit

Choose patterns based on your specific constraints. A quick prototype prioritizes speed over robustness. A production workflow prioritizes reliability over cost. A research exploration prioritizes thoroughness over efficiency.
