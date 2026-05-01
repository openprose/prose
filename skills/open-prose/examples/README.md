---
purpose: OpenProse example systems in Contract Markdown and ProseScript
related:
  - ../SKILL.md
  - ../guidance/README.md
---

# OpenProse Examples

These examples demonstrate OpenProse source files: Contract Markdown in
`*.prose.md` files, with embedded ProseScript in `### Execution` when pinned
choreography is useful.

## Contract Markdown Examples (`*.prose.md`)

### Basics -- Single-Service Files

| File | Description |
|------|-------------|
| `01-hello-world.prose.md` | Simplest possible service -- a single service with no inputs |
| `02-research-and-summarize.prose.md` | Research a topic and produce a summary with strategies |
| `03-code-review.prose.md` | Multi-perspective code review as a single service |
| `04-write-and-refine.prose.md` | Draft and iteratively improve content using strategies |

### Multi-Service Systems (Auto-Wired by Forme)

| Directory | Description |
|-----------|-------------|
| `09-research-with-agents/` | Research pipeline with specialized researcher and writer services |
| `16-parallel-reviews/` | Parallel security, performance, and style reviews with synthesizer |
| `30-captains-chair-simple/` | Captain coordinates executor and critic with shapes |
| `32-automated-pr-review/` | Multi-agent PR review with security, performance, and style |
| `34-content-pipeline/` | Full content creation pipeline: research, write, edit, social media |
| `40-rlm-self-refine/` | Worker-critic pattern: refine until quality threshold |
| `41-rlm-divide-conquer/` | Map-reduce: chunk, analyze, synthesize for large inputs |
| `42-rlm-filter-recurse/` | Filter-then-process for needle-in-haystack tasks |
| `43-rlm-pairwise/` | Pairwise comparison and relationship mapping |

### Execution Block Systems (Level 3)

| Directory | Description |
|-----------|-------------|
| `29-captains-chair/` | Full captain's chair with research, implementation, and review phases |
| `33-pr-review-autofix/` | PR review with auto-fix loop |
| `35-feature-factory/` | Feature implementation: design, implement, test, document |
| `36-bug-hunter/` | Bug investigation: evidence, hypotheses, fix, verify |
| `37-the-forge/` | Build a web browser from scratch -- 9-phase pipeline |
| `39-architect-by-simulation/` | Design systems through simulated implementation phases |
| `47-language-self-improvement/` | Analyze a ProseScript corpus to evolve the language |

### Feature Demonstrations

| File | Description |
|------|-------------|
| `11-skills-and-imports.prose.md` | Git-native dependency imports |
| `12-secure-agent-shapes.prose.md` | Shapes as behavioral boundaries |
| `13-variables-and-context.prose.md` | Auto-wiring from `### Requires` to `### Ensures` |
| `22-error-handling/` | Conditional ensures and declared errors |
| `23-retry-with-backoff.prose.md` | Strategies for resilient calls |
| `24-choice-blocks.prose.md` | Conditional ensures as a declarative alternative to `choice` |
| `25-conditionals.prose.md` | Conditional ensures as a declarative alternative to `if/elif/else` |

### Production Systems

| Directory | Description |
|-----------|-------------|
| `38-skill-scan/` | Security scanner for AI assistant skills/plugins |
| `44-run-endpoint-ux-test/` | Concurrent UX testing of the /run API endpoint |
| `45-plugin-release/` | Plugin release workflow with validation and rollback |
| `46-workflow-crystallizer/` | Extract workflow patterns from conversations into `*.prose.md` |
| `48-habit-miner/` | Mine AI session logs for patterns, generate automations |
| `49-prose-run-retrospective/` | Analyze completed runs for learnings and improvements |
| `50-interactive-tutor.prose.md` | Interactive tutoring with conditional ensures |

### Native Contract Markdown Examples

| File | Description |
|------|-------------|
| `test-demo.prose.md` | Demonstrates `kind: test` with fixtures and assertions |
| `dependency-import/` | Demonstrates importing services from installed dependencies |
| `wiring-declaration.prose.md` | Demonstrates Level 2 explicit wiring (`### Wiring`) |
| `multi-service-single-file.prose.md` | Demonstrates `##` heading delimiters for multiple services |
| `patterns-demo/` | Demonstrates a self-contained worker-critic pattern |

## Running Examples

Run any Contract Markdown example from inside an agent session:

```text
prose run examples/01-hello-world.prose.md
prose run examples/16-parallel-reviews/
prose run examples/37-the-forge/
```

Run a Contract Markdown test:

```text
prose test examples/test-demo.prose.md
```
